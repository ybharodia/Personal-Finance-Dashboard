/**
 * Seed correct budget amounts into permanent budget rows (month=1, year=1900).
 *
 * Usage:
 *   npx tsx scripts/seed-budget-amounts.ts
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envCandidates = [
  path.resolve(__dirname, "../.env.local"),
  path.resolve(__dirname, "../../../../.env.local"),
];
const envPath = envCandidates.find((p) => { try { fs.accessSync(p); return true; } catch { return false; } });
if (envPath) dotenv.config({ path: envPath });
else dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceRoleKey || anonKey, {
  auth: { persistSession: false },
});

// Target amounts keyed by subcategory name (will match case-insensitively)
const TARGET_AMOUNTS: Record<string, number> = {
  "Rent": 1800,
  "Electricity/Gas": 120,
  "Water/Sewer": 60,
  "Internet": 70,
  "Pest Control": 40,
  "Renters Insurance": 25,
  "Maintenance/Home Improvement": 100,
  "Tiguan Car Payment": 420,
  "Auto Insurance": 185,
  "Gasoline": 150,
  "Car Maintenance/Oil Change": 80,
  "Car Registration": 30,
  "DMV Penalty/Reinstatement Fee": 0,
  "Parking/Tolls": 40,
  "Groceries": 500,
  "Dining Out/Restaurants": 250,
  "Northwestern Life Insurance": 210,
  "T-Mobile Bill": 85,
  "Gym Membership": 45,
  "Personal Care": 60,
  "Clothing & Shoes": 100,
  "Subscriptions": 50,
  "Entertainment": 80,
  "Household Items & Supplies": 80,
  "Bank Fees/Other": 20,
  "ATM/Cash": 100,
  "Jash Living Expenses/Rent": 500,
  "Jash Education": 200,
  "Licensing & Business Expenses": 150,
  "Investment Advisory Fee": 100,
};

async function main() {
  console.log("💸  Seeding correct budget amounts into permanent rows (month=1, year=1900)…\n");

  // 1. Fetch all permanent rows and log their exact names
  const { data: rows, error: fetchErr } = await db
    .from("budgets")
    .select("id, category, subcategory, budgeted_amount")
    .eq("month", 1)
    .eq("year", 1900)
    .order("category")
    .order("subcategory");

  if (fetchErr) {
    console.error("❌  Failed to fetch permanent rows:", fetchErr.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.warn("⚠️   No permanent rows (month=1, year=1900) found. Run migrate-budgets-permanent.ts first.");
    process.exit(1);
  }

  console.log(`📋  Found ${rows.length} permanent budget rows:\n`);
  for (const r of rows) {
    console.log(`     [${r.category}] "${r.subcategory}" → currently $${r.budgeted_amount}`);
  }
  console.log();

  // Build case-insensitive lookup: lowercase subcategory → row
  const rowByLower = new Map<string, typeof rows[0]>();
  for (const r of rows) {
    rowByLower.set(r.subcategory.toLowerCase(), r);
  }

  let updated = 0;
  let unchanged = 0;
  const notFound: string[] = [];

  for (const [subcategory, newAmount] of Object.entries(TARGET_AMOUNTS)) {
    const row = rowByLower.get(subcategory.toLowerCase());
    if (!row) {
      notFound.push(subcategory);
      continue;
    }

    if (row.budgeted_amount === newAmount) {
      console.log(`  ✓ [unchanged]  ${subcategory}: $${newAmount}`);
      unchanged++;
      continue;
    }

    const { error: updateErr } = await db
      .from("budgets")
      .update({ budgeted_amount: newAmount })
      .eq("id", row.id);

    if (updateErr) {
      console.error(`  ❌  Failed to update "${subcategory}":`, updateErr.message);
    } else {
      console.log(`  ✅  Updated       ${subcategory}: $${row.budgeted_amount} → $${newAmount}`);
      updated++;
    }
  }

  if (notFound.length > 0) {
    console.warn("\n⚠️   Could not find permanent rows for these subcategories (skipped):");
    for (const s of notFound) {
      console.warn(`     - "${s}"`);
    }
    console.warn("\n   Tip: Check the names logged above and update TARGET_AMOUNTS if needed.");
  }

  console.log(`\n✅  Done. Updated: ${updated}, Unchanged: ${unchanged}, Not found: ${notFound.length}`);

  // 2. Final verification
  console.log("\n📋  Final permanent budget amounts:");
  const { data: final } = await db
    .from("budgets")
    .select("category, subcategory, budgeted_amount")
    .eq("month", 1)
    .eq("year", 1900)
    .order("category")
    .order("subcategory");

  for (const r of final ?? []) {
    console.log(`     [${r.category}] ${r.subcategory}: $${r.budgeted_amount}`);
  }
}

main().catch((err) => {
  console.error("❌ ", err.message);
  process.exit(1);
});
