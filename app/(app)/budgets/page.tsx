import { getAccounts, getTransactions, getBudgets } from "@/lib/db";
import BudgetsClient from "@/components/BudgetsClient";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const [accounts, transactions, budgets] = await Promise.all([
    getAccounts(),
    getTransactions(2, 2026),
    getBudgets(2, 2026),
  ]);

  return (
    <BudgetsClient
      accounts={accounts}
      transactions={transactions}
      budgets={budgets}
    />
  );
}
