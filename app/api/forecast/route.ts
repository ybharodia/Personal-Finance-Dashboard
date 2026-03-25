// app/api/forecast/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

const LIQUID_GROUPS = ["checking", "savings", "business_checking", "investment"];
const FORECAST_DAYS = 30;
const LOOKBACK_DAYS = 90;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

/** Returns the number of days in the given month (1-indexed month) */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

type RawTxn = { description: string; amount: number; date: string; type: string; category: string };
type RecurringItem = {
  description: string;
  avgAmount: number;
  avgDayOfMonth: number;
  isIncome: boolean;
};

/**
 * Finds merchants that appear ≥2 times with amounts within `threshold` of each other.
 * threshold = 0.10 means max/min ≤ 1.10 (within 10%).
 * Returns one RecurringItem per qualifying merchant.
 */
function detectRecurring(txns: RawTxn[], threshold: number): RecurringItem[] {
  const groups = new Map<string, Array<{ amount: number; day: number; isIncome: boolean }>>();

  for (const t of txns) {
    // Parse day directly from ISO string to avoid timezone shifts
    const day = Number(t.date.split("-")[2]);
    const list = groups.get(t.description) ?? [];
    list.push({ amount: Number(t.amount), day, isIncome: t.type === "income" });
    groups.set(t.description, list);
  }

  const result: RecurringItem[] = [];
  for (const [description, entries] of groups) {
    if (entries.length < 2) continue;
    const amounts = entries.map((e) => e.amount);
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    if (min <= 0) continue;
    if (max / min > 1 + threshold) continue;
    const firstType = entries[0].isIncome;
    if (entries.some((e) => e.isIncome !== firstType)) continue;

    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const avgDay = entries.reduce((a, e) => a + e.day, 0) / entries.length;

    result.push({ description, avgAmount, avgDayOfMonth: Math.round(avgDay), isIncome: firstType });
  }
  return result;
}

export async function GET() {
  try {
    const db = createAdminClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lookbackStart = addDays(today, -LOOKBACK_DAYS);

    const [
      { data: accounts, error: accErr },
      { data: txnRows, error: txErr },
    ] = await Promise.all([
      db.from("accounts").select("balance, account_group").in("account_group", LIQUID_GROUPS),
      db
        .from("transactions")
        .select("description, date, amount, type, category")
        .gte("date", toIsoDate(lookbackStart))
        .lt("date", toIsoDate(today)),
    ]);

    if (accErr) {
      console.error("[forecast] accounts error:", accErr.message);
      return NextResponse.json({ error: accErr.message }, { status: 500 });
    }
    if (txErr) {
      console.error("[forecast] transactions error:", txErr.message);
      return NextResponse.json({ error: txErr.message }, { status: 500 });
    }

    const currentBalance = (accounts ?? []).reduce((s, a) => s + Number(a.balance), 0);

    const allTxns = (txnRows ?? []) as RawTxn[];
    const regularTxns: RawTxn[] = [];
    const transferTxns: RawTxn[] = [];
    for (const t of allTxns) {
      (/transfer/i.test(t.category) ? transferTxns : regularTxns).push(t);
    }

    const regularRecurring = detectRecurring(regularTxns, 0.1);
    const transferRecurring = detectRecurring(transferTxns, 0.4);
    const allRecurring = [...regularRecurring, ...transferRecurring];

    // Project forward FORECAST_DAYS days
    const data: Array<{ date: string; balance: number; is_forecast: boolean }> = [];
    data.push({ date: toIsoDate(today), balance: currentBalance, is_forecast: false });

    let runningBalance = currentBalance;
    // Prevents double-applying same merchant in the same calendar month
    const applied = new Set<string>();

    for (let i = 1; i <= FORECAST_DAYS; i++) {
      const day = addDays(today, i);
      const dayOfMonth = day.getDate();
      const yearMonth = day.getFullYear() * 100 + (day.getMonth() + 1);

      for (const item of allRecurring) {
        const key = `${item.description}:${yearMonth}`;
        if (applied.has(key)) continue;
        const clampedDay = Math.min(item.avgDayOfMonth, daysInMonth(day.getFullYear(), day.getMonth() + 1));
        if (Math.abs(dayOfMonth - clampedDay) <= 1) {
          runningBalance += item.isIncome ? item.avgAmount : -item.avgAmount;
          applied.add(key);
        }
      }

      data.push({ date: toIsoDate(day), balance: runningBalance, is_forecast: true });
    }

    return NextResponse.json({
      current_balance: currentBalance,
      projected_balance: runningBalance,
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[forecast] unexpected error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
