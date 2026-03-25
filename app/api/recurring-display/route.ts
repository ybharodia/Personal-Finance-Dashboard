import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { normalizeMerchantName } from "@/lib/recurring";

const VALID_ACCOUNT_TYPES = ["checking_savings", "credit_card"] as const;
type AccountType = (typeof VALID_ACCOUNT_TYPES)[number];

function isValidAccountType(v: unknown): v is AccountType {
  return VALID_ACCOUNT_TYPES.includes(v as AccountType);
}

function addMonths(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().split("T")[0];
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

// GET /api/recurring-display?account_type=checking_savings|credit_card
// Returns display data for all is_recurring=true rules for the given account type,
// enriched with avg_amount and next_date derived from real transactions.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const account_type = searchParams.get("account_type");

  if (!isValidAccountType(account_type)) {
    return NextResponse.json({ error: "Invalid account_type" }, { status: 400 });
  }

  const db = createAdminClient();
  const dbAccountTypes = account_type === "checking_savings"
    ? (["checking", "savings"] as const)
    : (["credit"] as const);

  // 1. Active recurring rules for this account type
  const { data: rules, error: rulesErr } = await db
    .from("recurring_rules")
    .select("merchant_key, frequency, transaction_type")
    .eq("account_type", account_type)
    .eq("is_recurring", true);

  if (rulesErr) return NextResponse.json({ error: rulesErr.message }, { status: 500 });
  if (!rules?.length) return NextResponse.json([]);

  // Bug 2 fix: deduplicate rules by merchant_key, keeping first occurrence
  const seenKeys = new Set<string>();
  const uniqueRules = rules.filter((r) => {
    if (seenKeys.has(r.merchant_key)) return false;
    seenKeys.add(r.merchant_key);
    return true;
  });

  // 2. Account IDs for this type
  const { data: accounts, error: accErr } = await db
    .from("accounts")
    .select("id")
    .in("type", dbAccountTypes);

  if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });
  const accountIds = (accounts ?? []).map((a) => a.id);
  if (!accountIds.length) return NextResponse.json([]);

  // 3. Recent transactions for those accounts (date-desc, capped to avoid unbounded load)
  const { data: transactions, error: txErr } = await db
    .from("transactions")
    .select("description, amount, date")
    .in("account_id", accountIds)
    .order("date", { ascending: false })
    .limit(5000);

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

  // 4. Build normalized map: merchant_key → last-3 [{amount, date}] (already date-desc)
  const normalizedMap = new Map<string, { amount: number; date: string }[]>();
  for (const tx of transactions ?? []) {
    const key = normalizeMerchantName(tx.description);
    if (!key) continue;
    const bucket = normalizedMap.get(key);
    if (bucket) {
      if (bucket.length < 3) bucket.push({ amount: tx.amount, date: tx.date });
    } else {
      normalizedMap.set(key, [{ amount: tx.amount, date: tx.date }]);
    }
  }

  // 5. Build display entry per rule
  // Bug 1 fix: normalize rule.merchant_key before map lookup so that stale
  // un-normalized keys (saved before normalization improvements) still match.
  const result = uniqueRules.map((rule) => {
    const lookupKey = normalizeMerchantName(rule.merchant_key) ?? rule.merchant_key;
    const sample = normalizedMap.get(lookupKey) ?? [];
    const avgAmount =
      sample.length > 0
        ? sample.reduce((s, t) => s + Math.abs(t.amount), 0) / sample.length
        : 0;
    const lastDate = sample[0]?.date ?? null;

    let nextDate: string | null = null;
    if (lastDate && rule.frequency) {
      if (rule.frequency === "monthly") nextDate = addMonths(lastDate, 1);
      else if (rule.frequency === "biweekly") nextDate = addDays(lastDate, 14);
      else if (rule.frequency === "weekly") nextDate = addDays(lastDate, 7);
    }

    return {
      merchant_key: rule.merchant_key,
      frequency: rule.frequency as "weekly" | "biweekly" | "monthly" | null,
      transaction_type: rule.transaction_type as "income" | "expense" | null,
      avg_amount: avgAmount,
      last_date: lastDate,
      next_date: nextDate,
    };
  });

  return NextResponse.json(result);
}
