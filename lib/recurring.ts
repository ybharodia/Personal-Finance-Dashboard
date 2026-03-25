import type { DbTransaction, DbMerchantRule } from "./database.types";

export type RecurringFrequency = "weekly" | "biweekly" | "monthly";

export type RecurringTransaction = {
  merchant: string;
  /** Normalized, stable identifier used to match/store override rules. */
  merchantKey: string;
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

// Patterns that indicate non-merchant transactions — return null to skip entirely
const EXCLUDE_PATTERNS = [
  /^Online Transfer/i,
  /^Online ACH Payment/i,
  /transaction#:/i,
  /^ATM CASH DEPOSIT/i,
  /^ATM TRANSACTION FEE/i,
  /^NON-CHASE ATM/i,
  /^REMOTE ONLINE DEPOSIT/i,
  /^FEDWIRE CREDIT/i,
] as const;

// Hoisted for performance across 5k+ transactions per request
const ORIG_CO_NAME_RE = /ORIG CO NAME:(.*?)\s+ORIG ID:/i;
const ID_SUFFIX_RE = /\s+(?:(?:WEB|PPD|CCD)\s+ID:|WEB_PAY|ACH\s+WEB).*$/i;
const LONG_DIGITS_RE = /\b\d{8,}\b/g;

/**
 * Normalize a raw Plaid transaction description into a clean display merchant name.
 * Returns null if the description matches a known non-merchant pattern (transfers,
 * ATM ops, etc.) or normalizes to an empty string.
 *
 * Processing order:
 *   Step 0 — exclude non-merchant patterns → null
 *   Step 1 — extract "ORIG CO NAME:…" company name
 *   Step 2 — strip everything after first asterisk
 *   Step 3 — strip WEB ID / PPD ID / CCD ID / WEB_PAY / ACH WEB suffixes
 *   Step 4 — strip standalone 8+ digit sequences
 *   Step 5 — strip trailing mixed alphanumeric codes (letter + digit, any length)
 *   Step 6 — collapse whitespace, trim, return null if empty
 */
export function normalizeMerchantName(description: string): string | null {
  // Step 0: skip known non-merchant patterns
  for (const re of EXCLUDE_PATTERNS) {
    if (re.test(description)) return null;
  }

  let name = description;

  // Step 1: "ORIG CO NAME:CHASE CREDIT CRD ORIG ID:..." → "CHASE CREDIT CRD"
  const origMatch = name.match(ORIG_CO_NAME_RE);
  if (origMatch) name = origMatch[1].trim();

  // Step 2: "AMAZON MKTPL*2T1CF3AC3" → "AMAZON MKTPL"
  const asteriskIdx = name.indexOf("*");
  if (asteriskIdx !== -1) name = name.slice(0, asteriskIdx);

  // Step 3: strip WEB ID:, PPD ID:, CCD ID:, WEB_PAY, ACH WEB (but NOT ACH PMT)
  name = name.replace(ID_SUFFIX_RE, "");

  // Step 4: strip standalone 8+ digit sequences (e.g. "3210143049503")
  name = name.replace(LONG_DIGITS_RE, "");

  // Step 5: strip trailing words that contain both a letter and a digit
  // (mixed alphanumeric codes like "A2440", "NCA283489"); loop because removing
  // one may expose another. Pure-alpha words like "DRAFT" or "Yash" are kept.
  let prev: string;
  do {
    prev = name;
    const lastSpace = name.lastIndexOf(" ");
    const lastWord = lastSpace === -1 ? name : name.slice(lastSpace + 1);
    if (/[A-Za-z]/.test(lastWord) && /[0-9]/.test(lastWord)) {
      name = lastSpace === -1 ? "" : name.slice(0, lastSpace);
    }
  } while (name !== prev);

  // Step 6: collapse whitespace and trim
  name = name.replace(/\s+/g, " ").trim();
  return name.length > 0 ? name : null;
}

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

/**
 * Stable merchant identifier for override storage and matching.
 * Use this everywhere a merchant_key is needed (DB, UI, comparisons).
 */
export function toMerchantKey(description: string): string {
  return normalizeMerchant(description);
}

/**
 * Merchant key for subcategory rule matching.
 * More aggressive than toMerchantKey: strips #XXXX serial patterns and 4+ digit
 * standalone numbers so "Amazon #1234" and "Amazon #5678" both map to "amazon".
 */
export function merchantRuleKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/#[\w-]*/g, "")       // strip "#1234", "#A2B3C", etc.
    .replace(/\b\d{4,}\b/g, "")   // strip 4+ digit standalone numbers (e.g. 883920)
    .replace(/[^a-z0-9\s]/g, " ") // clean remaining special chars
    .replace(/\s+/g, " ")
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

/**
 * Build a RecurringTransaction from a manually force-included set of transactions.
 * Used both server-side (page.tsx) and client-side (RecurringClient optimistic add).
 */
export function buildManualRecurring(
  txns: DbTransaction[],
  merchantKey: string
): RecurringTransaction {
  const expenses = txns.filter((t) => t.type !== "income");
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));

  const amounts = sorted.map((t) => Math.abs(t.amount));
  const meanAmount =
    amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;

  const today = new Date().toISOString().split("T")[0];
  const lastDate = sorted.length > 0 ? sorted[sorted.length - 1].date : today;
  const nextPredictedDate = addDays(lastDate, 30);

  const category = mostCommon(sorted.map((t) => t.category).filter(Boolean) as string[]);
  const subcategory = mostCommon(
    sorted.map((t) => t.subcategory).filter(Boolean) as string[]
  );
  const merchant = sorted.length > 0 ? sorted[sorted.length - 1].description : merchantKey;

  return {
    merchant,
    merchantKey,
    averageAmount: meanAmount,
    frequency: "monthly",
    intervalDays: 30,
    lastDate,
    nextPredictedDate,
    monthlyAmount: meanAmount,
    occurrences: sorted.length,
    category: category ?? null,
    subcategory: subcategory ?? null,
  };
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
      merchantKey: toMerchantKey(merchant),
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
      merchantKey: toMerchantKey(merchant),
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

