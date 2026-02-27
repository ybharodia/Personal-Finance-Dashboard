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

// Keywords in category/subcategory that indicate utility bills
const UTILITY_KEYWORDS = [
  "utilities", "electric", "electricity", "gas", "natural gas",
  "water", "internet", "broadband", "cable", "sewer", "trash", "garbage",
  "telecom", "telephone",
];

function normalizeMerchant(description: string): string {
  return description
    .toLowerCase()
    .replace(/[*#@]/g, " ")         // replace special separators with space
    .replace(/\b\d{5,}\b/g, "")    // remove long standalone digit sequences (ref numbers)
    .replace(/[^a-z0-9\s]/g, " ")  // remove remaining special chars
    .replace(/\s+/g, " ")          // collapse whitespace
    .trim();
}

// Fuzzy prefix key: first 8 chars of normalized name.
// This groups "DUKE ENERGY" and "DUKE ENERGY PMT" under the same key.
function merchantPrefixKey(normalized: string): string {
  return normalized.slice(0, 8).trimEnd();
}

function isUtility(tx: DbTransaction): boolean {
  const sub = (tx.subcategory ?? "").toLowerCase();
  const cat = (tx.category ?? "").toLowerCase();
  return UTILITY_KEYWORDS.some((kw) => sub.includes(kw) || cat.includes(kw));
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

function distinctMonths(txns: DbTransaction[]): number {
  return new Set(txns.map((t) => t.date.slice(0, 7))).size;
}

export function detectRecurringTransactions(
  transactions: DbTransaction[]
): RecurringTransaction[] {
  const expenses = transactions.filter((t) => t.type !== "income");

  // ===== Pass 1: Standard detection (exact normalized name) =====
  // Preserves all existing recurring detections.
  // Utilities get a looser 45% variance threshold instead of 20%.
  const exactGroups = new Map<string, DbTransaction[]>();
  for (const tx of expenses) {
    const key = normalizeMerchant(tx.description);
    if (key.length < 3) continue;
    if (!exactGroups.has(key)) exactGroups.set(key, []);
    exactGroups.get(key)!.push(tx);
  }

  const results: RecurringTransaction[] = [];
  const capturedTxIds = new Set<string>();

  for (const txns of exactGroups.values()) {
    if (txns.length < 3) continue;

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = sorted.map((t) => Math.abs(t.amount));
    const meanAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (meanAmount < 0.01) continue;

    // Utilities allow up to 45% variance (seasonal fluctuation); others stay at 20%
    const hasUtility = txns.some(isUtility);
    const varianceThreshold = hasUtility ? 0.45 : 0.20;

    const withinVariance = amounts.every(
      (a) => Math.abs(a - meanAmount) / meanAmount <= varianceThreshold
    );
    if (!withinVariance) continue;

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }

    const frequencyResult = detectFrequency(gaps);
    if (!frequencyResult) continue;

    const { frequency, intervalDays } = frequencyResult;
    const lastDate = sorted[sorted.length - 1].date;
    const nextPredictedDate = addDays(lastDate, intervalDays);

    const monthlyMultiplier =
      frequency === "weekly" ? 4.33 : frequency === "biweekly" ? 2.17 : 1.0;
    const monthlyAmount = meanAmount * monthlyMultiplier;

    const category = mostCommon(txns.map((t) => t.category).filter(Boolean) as string[]);
    const subcategory = mostCommon(
      txns.map((t) => t.subcategory).filter(Boolean) as string[]
    );
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

    for (const tx of txns) capturedTxIds.add(tx.id);
  }

  // ===== Pass 2: Utility detection (fuzzy prefix grouping, relaxed rules) =====
  // Catches utility bills that:
  //   - Have varying merchant name suffixes (e.g. "DUKE ENERGY" vs "DUKE ENERGY PMT")
  //   - Appear in fewer than 3 transactions but in 2+ distinct months
  //   - Weren't already detected in Pass 1
  const utilityTxns = expenses.filter(
    (t) => isUtility(t) && !capturedTxIds.has(t.id)
  );

  const prefixGroups = new Map<string, DbTransaction[]>();
  for (const tx of utilityTxns) {
    const normalized = normalizeMerchant(tx.description);
    if (normalized.length < 3) continue;
    const key = merchantPrefixKey(normalized);
    if (!prefixGroups.has(key)) prefixGroups.set(key, []);
    prefixGroups.get(key)!.push(tx);
  }

  for (const txns of prefixGroups.values()) {
    if (txns.length < 2) continue;

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));

    // Must appear in at least 2 distinct calendar months
    if (distinctMonths(sorted) < 2) continue;

    const amounts = sorted.map((t) => Math.abs(t.amount));
    const meanAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (meanAmount < 0.01) continue;

    // Allow up to 45% variance for utility bills (seasonal fluctuation)
    const withinVariance = amounts.every(
      (a) => Math.abs(a - meanAmount) / meanAmount <= 0.45
    );
    if (!withinVariance) continue;

    const lastDate = sorted[sorted.length - 1].date;
    const nextPredictedDate = addDays(lastDate, 30);
    const merchant = sorted[sorted.length - 1].description;
    const category = mostCommon(txns.map((t) => t.category).filter(Boolean) as string[]);
    const subcategory = mostCommon(
      txns.map((t) => t.subcategory).filter(Boolean) as string[]
    );

    results.push({
      merchant,
      averageAmount: meanAmount,
      frequency: "monthly",
      intervalDays: 30,
      lastDate,
      nextPredictedDate,
      monthlyAmount: meanAmount,
      occurrences: txns.length,
      category: category ?? null,
      subcategory: subcategory ?? null,
    });
  }

  // Sort by monthly amount descending (biggest recurring costs first)
  return results.sort((a, b) => b.monthlyAmount - a.monthlyAmount);
}
