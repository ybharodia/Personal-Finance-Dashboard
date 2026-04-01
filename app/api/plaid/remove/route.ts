import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { createAdminClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const db = createAdminClient();
    const { itemId } = await req.json();

    if (!itemId || typeof itemId !== "string") {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    // 1. Look up the plaid item to get access_token and institution_name
    const { data: item, error: itemErr } = await db
      .from("plaid_items")
      .select("access_token, institution_name")
      .eq("item_id", itemId)
      .single();

    if (itemErr || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // 2. Revoke the access token with Plaid
    try {
      await plaidClient.itemRemove({ access_token: item.access_token });
      console.log(`[plaid] remove: revoked access token for item ${itemId}`);
    } catch (plaidErr: any) {
      // If Plaid says the item is already removed or invalid, proceed with local cleanup.
      // ITEM_NOT_FOUND / INVALID_ACCESS_TOKEN are non-fatal here.
      const code = plaidErr?.response?.data?.error_code;
      if (code !== "ITEM_NOT_FOUND" && code !== "INVALID_ACCESS_TOKEN") {
        const detail = plaidErr?.response?.data ?? plaidErr?.message;
        console.error("[plaid] remove: itemRemove failed:", detail);
        return NextResponse.json({ error: "Failed to revoke Plaid access", detail }, { status: 500 });
      }
      console.warn(`[plaid] remove: Plaid returned ${code} — continuing with local cleanup`);
    }

    // 3. Find all account IDs for this institution
    const { data: accts, error: acctsErr } = await db
      .from("accounts")
      .select("id")
      .eq("bank_name", item.institution_name);

    if (acctsErr) {
      console.error("[plaid] remove: fetch accounts failed:", acctsErr.message);
      return NextResponse.json({ error: "Failed to fetch accounts", detail: acctsErr.message }, { status: 500 });
    }

    const accountIds = (accts ?? []).map((a) => a.id);

    // 4. Delete transactions (children first; also handled by ON DELETE CASCADE but explicit here)
    if (accountIds.length > 0) {
      const { error: txnErr } = await db
        .from("transactions")
        .delete()
        .in("account_id", accountIds);
      if (txnErr) {
        console.error("[plaid] remove: delete transactions failed:", txnErr.message);
        return NextResponse.json({ error: "Failed to delete transactions", detail: txnErr.message }, { status: 500 });
      }
      console.log(`[plaid] remove: deleted transactions for ${accountIds.length} account(s)`);
    }

    // 5. Delete accounts
    const { error: acctDeleteErr } = await db
      .from("accounts")
      .delete()
      .eq("bank_name", item.institution_name);
    if (acctDeleteErr) {
      console.error("[plaid] remove: delete accounts failed:", acctDeleteErr.message);
      return NextResponse.json({ error: "Failed to delete accounts", detail: acctDeleteErr.message }, { status: 500 });
    }
    console.log(`[plaid] remove: deleted accounts for ${item.institution_name}`);

    // 6. Delete the plaid item itself
    const { error: plaidItemDeleteErr } = await db
      .from("plaid_items")
      .delete()
      .eq("item_id", itemId);
    if (plaidItemDeleteErr) {
      console.error("[plaid] remove: delete plaid_item failed:", plaidItemDeleteErr.message);
      return NextResponse.json({ error: "Failed to delete plaid item", detail: plaidItemDeleteErr.message }, { status: 500 });
    }
    console.log(`[plaid] remove: deleted plaid_item ${itemId}`);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[plaid] remove fatal error:", err?.message);
    return NextResponse.json({ error: "Disconnect failed", detail: err?.message }, { status: 500 });
  }
}
