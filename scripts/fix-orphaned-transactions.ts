/**
 * fix-orphaned-transactions.ts
 *
 * Checks for transactions whose account_id doesn't match any row in the
 * accounts table (orphaned after the dedup migration deleted stale account rows).
 *
 * For each orphaned transaction it tries to find the surviving account for the
 * same institution by matching on (bank_name, type).  If a unique match is
 * found the transaction is re-pointed to that account.  Transactions that
 * can't be matched are reported but left untouched.
 *
 * Usage:
 *   npx tsx scripts/fix-orphaned-transactions.ts
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabaseUrl      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

async function main() {
  // ── 1. Fetch all accounts ────────────────────────────────────────────────
  const { data: accounts, error: acctErr } = await db
    .from("accounts")
    .select("id, bank_name, name, type, plaid_account_id");

  if (acctErr) { console.error("Failed to fetch accounts:", acctErr.message); process.exit(1); }
  const accountSet = new Set((accounts ?? []).map((a) => a.id));
  console.log(`Accounts in DB: ${accountSet.size}`);

  // ── 2. Find orphaned transactions ────────────────────────────────────────
  const { data: txns, error: txErr } = await db
    .from("transactions")
    .select("id, account_id, description, date");

  if (txErr) { console.error("Failed to fetch transactions:", txErr.message); process.exit(1); }

  const orphaned = (txns ?? []).filter((t) => !accountSet.has(t.account_id));

  if (orphaned.length === 0) {
    console.log("✓ No orphaned transactions found — nothing to fix.");
    return;
  }

  console.log(`\n⚠  Found ${orphaned.length} orphaned transaction(s):\n`);

  // Group orphaned transactions by their stale account_id so we can batch
  const byStaleId = new Map<string, typeof orphaned>();
  for (const t of orphaned) {
    const arr = byStaleId.get(t.account_id) ?? [];
    arr.push(t);
    byStaleId.set(t.account_id, arr);
  }

  let fixed   = 0;
  let skipped = 0;

  for (const [staleId, txGroup] of byStaleId) {
    console.log(`  Stale account_id: ${staleId}  (${txGroup.length} transaction(s))`);

    // We don't have the original account row any more, so we can't match on
    // bank_name/type.  Instead, check if any surviving account has a
    // plaid_account_id equal to staleId — that would mean the same Plaid
    // account was re-imported under a different internal row id.
    const matchByPlaid = (accounts ?? []).filter(
      (a) => a.plaid_account_id === staleId || a.id === staleId
    );

    if (matchByPlaid.length === 1) {
      const target = matchByPlaid[0];
      console.log(`    → Matched surviving account: ${target.id} (${target.name})`);

      const ids = txGroup.map((t) => t.id);
      const { error: updateErr } = await db
        .from("transactions")
        .update({ account_id: target.id })
        .in("id", ids);

      if (updateErr) {
        console.error(`    ✗ Update failed: ${updateErr.message}`);
        skipped += txGroup.length;
      } else {
        console.log(`    ✓ Re-pointed ${txGroup.length} transaction(s) → ${target.id}`);
        fixed += txGroup.length;
      }
      continue;
    }

    // No direct plaid_account_id match.  Log details so the user can decide.
    console.log(`    ✗ No surviving account found for stale id "${staleId}".`);
    console.log(`      Transactions:`);
    for (const t of txGroup.slice(0, 5)) {
      console.log(`        ${t.date}  ${t.description}  (${t.id})`);
    }
    if (txGroup.length > 5) console.log(`        … and ${txGroup.length - 5} more`);
    skipped += txGroup.length;
  }

  console.log(`\nDone.  Fixed: ${fixed}  |  Could not fix: ${skipped}`);

  if (skipped > 0) {
    console.log(`
The ${skipped} unmatched transaction(s) above still reference stale account IDs.
Options:
  a) Run the Sync button in the app — Plaid will re-import accounts and
     the next sync will upsert fresh account rows with the correct IDs.
  b) Manually delete these transactions in the Supabase dashboard if they
     are duplicates from a stale connection.
`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
