/**
 * Seed script — populates Supabase with the full dummy dataset.
 *
 * Prerequisites:
 *   Tables must exist first. Run supabase/schema.sql in the Supabase SQL editor,
 *   OR run the combined supabase/setup.sql which creates tables AND inserts data in one shot.
 *
 * This script uses the anon key (RLS is off by default on new tables).
 * If you later enable RLS, set SUPABASE_SERVICE_ROLE_KEY in .env.local and
 * the script will automatically use the elevated key instead.
 *
 * Usage:
 *   npm run db:seed
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

// Load .env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

// Prefer service role key (bypasses RLS if enabled), fall back to anon key
const activeKey = serviceRoleKey || anonKey;
if (!serviceRoleKey) {
  console.log("ℹ️   No SUPABASE_SERVICE_ROLE_KEY found — using anon key (requires RLS to be off).");
}

const db = createClient(supabaseUrl, activeKey, {
  auth: { persistSession: false },
});

// ── Seed data ────────────────────────────────────────────────────────────────

const accounts = [
  { id: "pnc-1", bank_name: "PNC Bank", name: "Virtual Wallet", type: "checking", balance: 4821.37 },
  { id: "pnc-2", bank_name: "PNC Bank", name: "Performance Savings", type: "savings", balance: 12450.00 },
  { id: "pnc-3", bank_name: "PNC Bank", name: "Reserve", type: "savings", balance: 3200.00 },
  { id: "chase-1", bank_name: "Chase", name: "Total Checking", type: "checking", balance: 6340.88 },
  { id: "chase-2", bank_name: "Chase", name: "Sapphire Reserve", type: "credit", balance: -2185.42 },
  { id: "chase-3", bank_name: "Chase", name: "Freedom Unlimited", type: "credit", balance: -874.19 },
  { id: "boa-1", bank_name: "Bank of America", name: "Advantage Plus", type: "checking", balance: 1925.60 },
  { id: "cap-1", bank_name: "Capital One", name: "360 Checking", type: "checking", balance: 3100.00 },
  { id: "fnb-1", bank_name: "First National Bank", name: "Classic Savings", type: "savings", balance: 8750.00 },
] as const;

const transactions = [
  // Housing
  { id: "t001", date: "2026-02-01", account_id: "pnc-1", description: "Rent Payment - Sunrise Apts", category: "housing", subcategory: "Rent", amount: 1800.00, type: "expense" },
  { id: "t002", date: "2026-02-03", account_id: "pnc-1", description: "ComEd Electric Bill", category: "housing", subcategory: "Electricity/Gas", amount: 97.43, type: "expense" },
  { id: "t003", date: "2026-02-05", account_id: "pnc-1", description: "City Water Dept", category: "housing", subcategory: "Water/Sewer", amount: 54.20, type: "expense" },
  { id: "t004", date: "2026-02-06", account_id: "chase-1", description: "Xfinity Internet", category: "housing", subcategory: "Internet", amount: 69.99, type: "expense" },
  { id: "t005", date: "2026-02-07", account_id: "chase-1", description: "State Farm Renters Insurance", category: "housing", subcategory: "Renters Insurance", amount: 24.50, type: "expense" },
  { id: "t006", date: "2026-02-14", account_id: "chase-2", description: "Home Depot - Supplies", category: "housing", subcategory: "Maintenance/Home Improvement", amount: 43.67, type: "expense" },
  // Transportation
  { id: "t007", date: "2026-02-01", account_id: "pnc-1", description: "VW Financial - Tiguan", category: "transportation", subcategory: "Tiguan Car Payment", amount: 420.00, type: "expense" },
  { id: "t008", date: "2026-02-02", account_id: "pnc-1", description: "Geico Auto Insurance", category: "transportation", subcategory: "Auto Insurance", amount: 185.00, type: "expense" },
  { id: "t009", date: "2026-02-08", account_id: "chase-2", description: "Shell Gas Station", category: "transportation", subcategory: "Gasoline", amount: 52.40, type: "expense" },
  { id: "t010", date: "2026-02-15", account_id: "chase-2", description: "BP Gas Station", category: "transportation", subcategory: "Gasoline", amount: 48.17, type: "expense" },
  { id: "t011", date: "2026-02-20", account_id: "chase-2", description: "Speedway Gas", category: "transportation", subcategory: "Gasoline", amount: 27.90, type: "expense" },
  { id: "t012", date: "2026-02-10", account_id: "chase-1", description: "Chicago Parking Garage", category: "transportation", subcategory: "Parking/Tolls", amount: 22.50, type: "expense" },
  // Food
  { id: "t013", date: "2026-02-02", account_id: "chase-3", description: "Whole Foods Market", category: "food", subcategory: "Groceries", amount: 124.37, type: "expense" },
  { id: "t014", date: "2026-02-09", account_id: "chase-3", description: "Mariano's Fresh Market", category: "food", subcategory: "Groceries", amount: 98.55, type: "expense" },
  { id: "t015", date: "2026-02-16", account_id: "chase-3", description: "Trader Joe's", category: "food", subcategory: "Groceries", amount: 87.30, type: "expense" },
  { id: "t016", date: "2026-02-22", account_id: "chase-3", description: "Jewel-Osco", category: "food", subcategory: "Groceries", amount: 77.70, type: "expense" },
  { id: "t017", date: "2026-02-05", account_id: "chase-2", description: "Maple & Ash Restaurant", category: "food", subcategory: "Dining Out/Restaurants", amount: 87.60, type: "expense" },
  { id: "t018", date: "2026-02-11", account_id: "chase-2", description: "Big Bowl Thai", category: "food", subcategory: "Dining Out/Restaurants", amount: 43.20, type: "expense" },
  { id: "t019", date: "2026-02-17", account_id: "chase-2", description: "Chipotle Mexican Grill", category: "food", subcategory: "Dining Out/Restaurants", amount: 18.45, type: "expense" },
  { id: "t020", date: "2026-02-21", account_id: "chase-2", description: "Starbucks Coffee", category: "food", subcategory: "Dining Out/Restaurants", amount: 9.75, type: "expense" },
  { id: "t021", date: "2026-02-23", account_id: "chase-2", description: "Lou Malnati's Pizza", category: "food", subcategory: "Dining Out/Restaurants", amount: 54.45, type: "expense" },
  // Insurance
  { id: "t022", date: "2026-02-01", account_id: "pnc-1", description: "Northwestern Mutual Life Insurance", category: "insurance", subcategory: "Northwestern Life Insurance", amount: 210.00, type: "expense" },
  // Personal & Lifestyle
  { id: "t023", date: "2026-02-04", account_id: "pnc-1", description: "T-Mobile Wireless", category: "personal", subcategory: "T-Mobile Bill", amount: 85.00, type: "expense" },
  { id: "t024", date: "2026-02-01", account_id: "chase-1", description: "Planet Fitness Monthly", category: "personal", subcategory: "Gym Membership", amount: 45.00, type: "expense" },
  { id: "t025", date: "2026-02-12", account_id: "chase-3", description: "Ulta Beauty", category: "personal", subcategory: "Personal Care", amount: 38.17, type: "expense" },
  { id: "t026", date: "2026-02-13", account_id: "chase-2", description: "Zara - Lincoln Park", category: "personal", subcategory: "Clothing & Shoes", amount: 67.50, type: "expense" },
  { id: "t027", date: "2026-02-01", account_id: "chase-3", description: "Netflix Subscription", category: "personal", subcategory: "Subscriptions", amount: 15.99, type: "expense" },
  { id: "t028", date: "2026-02-01", account_id: "chase-3", description: "Spotify Premium", category: "personal", subcategory: "Subscriptions", amount: 10.99, type: "expense" },
  { id: "t029", date: "2026-02-01", account_id: "chase-3", description: "ChatGPT Plus", category: "personal", subcategory: "Subscriptions", amount: 20.99, type: "expense" },
  { id: "t030", date: "2026-02-18", account_id: "chase-2", description: "AMC Movie Theaters", category: "personal", subcategory: "Entertainment", amount: 34.00, type: "expense" },
  { id: "t031", date: "2026-02-22", account_id: "chase-2", description: "Chicago Museum of Art", category: "personal", subcategory: "Entertainment", amount: 20.00, type: "expense" },
  { id: "t032", date: "2026-02-07", account_id: "chase-3", description: "Amazon.com - Various", category: "personal", subcategory: "Amazon Purchases", amount: 89.43, type: "expense" },
  { id: "t033", date: "2026-02-19", account_id: "chase-3", description: "Amazon.com - Electronics", category: "personal", subcategory: "Amazon Purchases", amount: 53.79, type: "expense" },
  // Discretionary
  { id: "t034", date: "2026-02-10", account_id: "chase-3", description: "Target - Household", category: "discretionary", subcategory: "Household Items & Supplies", amount: 62.14, type: "expense" },
  { id: "t035", date: "2026-02-14", account_id: "pnc-1", description: "PNC Monthly Fee", category: "discretionary", subcategory: "Bank Fees/Other", amount: 12.00, type: "expense" },
  { id: "t036", date: "2026-02-08", account_id: "pnc-1", description: "ATM Withdrawal", category: "discretionary", subcategory: "ATM/Cash", amount: 40.00, type: "expense" },
  { id: "t037", date: "2026-02-20", account_id: "pnc-1", description: "ATM Withdrawal", category: "discretionary", subcategory: "ATM/Cash", amount: 40.00, type: "expense" },
  // Jash Support
  { id: "t038", date: "2026-02-01", account_id: "chase-1", description: "Zelle - Jash Rent/Living", category: "jash", subcategory: "Jash Living Expenses/Rent", amount: 600.00, type: "expense" },
  { id: "t039", date: "2026-02-03", account_id: "chase-1", description: "College Board - Tuition", category: "jash", subcategory: "Jash Education", amount: 150.00, type: "expense" },
  // Business
  { id: "t040", date: "2026-02-05", account_id: "boa-1", description: "Illinois LLC Renewal Fee", category: "business", subcategory: "Licensing & Business Expenses", amount: 89.00, type: "expense" },
  { id: "t041", date: "2026-02-15", account_id: "boa-1", description: "Merrill Lynch Advisory Fee", category: "business", subcategory: "Investment Advisory Fee", amount: 100.00, type: "expense" },
  // Savings & Investments
  { id: "t042", date: "2026-02-01", account_id: "pnc-2", description: "Northwestern Investment - Capital Call", category: "savings", subcategory: "Northwestern Investment/Capital Call", amount: 500.00, type: "expense" },
  { id: "t043", date: "2026-02-01", account_id: "pnc-2", description: "Bharodia Partners - Capital Call", category: "savings", subcategory: "Bharodia Investment Capital Call", amount: 300.00, type: "expense" },
  // Income
  { id: "t044", date: "2026-02-01", account_id: "chase-1", description: "Payroll - Direct Deposit", category: "income", subcategory: "Salary", amount: 5200.00, type: "income" },
  { id: "t045", date: "2026-02-15", account_id: "chase-1", description: "Payroll - Direct Deposit", category: "income", subcategory: "Salary", amount: 5200.00, type: "income" },
  { id: "t046", date: "2026-02-10", account_id: "boa-1", description: "Freelance Consulting", category: "income", subcategory: "Freelance", amount: 1500.00, type: "income" },
  { id: "t047", date: "2026-02-20", account_id: "pnc-2", description: "Interest Income", category: "income", subcategory: "Interest", amount: 42.18, type: "income" },
] as const;

// Budgets for February 2026
const budgetRows = [
  // Housing
  { id: "b001", category: "housing", subcategory: "Rent", budgeted_amount: 2000, month: 2, year: 2026 },
  { id: "b002", category: "housing", subcategory: "Electricity/Gas", budgeted_amount: 150, month: 2, year: 2026 },
  { id: "b003", category: "housing", subcategory: "Water/Sewer", budgeted_amount: 130, month: 2, year: 2026 },
  { id: "b004", category: "housing", subcategory: "Internet", budgeted_amount: 40, month: 2, year: 2026 },
  { id: "b005", category: "housing", subcategory: "Pest Control", budgeted_amount: 50, month: 2, year: 2026 },
  { id: "b006", category: "housing", subcategory: "Renters Insurance", budgeted_amount: 15, month: 2, year: 2026 },
  { id: "b007", category: "housing", subcategory: "Maintenance/Home Improvement", budgeted_amount: 75, month: 2, year: 2026 },
  // Transportation
  { id: "b008", category: "transportation", subcategory: "Tiguan Car Payment", budgeted_amount: 500, month: 2, year: 2026 },
  { id: "b009", category: "transportation", subcategory: "Auto Insurance", budgeted_amount: 188, month: 2, year: 2026 },
  { id: "b010", category: "transportation", subcategory: "Gasoline", budgeted_amount: 230, month: 2, year: 2026 },
  { id: "b011", category: "transportation", subcategory: "Car Maintenance/Oil Change", budgeted_amount: 100, month: 2, year: 2026 },
  { id: "b012", category: "transportation", subcategory: "Car Registration", budgeted_amount: 83, month: 2, year: 2026 },
  { id: "b013", category: "transportation", subcategory: "DMV Penalty/Reinstatement Fee", budgeted_amount: 62, month: 2, year: 2026 },
  { id: "b014", category: "transportation", subcategory: "Parking/Tolls", budgeted_amount: 20, month: 2, year: 2026 },
  // Food
  { id: "b015", category: "food", subcategory: "Groceries", budgeted_amount: 350, month: 2, year: 2026 },
  { id: "b016", category: "food", subcategory: "Dining Out/Restaurants", budgeted_amount: 500, month: 2, year: 2026 },
  // Insurance
  { id: "b017", category: "insurance", subcategory: "Northwestern Life Insurance", budgeted_amount: 129, month: 2, year: 2026 },
  // Personal
  { id: "b018", category: "personal", subcategory: "T-Mobile Bill", budgeted_amount: 102, month: 2, year: 2026 },
  { id: "b019", category: "personal", subcategory: "Gym Membership", budgeted_amount: 65, month: 2, year: 2026 },
  { id: "b020", category: "personal", subcategory: "Personal Care", budgeted_amount: 75, month: 2, year: 2026 },
  { id: "b021", category: "personal", subcategory: "Clothing & Shoes", budgeted_amount: 300, month: 2, year: 2026 },
  { id: "b022", category: "personal", subcategory: "Subscriptions", budgeted_amount: 60, month: 2, year: 2026 },
  { id: "b023", category: "personal", subcategory: "Entertainment", budgeted_amount: 150, month: 2, year: 2026 },
  { id: "b024", category: "personal", subcategory: "Amazon Purchases", budgeted_amount: 100, month: 2, year: 2026 },
  // Discretionary
  { id: "b025", category: "discretionary", subcategory: "Household Items & Supplies", budgeted_amount: 75, month: 2, year: 2026 },
  { id: "b026", category: "discretionary", subcategory: "Bank Fees/Other", budgeted_amount: 0, month: 2, year: 2026 },
  { id: "b027", category: "discretionary", subcategory: "ATM/Cash", budgeted_amount: 0, month: 2, year: 2026 },
  // Jash
  { id: "b028", category: "jash", subcategory: "Jash Living Expenses/Rent", budgeted_amount: 1000, month: 2, year: 2026 },
  { id: "b029", category: "jash", subcategory: "Jash Education", budgeted_amount: 3220, month: 2, year: 2026 },
  // Business
  { id: "b030", category: "business", subcategory: "Licensing & Business Expenses", budgeted_amount: 0, month: 2, year: 2026 },
  { id: "b031", category: "business", subcategory: "Investment Advisory Fee", budgeted_amount: 50, month: 2, year: 2026 },
  // Savings
  { id: "b032", category: "savings", subcategory: "Northwestern Investment/Capital Call", budgeted_amount: 500, month: 2, year: 2026 },
  { id: "b033", category: "savings", subcategory: "Bharodia Investment Capital Call", budgeted_amount: 300, month: 2, year: 2026 },
];

// ── Upsert helpers ───────────────────────────────────────────────────────────

async function upsert<T extends object>(table: string, rows: T[]) {
  const { error } = await db.from(table).upsert(rows as any, { onConflict: "id" });
  if (error) throw new Error(`upsert ${table}: ${error.message}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱  Seeding FinanceOS database…\n");

  console.log("  → accounts        ", accounts.length, "rows");
  await upsert("accounts", [...accounts]);

  console.log("  → transactions   ", transactions.length, "rows");
  await upsert("transactions", [...transactions]);

  console.log("  → budgets        ", budgetRows.length, "rows");
  await upsert("budgets", budgetRows);

  console.log("\n✅  Seed complete.");
}

main().catch((err) => {
  console.error("❌ ", err.message);
  process.exit(1);
});
