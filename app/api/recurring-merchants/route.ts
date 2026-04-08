import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import type { RecurringAccountType } from "@/lib/database.types";
import { normalizeMerchantName } from "@/lib/recurring";

const TRANSFER_RE = /transfer|xfer|zelle|venmo/i;
const VALID_ACCOUNT_TYPES: RecurringAccountType[] = ["checking_savings", "credit_card"];

function isValidAccountType(v: unknown): v is RecurringAccountType {
  return VALID_ACCOUNT_TYPES.includes(v as RecurringAccountType);
}

// GET /api/recurring-merchants?account_type=checking_savings|credit_card
// Returns unique merchants from transactions belonging to matching accounts,
// excluding internal transfers, sorted alphabetically.
export async function GET(request: Request) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = new URL(request.url);
  const account_type = searchParams.get("account_type");

  if (!isValidAccountType(account_type)) {
    return NextResponse.json({ error: "Invalid account_type" }, { status: 400 });
  }

  const db = createAdminClient();
  const accountTypes: ("checking" | "savings" | "credit")[] =
    account_type === "checking_savings" ? ["checking", "savings"] : ["credit"];

  // Fetch matching account IDs
  const { data: accounts, error: accErr } = await db
    .from("accounts")
    .select("id")
    .in("type", accountTypes);

  if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });
  const accountIds = (accounts ?? []).map((a) => a.id);
  if (accountIds.length === 0) return NextResponse.json([]);

  // Fetch recent transactions for those accounts (capped to avoid unbounded load)
  const { data: transactions, error: txErr } = await db
    .from("transactions")
    .select("description, amount")
    .in("account_id", accountIds)
    .order("date", { ascending: false })
    .limit(5000);

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

  // Deduplicate by normalized merchant name, exclude transfers and non-merchant patterns.
  // normalizeMerchantName returns null for transfers, ATM ops, etc. — those are skipped.
  // Remaining names are collapsed (e.g. "AMAZON MKTPL*2T1CF3AC3" → "AMAZON MKTPL").
  const merchantMap = new Map<string, number[]>();
  for (const tx of transactions ?? []) {
    if (TRANSFER_RE.test(tx.description)) continue;
    const key = normalizeMerchantName(tx.description);
    if (!key) continue;
    const amounts = merchantMap.get(key) ?? [];
    if (!merchantMap.has(key)) merchantMap.set(key, amounts);
    if (amounts.length < 3) amounts.push(tx.amount);
  }

  const result = Array.from(merchantMap.entries())
    .map(([merchant_key, amounts]) => ({
      merchant_key,
      average_amount: amounts.reduce((s, a) => s + a, 0) / amounts.length,
    }))
    .sort((a, b) => a.merchant_key.localeCompare(b.merchant_key));

  return NextResponse.json(result);
}
