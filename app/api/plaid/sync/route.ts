import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { supabase } from "@/lib/supabase";
import type { Transaction, RemovedTransaction } from "plaid";

// ── Category mapping ─────────────────────────────────────────────────────────
// Maps Plaid's personal_finance_category.primary → our category IDs in lib/data.ts

const CATEGORY_MAP: Record<string, string> = {
  INCOME:                     "income",
  TRANSFER_IN:                "income",
  TRANSFER_OUT:               "savings",
  LOAN_PAYMENTS:              "housing",
  BANK_FEES:                  "discretionary",
  ENTERTAINMENT:              "personal",
  FOOD_AND_DRINK:             "food",
  GENERAL_MERCHANDISE:        "discretionary",
  HOME_IMPROVEMENT:           "housing",
  MEDICAL:                    "personal",
  PERSONAL_CARE:              "personal",
  GENERAL_SERVICES:           "discretionary",
  GOVERNMENT_AND_NON_PROFIT:  "discretionary",
  TRANSPORTATION:             "transportation",
  TRAVEL:                     "transportation",
  RENT_AND_UTILITIES:         "housing",
};

function toTitleCase(s: string) {
  return s
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function mapTransaction(t: Transaction) {
  const primary  = t.personal_finance_category?.primary  ?? "";
  const detailed = t.personal_finance_category?.detailed ?? "";

  const category    = CATEGORY_MAP[primary] ?? "discretionary";
  const subcategory = detailed ? toTitleCase(detailed) : t.name.slice(0, 60);

  // Plaid convention: positive amount = money leaving account (expense).
  const type   = t.amount > 0 ? ("expense" as const) : ("income" as const);
  const amount = Math.abs(t.amount);

  return {
    id:          t.transaction_id,
    date:        t.date,
    account_id:  t.account_id,
    description: t.name,
    category,
    subcategory,
    amount,
    type,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST() {
  try {
    // Fetch all stored Plaid items
    const { data: items, error: itemsErr } = await supabase
      .from("plaid_items")
      .select("access_token, item_id, cursor");

    if (itemsErr) throw new Error(`Fetch plaid_items: ${itemsErr.message}`);
    if (!items?.length) {
      return NextResponse.json({ synced: 0, message: "No connected accounts" });
    }

    let totalSynced = 0;

    for (const item of items) {
      const added: Transaction[]         = [];
      const modified: Transaction[]      = [];
      const removed: RemovedTransaction[] = [];

      let cursor: string | undefined = item.cursor ?? undefined;

      // Paginate through all pages of the sync response
      while (true) {
        const res = await plaidClient.transactionsSync({
          access_token: item.access_token,
          cursor,
          options: { include_personal_finance_category: true },
        });
        const d = res.data;

        added.push(...d.added);
        modified.push(...(d.modified ?? []));
        removed.push(...(d.removed ?? []));

        cursor = d.next_cursor;
        if (!d.has_more) break;
      }

      // Persist updated cursor so future syncs only fetch deltas
      await supabase
        .from("plaid_items")
        .update({ cursor })
        .eq("item_id", item.item_id);

      // Upsert added + modified transactions
      const toUpsert = [...added, ...modified].map(mapTransaction);
      if (toUpsert.length > 0) {
        const { error: upsertErr } = await supabase
          .from("transactions")
          .upsert(toUpsert, { onConflict: "id" });
        if (upsertErr) console.error("[plaid] upsert transactions:", upsertErr.message);
        totalSynced += toUpsert.length;
      }

      // Hard-delete transactions Plaid has removed
      if (removed.length > 0) {
        const ids = removed.map((r) => r.transaction_id);
        await supabase.from("transactions").delete().in("id", ids);
      }

      console.log(
        `[plaid] sync ${item.item_id}: +${added.length} ~${modified.length} -${removed.length}`
      );
    }

    return NextResponse.json({ synced: totalSynced });
  } catch (err: any) {
    const detail = err.response?.data ?? err.message;
    console.error("[plaid] sync error:", detail);
    return NextResponse.json({ error: "Sync failed", detail }, { status: 500 });
  }
}
