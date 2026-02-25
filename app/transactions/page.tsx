import { getAccounts, getTransactions } from "@/lib/db";
import TransactionsClient from "@/components/TransactionsClient";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const [accounts, transactions] = await Promise.all([
    getAccounts(),
    getTransactions(2, 2026),
  ]);

  return <TransactionsClient accounts={accounts} transactions={transactions} />;
}
