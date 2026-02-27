/**
 * Update budget amounts in Supabase to match the spreadsheet.
 * Matches rows by subcategory name and updates budgeted_amount.
 *
 * Usage:
 *   npx tsx scripts/update-budgets.ts
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const activeKey = serviceRoleKey || anonKey;
const db = createClient(supabaseUrl, activeKey, {
  auth: { persistSession: false },
});

// New budget amounts keyed by subcategory name
const updates: Record<string, number> = {
  // Housing
  "Rent": 2000,
  "Electricity/Gas": 150,
  "Water/Sewer": 130,
  "Internet": 40,
  "Pest Control": 50,
  "Renters Insurance": 15,
  "Maintenance/Home Improvement": 75,
  // Transportation
  "Tiguan Car Payment": 500,
  "Auto Insurance": 188,
  "Gasoline": 230,
  "Car Maintenance/Oil Change": 100,
  "Car Registration": 83,
  "DMV Penalty/Reinstatement Fee": 62,
  "Parking/Tolls": 20,
  // Food
  "Groceries": 350,
  "Dining Out/Restaurants": 500,
  // Insurance
  "Northwestern Life Insurance": 129,
  // Personal
  "T-Mobile Bill": 102,
  "Gym Membership": 65,
  "Personal Care": 75,
  "Clothing & Shoes": 300,
  "Subscriptions": 60,
  "Entertainment": 150,
  "Amazon Purchases": 100,
  // Discretionary
  "Household Items & Supplies": 75,
  "Bank Fees/Other": 0,
  "ATM/Cash": 0,
  // Jash
  "Jash Living Expenses/Rent": 1000,
  "Jash Education": 3220,
  // Business
  "Licensing & Business Expenses": 0,
  "Investment Advisory Fee": 50,
};

async function main() {
  console.log("💸  Updating budget amounts in Supabase…\n");

  // Fetch all existing budget rows
  const { data: existing, error: fetchErr } = await db
    .from("budgets")
    .select("id, subcategory, budgeted_amount");

  if (fetchErr) {
    console.error("❌  Failed to fetch budgets:", fetchErr.message);
    process.exit(1);
  }

  if (!existing || existing.length === 0) {
    console.warn("⚠️   No budget rows found in Supabase. Run db:seed first.");
    process.exit(1);
  }

  let updatedCount = 0;
  let skippedCount = 0;
  const notFound: string[] = [];

  for (const [subcategory, newAmount] of Object.entries(updates)) {
    const rows = existing.filter((r) => r.subcategory === subcategory);

    if (rows.length === 0) {
      notFound.push(subcategory);
      continue;
    }

    for (const row of rows) {
      if (row.budgeted_amount === newAmount) {
        console.log(`  ✓ [unchanged]  ${subcategory}: $${newAmount}`);
        skippedCount++;
        continue;
      }

      const { error: updateErr } = await db
        .from("budgets")
        .update({ budgeted_amount: newAmount })
        .eq("id", row.id);

      if (updateErr) {
        console.error(`  ❌  Failed to update "${subcategory}" (id=${row.id}):`, updateErr.message);
      } else {
        console.log(`  ✅  Updated       ${subcategory}: $${row.budgeted_amount} → $${newAmount}`);
        updatedCount++;
      }
    }
  }

  if (notFound.length > 0) {
    console.warn("\n⚠️   Subcategories not found in Supabase (skipped):");
    notFound.forEach((s) => console.warn(`     - ${s}`));
  }

  console.log(`\n✅  Done. Updated: ${updatedCount}, Unchanged: ${skippedCount}, Not found: ${notFound.length}`);

  // Verify — re-fetch and print all budget rows
  console.log("\n📋  Current budget rows in Supabase:");
  const { data: final, error: finalErr } = await db
    .from("budgets")
    .select("category, subcategory, budgeted_amount")
    .order("category")
    .order("subcategory");

  if (finalErr) {
    console.error("❌  Failed to fetch final state:", finalErr.message);
  } else {
    for (const row of final ?? []) {
      console.log(`     [${row.category}] ${row.subcategory}: $${row.budgeted_amount}`);
    }
  }
}

main().catch((err) => {
  console.error("❌ ", err.message);
  process.exit(1);
});
