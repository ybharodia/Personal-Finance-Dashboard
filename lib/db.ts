import { supabase, createAdminClient } from "./supabase";
import type { DbAccount, DbTransaction, DbBudget, DbRecurringOverride } from "./database.types";
import type { CategoryMeta } from "./data";

const TAG = "[db]";

export async function getAccounts(): Promise<DbAccount[]> {
  console.log(TAG, "getAccounts — url:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("bank_name");
  console.log(TAG, "getAccounts — error:", error, "| count:", data?.length ?? 0);
  if (error) throw new Error(`getAccounts: ${error.message}`);
  return data ?? [];
}

export async function getTransactions(
  month: number,
  year: number
): Promise<DbTransaction[]> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month)}-01`;
  // Use the first day of the next month as an exclusive upper bound — works correctly
  // for every month including February, regardless of leap year.
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${pad(nextMonth)}-01`;

  console.log(TAG, `getTransactions — range: ${start} → <${end}`);
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .gte("date", start)
    .lt("date", end)
    .order("date", { ascending: false });
  console.log(TAG, "getTransactions — error:", error, "| count:", data?.length ?? 0);
  if (error) throw new Error(`getTransactions: ${error.message}`);
  return data ?? [];
}

export async function getTransactionsByDateRange(from: string, to: string): Promise<DbTransaction[]> {
  console.log(TAG, `getTransactionsByDateRange — range: ${from} → <${to}`);
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .gte("date", from)
    .lt("date", to)
    .order("date", { ascending: false });
  console.log(TAG, "getTransactionsByDateRange — error:", error, "| count:", data?.length ?? 0);
  if (error) throw new Error(`getTransactionsByDateRange: ${error.message}`);
  return data ?? [];
}

export async function getCategories(): Promise<CategoryMeta[]> {
  console.log(TAG, "getCategories");
  const { data, error } = await supabase
    .from("budget_categories")
    .select("id, name, color")
    .order("sort_order");
  console.log(TAG, "getCategories — error:", error, "| count:", data?.length ?? 0);
  if (error) throw new Error(`getCategories: ${error.message}`);
  return (data ?? []) as CategoryMeta[];
}

export async function getBudgets(): Promise<DbBudget[]> {
  console.log(TAG, "getBudgets — fetching all permanent budgets");
  // Use admin client so RLS never silently blocks server-side reads.
  const db = createAdminClient();
  const { data, error } = await db
    .from("budgets")
    .select("*");
  console.log(TAG, "getBudgets — error:", error, "| count:", data?.length ?? 0);
  if (error) throw new Error(`getBudgets: ${error.message}`);

  // Deduplicate by (category, subcategory): prefer permanent sentinel rows
  // (month=1, year=1900), otherwise keep the first row encountered.
  // This handles existing month-scoped rows and new permanent ones gracefully.
  const seen = new Map<string, DbBudget>();
  for (const row of data ?? []) {
    const key = `${row.category}::${row.subcategory}`;
    const existing = seen.get(key);
    if (!existing || (row.month === 1 && row.year === 1900)) {
      seen.set(key, row);
    }
  }
  return Array.from(seen.values());
}

export async function getRecurringOverrides(): Promise<DbRecurringOverride[]> {
  console.log(TAG, "getRecurringOverrides");
  // Use admin client so RLS never silently blocks server-side reads.
  const db = createAdminClient();
  const { data, error } = await db
    .from("recurring_overrides")
    .select("*")
    .order("created_at", { ascending: false });
  console.log(TAG, "getRecurringOverrides — error:", error, "| count:", data?.length ?? 0);
  if (error) throw new Error(`getRecurringOverrides: ${error.message}`);
  return data ?? [];
}
