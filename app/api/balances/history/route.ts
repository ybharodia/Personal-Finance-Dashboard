import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

const LIQUID_GROUPS = ["checking", "savings", "business_checking", "investment"];
const HISTORY_DAYS = 60;

/** Returns "YYYY-MM-DD" for a Date object using local-date arithmetic */
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add `days` calendar days to a date (negative = subtract) */
function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export async function GET() {
  try {
    const db = createAdminClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sixtyDaysAgo = addDays(today, -(HISTORY_DAYS - 1));
    const fromStr = toIsoDate(sixtyDaysAgo);
    const toStr = toIsoDate(today);

    // ── 1–2+4. Fetch accounts, transactions, and stored snapshots in parallel ─
    const [
      { data: accounts, error: accErr },
      { data: txns, error: txErr },
      { data: stored, error: storageErr },
    ] = await Promise.all([
      db.from("accounts").select("balance, account_group").in("account_group", LIQUID_GROUPS),
      db.from("transactions").select("date, amount, type").gte("date", fromStr).lte("date", toStr),
      db.from("daily_balances").select("date, total_balance").gte("date", fromStr).lte("date", toStr),
    ]);

    if (accErr) {
      console.error("[balances/history] accounts error:", accErr.message);
      return NextResponse.json({ error: accErr.message }, { status: 500 });
    }
    if (txErr) {
      console.error("[balances/history] transactions error:", txErr.message);
      return NextResponse.json({ error: txErr.message }, { status: 500 });
    }
    if (storageErr) {
      console.error("[balances/history] daily_balances error:", storageErr.message);
      return NextResponse.json({ error: storageErr.message }, { status: 500 });
    }

    const todayTotal = (accounts ?? []).reduce((s, a) => s + Number(a.balance), 0);

    // Group transactions by date
    const byDate = new Map<string, { income: number; expenses: number }>();
    for (const t of txns ?? []) {
      const entry = byDate.get(t.date) ?? { income: 0, expenses: 0 };
      if (t.type === "income") entry.income += Number(t.amount);
      else if (t.type === "expense") entry.expenses += Number(t.amount);
      byDate.set(t.date, entry);
    }

    // ── 3. Reconstruct daily balances walking backwards ───────────────────────
    const reconstructed = new Map<string, number>();
    let runningBalance = todayTotal;
    reconstructed.set(toStr, runningBalance);

    for (let i = 1; i < HISTORY_DAYS; i++) {
      const currDay = toIsoDate(addDays(today, -(i - 1)));
      const { income = 0, expenses = 0 } = byDate.get(currDay) ?? {};
      // Reverse this day's transactions to get the previous day's closing balance
      runningBalance = runningBalance - income + expenses;
      const prevDay = toIsoDate(addDays(today, -i));
      reconstructed.set(prevDay, runningBalance);
    }

    // ── 4. Merge with stored daily_balances (stored rows take precedence) ─────
    for (const row of stored ?? []) {
      reconstructed.set(row.date, Number(row.total_balance));
    }

    // ── 5. Sort oldest → newest and return ───────────────────────────────────
    const data = Array.from(reconstructed.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, total_balance]) => ({ date, total_balance }));

    return NextResponse.json({ data });
  } catch (err: any) {
    console.error("[balances/history] unexpected error:", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
