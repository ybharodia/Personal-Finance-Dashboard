import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { normalizeMerchantName } from "@/lib/recurring";

const VALID_ACCOUNT_TYPES = ["checking_savings", "credit_card"] as const;
type AccountType = (typeof VALID_ACCOUNT_TYPES)[number];

function isValidAccountType(v: unknown): v is AccountType {
  return VALID_ACCOUNT_TYPES.includes(v as AccountType);
}

// GET /api/recurring-rules?account_type=checking_savings|credit_card
export async function GET(request: Request) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = new URL(request.url);
  const account_type = searchParams.get("account_type");

  if (!isValidAccountType(account_type)) {
    return NextResponse.json({ error: "Invalid account_type" }, { status: 400 });
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("recurring_rules")
    .select("*")
    .eq("account_type", account_type);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/recurring-rules
// Body: { merchant_key, account_type, is_recurring, frequency, transaction_type }
export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await request.json() as {
      merchant_key: string;
      account_type: string;
      is_recurring: boolean;
      frequency: string | null;
      transaction_type: string | null;
    };
    const { merchant_key: raw_key, account_type, is_recurring, frequency, transaction_type } = body;
    const merchant_key = normalizeMerchantName(raw_key ?? "");

    if (!merchant_key || !isValidAccountType(account_type)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from("recurring_rules")
      .upsert(
        {
          merchant_key,
          account_type,
          is_recurring,
          frequency: (frequency ?? null) as "weekly" | "biweekly" | "monthly" | null,
          transaction_type: (transaction_type ?? null) as "income" | "expense" | null,
        },
        { onConflict: "merchant_key,account_type" }
      )
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
