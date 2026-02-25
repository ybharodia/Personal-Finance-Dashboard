import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { supabase } from "@/lib/supabase";
import type { AccountType, AccountSubtype } from "plaid";

function mapAccountType(
  type: AccountType,
  subtype: AccountSubtype | null
): "checking" | "savings" | "credit" {
  if (type === "credit") return "credit";
  const savingsSubtypes = ["savings", "money market", "cd", "ira"];
  if (subtype && savingsSubtypes.includes(subtype)) return "savings";
  return "checking";
}

export async function POST(req: NextRequest) {
  try {
    const { public_token, institution_name } = await req.json();

    // 1. Exchange public token → access token
    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeRes.data;

    // 2. Fetch accounts from Plaid and upsert into our accounts table
    const accountsRes = await plaidClient.accountsGet({ access_token });
    const accountRows = accountsRes.data.accounts.map((a) => ({
      id: a.account_id,
      bank_name: institution_name,
      name: a.name,
      type: mapAccountType(a.type, a.subtype ?? null),
      balance: a.balances.current ?? 0,
    }));

    if (accountRows.length > 0) {
      const { error: acctErr } = await supabase
        .from("accounts")
        .upsert(accountRows, { onConflict: "id" });
      if (acctErr) console.error("[plaid] upsert accounts:", acctErr.message);
    }

    // 3. Store Plaid item (access token + item_id) in Supabase
    const { error: itemErr } = await supabase
      .from("plaid_items")
      .upsert({ access_token, item_id, institution_name }, { onConflict: "item_id" });
    if (itemErr) throw new Error(`plaid_items upsert: ${itemErr.message}`);

    return NextResponse.json({ success: true, item_id, accounts_added: accountRows.length });
  } catch (err: any) {
    const detail = err.response?.data ?? err.message;
    console.error("[plaid] exchange-token:", detail);
    return NextResponse.json({ error: "Token exchange failed", detail }, { status: 500 });
  }
}
