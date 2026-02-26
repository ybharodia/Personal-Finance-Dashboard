import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { createAdminClient } from "@/lib/supabase";
import type { Transaction, RemovedTransaction, AccountType, AccountSubtype } from "plaid";

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

function mapAccountType(
  type: AccountType,
  subtype: AccountSubtype | null
): "checking" | "savings" | "credit" {
  if (type === "credit") return "credit";
  const savingsSubtypes = ["savings", "money market", "cd", "ira"];
  if (subtype && savingsSubtypes.includes(subtype)) return "savings";
  return "checking";
}

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

function plaidErrorDetail(err: any) {
  const data = err?.response?.data;
  if (data?.error_code) {
    return `${data.error_type}/${data.error_code}: ${data.error_message}`;
  }
  return err?.message ?? String(err);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST() {
  // Use admin client (service-role key) so RLS doesn't block reads/writes
  const db = createAdminClient();

  try {
    // Fetch all stored Plaid items
    const { data: items, error: itemsErr } = await db
      .from("plaid_items")
      .select("access_token, item_id, cursor, institution_name");

    if (itemsErr) throw new Error(`Fetch plaid_items: ${itemsErr.message}`);
    if (!items?.length) {
      return NextResponse.json({ synced: 0, message: "No connected accounts" });
    }

    console.log(`[plaid] starting sync for ${items.length} item(s)`);

    let totalSynced = 0;
    const itemErrors: string[] = [];

    for (const item of items) {
      if (!item.access_token) {
        console.warn(`[plaid] skipping item ${item.item_id}: missing access_token`);
        continue;
      }

      const added: Transaction[]          = [];
      const modified: Transaction[]       = [];
      const removed: RemovedTransaction[] = [];

      let cursor: string | undefined = item.cursor ?? undefined;

      try {
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
      } catch (plaidErr: any) {
        const msg = plaidErrorDetail(plaidErr);
        console.error(`[plaid] transactionsSync failed for item ${item.item_id}: ${msg}`);
        // Log the full Plaid error payload for debugging
        if (plaidErr?.response?.data) {
          console.error("[plaid] full error payload:", JSON.stringify(plaidErr.response.data, null, 2));
        }
        itemErrors.push(`${item.item_id}: ${msg}`);
        continue; // keep going for other items rather than aborting everything
      }

      // Persist updated cursor so future syncs only fetch deltas
      const { error: cursorErr } = await db
        .from("plaid_items")
        .update({ cursor })
        .eq("item_id", item.item_id);
      if (cursorErr) {
        console.error(`[plaid] failed to update cursor for ${item.item_id}: ${cursorErr.message}`);
      }

      // Upsert added + modified transactions
      const toUpsert = [...added, ...modified].map(mapTransaction);
      if (toUpsert.length > 0) {
        const { error: upsertErr } = await db
          .from("transactions")
          .upsert(toUpsert, { onConflict: "id" });
        if (upsertErr) {
          console.error(`[plaid] upsert transactions for ${item.item_id}: ${upsertErr.message}`);
          itemErrors.push(`${item.item_id} upsert: ${upsertErr.message}`);
        } else {
          totalSynced += toUpsert.length;
        }
      }

      // Hard-delete transactions Plaid has removed
      if (removed.length > 0) {
        const ids = removed.map((r) => r.transaction_id);
        const { error: deleteErr } = await db.from("transactions").delete().in("id", ids);
        if (deleteErr) {
          console.error(`[plaid] delete transactions for ${item.item_id}: ${deleteErr.message}`);
        }
      }

      // Refresh account balances for this item
      try {
        const accountsRes = await plaidClient.accountsGet({ access_token: item.access_token });
        const accountRows = accountsRes.data.accounts.map((a) => ({
          id: a.account_id,
          plaid_account_id: a.account_id,
          bank_name: item.institution_name ?? "",
          name: a.name,
          type: mapAccountType(a.type, a.subtype ?? null),
          balance: a.balances.current ?? 0,
        }));
        if (accountRows.length > 0) {
          const { error: acctErr } = await db
            .from("accounts")
            .upsert(accountRows, { onConflict: "plaid_account_id" });
          if (acctErr) {
            console.error(`[plaid] upsert accounts for ${item.item_id}: ${acctErr.message}`);
          } else {
            // Remove stale accounts for this institution that Plaid no longer returns.
            // Fetch all DB accounts for this bank first, then filter in JS — this
            // avoids a PostgREST NOT-IN format pitfall where quoted values never match.
            const newPlaidIds = new Set(accountRows.map((r) => r.plaid_account_id));
            const { data: existing } = await db
              .from("accounts")
              .select("id, plaid_account_id")
              .eq("bank_name", item.institution_name ?? "");
            const staleIds = (existing ?? [])
              .filter((a) => !newPlaidIds.has(a.plaid_account_id))
              .map((a) => a.id);
            if (staleIds.length > 0) {
              const { error: staleErr } = await db
                .from("accounts")
                .delete()
                .in("id", staleIds);
              if (staleErr) {
                console.warn(`[plaid] could not remove stale accounts for ${item.item_id}: ${staleErr.message}`);
              } else {
                console.log(`[plaid] sync: removed ${staleIds.length} stale account(s) for ${item.institution_name}`);
              }
            }
          }
        }
      } catch (acctErr: any) {
        console.error(`[plaid] accountsGet failed for ${item.item_id}: ${acctErr?.message}`);
      }

      console.log(
        `[plaid] sync ${item.item_id}: +${added.length} ~${modified.length} -${removed.length}`
      );
    }

    if (itemErrors.length > 0) {
      return NextResponse.json(
        { synced: totalSynced, errors: itemErrors },
        { status: 207 }
      );
    }

    return NextResponse.json({ synced: totalSynced });
  } catch (err: any) {
    const msg = plaidErrorDetail(err);
    console.error("[plaid] sync fatal error:", msg);
    const detail = err?.response?.data ?? err?.message;
    return NextResponse.json({ error: "Sync failed", detail }, { status: 500 });
  }
}
