/**
 * Resolves import/Plaid duplicate transaction pairs.
 *
 * Matches on date + description + amount.
 * For clean 1-to-1 pairs only:
 *   1. Copies category/subcategory/user_categorized from imported row → Plaid row
 *   2. Deletes the imported row (account_id IS NULL)
 *
 * Ambiguous groups (1-to-many or many-to-1) are skipped and reported.
 * Imported rows with NO Plaid match are left untouched.
 *
 * Usage:
 *   npx tsx scripts/fix-duplicate-transactions.ts
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
if (!supabaseUrl || !supabaseKey) {
  console.error("❌  Missing Supabase credentials in .env.local");
  process.exit(1);
}

const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

type TxnRow = {
  id: string;
  date: string;
  description: string;
  amount: number;
  account_id: string | null;
  category: string;
  subcategory: string;
  user_categorized: boolean;
};

async function main() {
  // ── 1. Fetch all transactions ───────────────────────────────────────────────
  const { data, error } = await db
    .from("transactions")
    .select("id, date, description, amount, account_id, category, subcategory, user_categorized")
    .order("date").order("description").order("amount");
  if (error) throw new Error(`Fetch failed: ${error.message}`);
  const rows = data as TxnRow[];
  console.log(`Fetched ${rows.length} total transactions.\n`);

  // ── 2. Group by date|description|amount ────────────────────────────────────
  const groups = new Map<string, TxnRow[]>();
  for (const r of rows) {
    const key = `${r.date}|${r.description}|${r.amount}`;
    const g = groups.get(key) ?? [];
    g.push(r);
    groups.set(key, g);
  }

  // ── 3. Classify groups ─────────────────────────────────────────────────────
  type CleanPair  = { imported: TxnRow; plaid: TxnRow };
  type AmbigGroup = { key: string; imported: TxnRow[]; plaid: TxnRow[] };

  const cleanPairs:   CleanPair[]  = [];
  const ambigGroups:  AmbigGroup[] = [];
  let importedOnly = 0;

  for (const [key, group] of groups) {
    const imported = group.filter((r) => r.account_id === null);
    const plaid    = group.filter((r) => r.account_id !== null);

    if (plaid.length === 0) {
      // No Plaid counterpart — keep all imported rows as-is
      importedOnly += imported.length;
      continue;
    }
    if (imported.length === 0) {
      // Plaid-only group — nothing to do
      continue;
    }
    if (imported.length === 1 && plaid.length === 1) {
      cleanPairs.push({ imported: imported[0], plaid: plaid[0] });
    } else {
      ambigGroups.push({ key, imported, plaid });
    }
  }

  // ── 4. Report safety check ─────────────────────────────────────────────────
  console.log(`Safety check:`);
  console.log(`  Clean 1-to-1 pairs : ${cleanPairs.length}`);
  console.log(`  Ambiguous groups   : ${ambigGroups.length} (skipped)`);
  console.log(`  Import-only rows   : ${importedOnly} (kept)\n`);

  if (ambigGroups.length > 0) {
    console.log("⚠️  Ambiguous groups (skipped):");
    for (const { key, imported, plaid } of ambigGroups) {
      const [date, , amount] = key.split("|");
      console.log(`  date=${date} amount=$${Number(amount).toFixed(2)}  imported×${imported.length} plaid×${plaid.length}`);
      console.log(`    desc=${imported[0].description}`);
    }
    console.log();
  }

  if (cleanPairs.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // ── 5. Step 1: Copy categorization from imported → Plaid ───────────────────
  console.log("Step 1 — Copying categorization from imported rows to Plaid rows...");
  let updated = 0;
  const BATCH = 50;

  for (let i = 0; i < cleanPairs.length; i += BATCH) {
    const batch = cleanPairs.slice(i, i + BATCH);
    for (const { imported, plaid } of batch) {
      const { error: upErr } = await db
        .from("transactions")
        .update({
          category:        imported.category,
          subcategory:     imported.subcategory,
          user_categorized: imported.user_categorized,
        })
        .eq("id", plaid.id);
      if (upErr) {
        console.error(`  ✗ update ${plaid.id}: ${upErr.message}`);
      } else {
        updated++;
      }
    }
    process.stdout.write(`  …${Math.min(i + BATCH, cleanPairs.length)} / ${cleanPairs.length}\r`);
  }
  console.log(`\n  ✅  Updated ${updated} Plaid row(s).\n`);

  // ── 6. Step 2: Delete imported rows from clean pairs ───────────────────────
  console.log("Step 2 — Deleting imported duplicate rows...");
  const idsToDelete = cleanPairs.map((p) => p.imported.id);
  let deleted = 0;

  for (let i = 0; i < idsToDelete.length; i += BATCH) {
    const chunk = idsToDelete.slice(i, i + BATCH);
    const { error: delErr } = await db
      .from("transactions")
      .delete()
      .in("id", chunk)
      .is("account_id", null);   // safety guard — only delete imported rows
    if (delErr) {
      console.error(`  ✗ delete batch ${Math.floor(i / BATCH) + 1}: ${delErr.message}`);
    } else {
      deleted += chunk.length;
    }
    process.stdout.write(`  …${Math.min(i + BATCH, idsToDelete.length)} / ${idsToDelete.length}\r`);
  }
  console.log(`\n  ✅  Deleted ${deleted} imported duplicate row(s).\n`);

  // ── 7. Summary ─────────────────────────────────────────────────────────────
  console.log("Summary:");
  console.log(`  Ambiguous pairs skipped : ${ambigGroups.length}`);
  console.log(`  Plaid rows updated      : ${updated}`);
  console.log(`  Imported rows deleted   : ${deleted}`);
  console.log(`  Imported rows kept      : ${importedOnly}`);
}

main().catch((err) => { console.error("❌", err.message); process.exit(1); });
