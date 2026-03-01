/**
 * debug-rent.ts
 *
 * Fetches ALL transactions from February 2026 where category or subcategory
 * contains "rent" or "housing" (case-insensitive) and logs each one so we can
 * diagnose the $382.15 vs $2,382.15 Housing spending mismatch between the
 * Dashboard and Budgets pages.
 *
 * Usage:
 *   npx tsx scripts/debug-rent.ts
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try the worktree-local .env.local first, then fall back to the main repo
// (worktrees live at <repo>/.claude/worktrees/<name>, so ../../../../ is root)
const envPaths = [
  path.resolve(__dirname, "../.env.local"),
  path.resolve(__dirname, "../../../../.env.local"),
];
for (const p of envPaths) {
  const result = dotenv.config({ path: p });
  if (!result.error) break;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Use service role key if available, otherwise fall back to anon key for read-only queries
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function main() {
  console.log("Fetching Housing/Rent transactions for February 2026...\n");

  const { data: txns, error } = await db
    .from("transactions")
    .select("id, date, amount, type, category, subcategory, account_id, description")
    .gte("date", "2026-02-01")
    .lt("date", "2026-03-01")
    .order("date", { ascending: false });

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  const all = txns ?? [];

  // Filter to rent/housing-related transactions
  const rentTxns = all.filter((t) => {
    const cat = (t.category ?? "").toLowerCase();
    const sub = (t.subcategory ?? "").toLowerCase();
    return cat.includes("rent") || cat.includes("housing") ||
           sub.includes("rent") || sub.includes("housing");
  });

  console.log(`Total Feb 2026 transactions: ${all.length}`);
  console.log(`Housing/Rent-related transactions: ${rentTxns.length}\n`);

  if (rentTxns.length === 0) {
    console.log("No rent/housing transactions found. Showing all Feb 2026 transactions:\n");
    for (const t of all) {
      console.log(JSON.stringify(t, null, 2));
    }
    return;
  }

  let dashboardTotal = 0;
  let budgetsTotal = 0;

  console.log("=".repeat(80));
  for (const t of rentTxns) {
    const inDashboard = t.type === "expense";
    const inBudgets = t.type !== "transfer";

    if (inDashboard) dashboardTotal += t.amount;
    if (inBudgets) budgetsTotal += t.amount;

    console.log(`ID:          ${t.id}`);
    console.log(`Date:        ${t.date}`);
    console.log(`Description: ${t.description}`);
    console.log(`Amount:      $${t.amount}`);
    console.log(`Type:        ${t.type}  ← ${inDashboard ? "✓ included in Dashboard" : "✗ EXCLUDED from Dashboard (not 'expense')"}`);
    console.log(`Category:    ${t.category}`);
    console.log(`Subcategory: ${t.subcategory}`);
    console.log(`Account ID:  ${t.account_id}`);
    console.log(`In Budgets:  ${inBudgets ? "✓ yes" : "✗ no"}`);
    console.log("-".repeat(80));
  }

  console.log(`\nDashboard total (type==='expense' only): $${dashboardTotal.toFixed(2)}`);
  console.log(`Budgets total   (type!=='transfer'):     $${budgetsTotal.toFixed(2)}`);
  console.log(`Difference:                              $${(budgetsTotal - dashboardTotal).toFixed(2)}`);

  const excluded = rentTxns.filter((t) => t.type !== "expense" && t.type !== "transfer");
  if (excluded.length > 0) {
    console.log(`\n⚠  ${excluded.length} transaction(s) are excluded from Dashboard but included in Budgets:`);
    for (const t of excluded) {
      console.log(`   ${t.date} | $${t.amount} | type="${t.type}" | ${t.description} | ${t.subcategory}`);
    }
    console.log("\nRoot cause: Dashboard filters type==='expense', Budgets filters type!=='transfer'.");
    console.log("Fix: Change Dashboard to use type!=='transfer' so both pages use identical logic.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
