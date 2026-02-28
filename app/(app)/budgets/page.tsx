import { getAccounts, getTransactions, getBudgets, getCategories } from "@/lib/db";
import BudgetsClient from "@/components/BudgetsClient";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [accounts, transactions, budgets, categories] = await Promise.all([
    getAccounts(),
    getTransactions(currentMonth, currentYear),
    getBudgets(),
    getCategories(),
  ]);

  return (
    <BudgetsClient
      accounts={accounts}
      transactions={transactions}
      budgets={budgets}
      categories={categories}
      month={currentMonth}
      year={currentYear}
    />
  );
}
