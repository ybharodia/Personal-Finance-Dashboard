/**
 * Backfill existing transactions with saved merchant rules.
 *
 * For each rule in merchant_rules, finds all non-user-categorized transactions
 * whose description normalizes to the same key, and updates their
 * category/subcategory if they don't already match the rule.
 *
 * Usage:
 *   npx tsx scripts/backfill-merchant-rules.ts
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

/** Must match the function in lib/recurring.ts exactly. */
function merchantRuleKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/#[\w-]*/g, "")
    .replace(/\b\d{4,}\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  // 1. Fetch all merchant rules
  const { data: rules, error: rulesErr } = await db.from("merchant_rules").select("*");
  if (rulesErr) throw new Error(`Failed to fetch merchant_rules: ${rulesErr.message}`);
  if (!rules?.length) { console.log("No merchant rules found — nothing to backfill."); return; }
  console.log(`Found ${rules.length} merchant rule(s).\n`);

  // 2. Fetch non-user-categorized transactions in the target date range
  const dateFrom = process.env.DATE_FROM ?? "2026-03-01";
  const dateTo   = process.env.DATE_TO   ?? "2026-03-31";
  const { data: txns, error: txnsErr } = await db
    .from("transactions")
    .select("id, description, category, subcategory")
    .eq("user_categorized", false)
    .gte("date", dateFrom)
    .lte("date", dateTo);
  if (txnsErr) throw new Error(`Failed to fetch transactions: ${txnsErr.message}`);
  if (!txns?.length) { console.log(`No non-user-categorized transactions found between ${dateFrom} and ${dateTo}.`); return; }
  console.log(`Scanning ${txns.length} non-user-categorized transaction(s) between ${dateFrom} and ${dateTo}...\n`);

  // 3. Build a map from normalized key → rule for fast lookup
  const ruleMap = new Map(rules.map((r) => [r.merchant_key, r]));

  // 4. Group transactions that need updating by rule
  const toUpdate = new Map<string, { ids: string[]; category: string; subcategory: string; display_name: string }>();
  for (const t of txns) {
    const key = merchantRuleKey(t.description);
    const rule = ruleMap.get(key);
    if (!rule) continue;
    // Skip if already correct
    if (t.category === rule.category && t.subcategory === rule.subcategory) continue;
    const entry = toUpdate.get(rule.merchant_key) ?? {
      ids: [] as string[],
      category: rule.category,
      subcategory: rule.subcategory,
      display_name: rule.display_name,
    };
    entry.ids.push(t.id);
    toUpdate.set(rule.merchant_key, entry);
  }

  if (toUpdate.size === 0) {
    console.log("All transactions already match their merchant rules — nothing to update.");
    return;
  }

  // 5. Apply updates and log per-merchant counts
  let totalUpdated = 0;
  for (const [merchantKey, { ids, category, subcategory, display_name }] of toUpdate) {
    const { error: updateErr } = await db
      .from("transactions")
      .update({ category, subcategory })
      .in("id", ids)
      .eq("user_categorized", false);

    if (updateErr) {
      console.error(`  ✗ ${display_name} (${merchantKey}): ${updateErr.message}`);
    } else {
      console.log(`  ✓ ${display_name} → ${category} / ${subcategory}  (${ids.length} transaction${ids.length === 1 ? "" : "s"})`);
      totalUpdated += ids.length;
    }
  }

  console.log(`\nDone. Updated ${totalUpdated} transaction(s) across ${toUpdate.size} merchant(s).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
