import { getAccounts, getTransactionsByDateRange, getBudgets, getCategories } from "@/lib/db";
import BudgetsClient from "@/components/BudgetsClient";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const to = new Date(now);
  to.setDate(to.getDate() + 1);
  const toStr = to.toISOString().slice(0, 10);
  const from = new Date(now);
  from.setFullYear(from.getFullYear() - 2);
  const fromStr = from.toISOString().slice(0, 10);

  const [accounts, transactions, budgets, categories] = await Promise.all([
    getAccounts(),
    getTransactionsByDateRange(fromStr, toStr),
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
