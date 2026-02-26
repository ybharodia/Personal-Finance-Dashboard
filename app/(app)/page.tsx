import { getAccounts, getTransactionsByDateRange, getBudgets } from "@/lib/db";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const today = new Date();
  const to = new Date(today);
  to.setDate(to.getDate() + 1);
  const from = new Date(today);
  from.setFullYear(from.getFullYear() - 2);

  const toStr = to.toISOString().slice(0, 10);
  const fromStr = from.toISOString().slice(0, 10);
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const [accounts, transactions, budgets] = await Promise.all([
    getAccounts(),
    getTransactionsByDateRange(fromStr, toStr),
    getBudgets(currentMonth, currentYear),
  ]);

  return (
    <DashboardClient
      accounts={accounts}
      transactions={transactions}
      budgets={budgets}
    />
  );
}
