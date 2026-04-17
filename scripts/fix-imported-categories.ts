/**
 * One-time fix: remaps display-name category values to DB IDs for imported
 * transactions (account_id IS NULL only — never touches synced rows).
 *
 * Usage:
 *   npx tsx scripts/fix-imported-categories.ts
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
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL or anon/service-role key in .env.local");
  process.exit(1);
}

const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const MAPPING: Record<string, string> = {
  "Food & Groceries":         "food",
  "Housing":                  "housing",
  "Transportation":           "transportation",
  "Insurance":                "insurance",
  "Personal & Lifestyle":     "personal",
  "Discretionary / Variable": "discretionary",
  "Jash Support":             "jash",
  "Business Expense":         "business",
  "Savings & Investments":    "savings",
  "Income":                   "income",
};

async function main() {
  // 1. Fetch all budget_categories IDs
  const { data: cats, error: catsErr } = await db
    .from("budget_categories")
    .select("id, name");
  if (catsErr) throw new Error(`Failed to fetch budget_categories: ${catsErr.message}`);

  const existingIds = new Set((cats ?? []).map((c) => c.id));

  console.log("budget_categories IDs in DB:");
  (cats ?? []).forEach((c) => console.log(`  ${c.id.padEnd(16)} (${c.name})`));
  console.log();

  // 2. Validate all target IDs exist
  const targetIds = Object.values(MAPPING);
  const missingIds = targetIds.filter((id) => !existingIds.has(id));
  if (missingIds.length > 0) {
    console.error("❌  Stopping — these target IDs do not exist in budget_categories:");
    missingIds.forEach((id) => console.error(`     "${id}"`));
    process.exit(1);
  }
  console.log("✅  All target IDs confirmed present in budget_categories.\n");

  // 3. Flag "income" ID specifically
  if (existingIds.has("income")) {
    console.log('ℹ️   "income" exists as a budget_categories ID — remapping "Income" → "income" is safe.');
    console.log('     Note: transactions already using type="income" are unaffected; only category column is updated.\n');
  } else {
    console.warn('⚠️   "income" does NOT exist in budget_categories.');
    console.warn('     Rows with category="Income" will be skipped to avoid orphaned data.\n');
    delete MAPPING["Income"];
  }

  // 4. Run updates per mapping entry
  let totalUpdated = 0;

  for (const [oldName, newId] of Object.entries(MAPPING)) {
    const { data, error } = await db
      .from("transactions")
      .update({ category: newId })
      .eq("category", oldName)
      .is("account_id", null)
      .select("id");

    if (error) {
      console.error(`  ✗  "${oldName}" → "${newId}": ${error.message}`);
    } else {
      const count = data?.length ?? 0;
      totalUpdated += count;
      const countStr = String(count).padStart(4);
      const status = count > 0 ? "✓" : "–";
      console.log(`  ${status}  "${oldName}"`.padEnd(42) + `→ "${newId}"  (${countStr} rows)`);
    }
  }

  console.log(`\n✅  Done. Total rows updated: ${totalUpdated}`);
}

main().catch((err) => { console.error("❌", err.message); process.exit(1); });
