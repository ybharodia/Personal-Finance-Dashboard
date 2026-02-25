import { getAccounts, getTransactions, getBudgets } from "@/lib/db";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic"; // always fetch fresh data

export default async function DashboardPage() {
  const [accounts, transactions, budgets] = await Promise.all([
    getAccounts(),
    getTransactions(2, 2026),
    getBudgets(2, 2026),
  ]);

  return (
    <DashboardClient
      accounts={accounts}
      transactions={transactions}
      budgets={budgets}
    />
  );
}
