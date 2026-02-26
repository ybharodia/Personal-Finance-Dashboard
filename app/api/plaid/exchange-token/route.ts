import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { createAdminClient } from "@/lib/supabase";
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
    // Keep createAdminClient() inside try so a missing SUPABASE_SERVICE_ROLE_KEY
    // env var is caught here and returned as JSON rather than crashing the route
    // with an unhandled throw that produces an HTML 500 (which the client can't
    // parse, causing the fallback "Exchange failed" message).
    const db = createAdminClient();

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
      const { error: acctErr } = await db
        .from("accounts")
        .upsert(accountRows, { onConflict: "id" });
      if (acctErr) {
        console.error("[plaid] upsert accounts:", acctErr.message);
        throw new Error(`upsert accounts: ${acctErr.message}`);
      }
    }

    // 3. Remove any stale plaid_items for this institution (handles reconnects and
    //    partial-failure duplicates where a previous attempt got a different item_id).
    const { error: deleteErr } = await db
      .from("plaid_items")
      .delete()
      .eq("institution_name", institution_name)
      .neq("item_id", item_id);
    if (deleteErr) {
      // Non-fatal — a stale item is worse than a logged warning
      console.warn("[plaid] could not remove stale plaid_items:", deleteErr.message);
    }

    // 4. Upsert the new (or re-connected) Plaid item
    const { error: itemErr } = await db
      .from("plaid_items")
      .upsert({ access_token, item_id, institution_name }, { onConflict: "item_id" });
    if (itemErr) throw new Error(`plaid_items upsert: ${itemErr.message}`);

    console.log(`[plaid] exchange-token: item ${item_id}, ${accountRows.length} account(s)`);
    return NextResponse.json({ success: true, item_id, accounts_added: accountRows.length });
  } catch (err: any) {
    const plaidData = err?.response?.data;
    console.error(
      "[plaid] exchange-token error:",
      plaidData
        ? `${plaidData.error_type}/${plaidData.error_code}: ${plaidData.error_message}`
        : err?.message
    );
    if (plaidData) {
      console.error("[plaid] full error payload:", JSON.stringify(plaidData, null, 2));
    }
    const detail = plaidData ?? err?.message;
    return NextResponse.json({ error: "Token exchange failed", detail }, { status: 500 });
  }
}
