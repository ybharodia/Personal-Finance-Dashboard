import type { DbTransaction } from "./database.types";

export type RecurringFrequency = "weekly" | "biweekly" | "monthly";

export type RecurringTransaction = {
  merchant: string;
  averageAmount: number;
  frequency: RecurringFrequency;
  intervalDays: number;
  lastDate: string;
  nextPredictedDate: string;
  monthlyAmount: number;
  occurrences: number;
  category: string | null;
  subcategory: string | null;
};

function normalizeMerchant(description: string): string {
  return description
    .toLowerCase()
    .replace(/[*#@]/g, " ")         // replace special separators with space
    .replace(/\b\d{5,}\b/g, "")    // remove long standalone digit sequences (ref numbers)
    .replace(/[^a-z0-9\s]/g, " ")  // remove remaining special chars
    .replace(/\s+/g, " ")          // collapse whitespace
    .trim();
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.abs((db - da) / (1000 * 60 * 60 * 24));
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function detectFrequency(
  gaps: number[]
): { frequency: RecurringFrequency; intervalDays: number } | null {
  if (gaps.length === 0) return null;

  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;

  // Weekly: 4–10 days average, each gap within ±3 days
  if (mean >= 4 && mean <= 10) {
    const consistent = gaps.every((g) => Math.abs(g - mean) <= 3);
    if (consistent) return { frequency: "weekly", intervalDays: Math.round(mean) };
  }

  // Biweekly: 11–17 days average, each gap within ±5 days
  if (mean >= 11 && mean <= 17) {
    const consistent = gaps.every((g) => Math.abs(g - mean) <= 5);
    if (consistent) return { frequency: "biweekly", intervalDays: Math.round(mean) };
  }

  // Monthly: 25–35 days average, each gap within ±7 days
  if (mean >= 25 && mean <= 35) {
    const consistent = gaps.every((g) => Math.abs(g - mean) <= 7);
    if (consistent) return { frequency: "monthly", intervalDays: Math.round(mean) };
  }

  return null;
}

function mostCommon<T>(values: T[]): T | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function detectRecurringTransactions(
  transactions: DbTransaction[]
): RecurringTransaction[] {
  // Only analyze expense/transfer transactions
  const expenses = transactions.filter((t) => t.type !== "income");

  // Group by normalized merchant name
  const groups = new Map<string, DbTransaction[]>();
  for (const tx of expenses) {
    const key = normalizeMerchant(tx.description);
    if (key.length < 3) continue; // skip very short/empty keys
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tx);
  }

  const results: RecurringTransaction[] = [];

  for (const txns of groups.values()) {
    // Need at least 3 occurrences for reliable detection
    if (txns.length < 3) continue;

    // Sort chronologically
    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));

    // Check amount consistency (within 20% variance from mean)
    const amounts = sorted.map((t) => Math.abs(t.amount));
    const meanAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (meanAmount < 0.01) continue; // skip zero-amount transactions
    const withinVariance = amounts.every(
      (a) => Math.abs(a - meanAmount) / meanAmount <= 0.20
    );
    if (!withinVariance) continue;

    // Compute gaps between consecutive transactions
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }

    const frequencyResult = detectFrequency(gaps);
    if (!frequencyResult) continue;

    const { frequency, intervalDays } = frequencyResult;

    const lastDate = sorted[sorted.length - 1].date;
    const nextPredictedDate = addDays(lastDate, intervalDays);

    // Monthly equivalent spend
    const monthlyMultiplier =
      frequency === "weekly" ? 4.33 : frequency === "biweekly" ? 2.17 : 1.0;
    const monthlyAmount = meanAmount * monthlyMultiplier;

    // Most common category and subcategory
    const category = mostCommon(txns.map((t) => t.category).filter(Boolean) as string[]);
    const subcategory = mostCommon(
      txns.map((t) => t.subcategory).filter(Boolean) as string[]
    );

    // Use the most recent transaction's description as the display name
    const merchant = sorted[sorted.length - 1].description;

    results.push({
      merchant,
      averageAmount: meanAmount,
      frequency,
      intervalDays,
      lastDate,
      nextPredictedDate,
      monthlyAmount,
      occurrences: txns.length,
      category: category ?? null,
      subcategory: subcategory ?? null,
    });
  }

  // Sort by monthly amount descending (biggest recurring costs first)
  return results.sort((a, b) => b.monthlyAmount - a.monthlyAmount);
}
