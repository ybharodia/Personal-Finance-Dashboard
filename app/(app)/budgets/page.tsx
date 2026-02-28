import { getAccounts, getTransactions, getBudgets, getCategories } from "@/lib/db";
import BudgetsClient from "@/components/BudgetsClient";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const [accounts, transactions, budgets, categories] = await Promise.all([
    getAccounts(),
    getTransactions(2, 2026),
    getBudgets(),
    getCategories(),
  ]);

  return (
    <BudgetsClient
      accounts={accounts}
      transactions={transactions}
      budgets={budgets}
      categories={categories}
    />
  );
}
