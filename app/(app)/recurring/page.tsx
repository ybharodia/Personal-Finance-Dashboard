import { getTransactionsByDateRange } from "@/lib/db";
import { detectRecurringTransactions } from "@/lib/recurring";
import RecurringClient from "@/components/RecurringClient";

export const dynamic = "force-dynamic";

export default async function RecurringPage() {
  // Fetch 2 years of transactions for reliable recurring detection
  const today = new Date();
  const twoYearsAgo = new Date(
    today.getFullYear() - 2,
    today.getMonth(),
    today.getDate()
  );
  const from = twoYearsAgo.toISOString().split("T")[0];
  // Use tomorrow as exclusive upper bound to include today's transactions
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const to = tomorrow.toISOString().split("T")[0];

  const transactions = await getTransactionsByDateRange(from, to);
  const recurring = detectRecurringTransactions(transactions);

  return <RecurringClient recurring={recurring} />;
}
