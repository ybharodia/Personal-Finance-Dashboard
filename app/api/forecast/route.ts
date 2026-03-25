// app/api/forecast/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { normalizeMerchantName } from "@/lib/recurring";

const FORECAST_DAYS = 30;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Advance one interval from a given date based on frequency */
function nextOccurrence(from: Date, frequency: string): Date {
  const d = new Date(from);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "biweekly") d.setDate(d.getDate() + 14);
  else if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
  else if (frequency === "quarterly") d.setMonth(d.getMonth() + 3);
  else if (frequency === "annually") d.setFullYear(d.getFullYear() + 1);
  return d;
}

/** Returns all future occurrence dates within (today, endDate] */
function getOccurrences(lastDate: Date, frequency: string, today: Date, endDate: Date): Date[] {
  const occurrences: Date[] = [];
  let cursor = new Date(lastDate);
  // Advance past today
  while (cursor <= today) {
    cursor = nextOccurrence(cursor, frequency);
  }
  // Collect all within the 30-day window
  while (cursor <= endDate) {
    occurrences.push(new Date(cursor));
    cursor = nextOccurrence(cursor, frequency);
  }
  return occurrences;
}

export type ForecastEvent = {
  date: string;
  merchant_key: string;
  amount: number;
  transaction_type: "income" | "expense";
};

export type ForecastDay = {
  date: string;
  balance: number;
  events: ForecastEvent[];
};

export type ForecastPayload = {
  startingBalance: number;
  days: ForecastDay[];
  upcomingEvents: ForecastEvent[];
};

export async function GET() {
  try {
    const db = createAdminClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = addDays(today, FORECAST_DAYS);

    // Steps 1+2: Fetch accounts (id+balance) and recurring rules in parallel
    const [
      { data: accountData, error: acctErr },
      { data: rules, error: rulesErr },
    ] = await Promise.all([
      db.from("accounts").select("id, balance").in("type", ["checking", "savings"] as const),
      db.from("recurring_rules")
        .select("merchant_key, frequency, transaction_type")
        .eq("account_type", "checking_savings")
        .eq("is_recurring", true),
    ]);

    if (acctErr) return NextResponse.json({ error: acctErr.message }, { status: 500 });
    if (rulesErr) return NextResponse.json({ error: rulesErr.message }, { status: 500 });

    const startingBalance = (accountData ?? []).reduce((s, a) => s + Number(a.balance), 0);
    const accountIds = (accountData ?? []).map((a) => a.id);

    // If no rules, return flat balance across 30 days
    if (!rules?.length) {
      const days: ForecastDay[] = Array.from({ length: FORECAST_DAYS + 1 }, (_, i) => ({
        date: toIsoDate(addDays(today, i)),
        balance: startingBalance,
        events: [],
      }));
      return NextResponse.json({ startingBalance, days, upcomingEvents: [] } satisfies ForecastPayload);
    }

    const { data: txRows, error: txErr } = accountIds.length
      ? await db
          .from("transactions")
          .select("description, amount, date")
          .in("account_id", accountIds)
          .order("date", { ascending: false })
          .limit(5000)
      : { data: [], error: null };

    if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

    // Build normalized map: normalizedKey → up to 3 most-recent [{amount, date}]
    const normalizedMap = new Map<string, { amount: number; date: string }[]>();
    for (const tx of txRows ?? []) {
      const key = normalizeMerchantName(tx.description);
      if (!key) continue;
      const bucket = normalizedMap.get(key);
      if (bucket) {
        if (bucket.length < 3) bucket.push({ amount: tx.amount, date: tx.date });
      } else {
        normalizedMap.set(key, [{ amount: tx.amount, date: tx.date }]);
      }
    }

    // Steps 4+: For each rule, compute projected amount and all occurrences
    const allEvents: ForecastEvent[] = [];

    for (const rule of rules) {
      const freq = rule.frequency as string | null;
      if (!freq) continue;

      // Normalize the stored key (may have been saved before normalization improvements)
      const lookupKey = normalizeMerchantName(rule.merchant_key) ?? rule.merchant_key;
      const sample = normalizedMap.get(lookupKey) ?? [];
      if (sample.length === 0) continue; // Skip rules with no transaction history

      const projectedAmount =
        sample.reduce((s, t) => s + Math.abs(t.amount), 0) / sample.length;
      const lastDate = new Date(sample[0].date + "T00:00:00");
      const txType = (rule.transaction_type ?? "expense") as "income" | "expense";

      for (const occ of getOccurrences(lastDate, freq, today, endDate)) {
        allEvents.push({
          date: toIsoDate(occ),
          merchant_key: rule.merchant_key,
          amount: projectedAmount,
          transaction_type: txType,
        });
      }
    }

    // Step 5: Build day-by-day running balance (day 0 = today = anchor, no events applied)
    const eventsByDate = new Map<string, ForecastEvent[]>();
    for (const e of allEvents) {
      const bucket = eventsByDate.get(e.date);
      if (bucket) bucket.push(e);
      else eventsByDate.set(e.date, [e]);
    }

    const days: ForecastDay[] = [];
    let runningBalance = startingBalance;

    for (let i = 0; i <= FORECAST_DAYS; i++) {
      const date = toIsoDate(addDays(today, i));
      const dayEvents = i === 0 ? [] : (eventsByDate.get(date) ?? []);
      for (const e of dayEvents) {
        runningBalance += e.transaction_type === "income" ? e.amount : -e.amount;
      }
      days.push({ date, balance: runningBalance, events: dayEvents });
    }

    // Step 6: Return payload
    allEvents.sort((a, b) => a.date.localeCompare(b.date));
    const upcomingEvents = allEvents;

    return NextResponse.json({ startingBalance, days, upcomingEvents } satisfies ForecastPayload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[forecast] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