function meaningfulWords(key: string): Set<string> {
  return new Set(key.split(/\s+/).filter((w) => w.length >= 4));
}

/**
 * Apply saved merchant category rules to a list of transactions.
 * Tries exact key match first; falls back to word-overlap for abbreviated names
 * (e.g. "AMAZON MKTPLACE PMTS" matching a rule saved for "Amazon Marketplace").
 * Never overrides a transaction the user explicitly categorized.
 */
export function applyMerchantRules(
  txns: DbTransaction[],
  rules: DbMerchantRule[]
): DbTransaction[] {
  const map = new Map(rules.map((r) => [r.merchant_key, r]));
  // Pre-compute rule word sets once — avoids O(n×m) re-allocation per transaction
  const ruleWords = new Map(rules.map((r) => [r.merchant_key, meaningfulWords(r.merchant_key)]));

  return txns.map((t) => {
    if (t.user_categorized) return t;
    const key = merchantRuleKey(t.description);

    // 1. Exact match (fast path — no behavior change for clean matches)
    const exact = map.get(key);
    if (exact) return { ...t, category: exact.category, subcategory: exact.subcategory };

    // 2. Word-overlap fallback: find the rule with the most shared 4+ char words
    const txWords = meaningfulWords(key);
    let bestRule: DbMerchantRule | null = null;
    let bestOverlap = 0;
    let bestKeyLen = 0;
    for (const rule of map.values()) {
      let overlap = 0;
      for (const w of ruleWords.get(rule.merchant_key)!) if (txWords.has(w)) overlap++;
      if (overlap === 0) continue;
      if (overlap > bestOverlap || (overlap === bestOverlap && rule.merchant_key.length > bestKeyLen)) {
        bestRule = rule;
        bestOverlap = overlap;
        bestKeyLen = rule.merchant_key.length;
      }
    }

    if (!bestRule) return { ...t, category: "", subcategory: "" };
    return { ...t, category: bestRule.category, subcategory: bestRule.subcategory };
  });
}
