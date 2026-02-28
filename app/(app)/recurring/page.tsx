import { getTransactionsByDateRange, getRecurringOverrides } from "@/lib/db";
import {
  detectRecurringTransactions,
  buildManualRecurring,
  toMerchantKey,
} from "@/lib/recurring";
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

  const [transactions, overrides] = await Promise.all([
    getTransactionsByDateRange(from, to),
    getRecurringOverrides().catch(() => []), // gracefully degrade if table doesn't exist yet
  ]);

  let recurring = detectRecurringTransactions(transactions);

  // Apply force-excludes: remove merchants the user has dismissed
  const excludedKeys = new Set(
    overrides.filter((o) => !o.is_recurring).map((o) => o.merchant_key)
  );
  recurring = recurring.filter((r) => !excludedKeys.has(r.merchantKey));

  // Apply force-includes: add merchants the user manually flagged as recurring
  const existingKeys = new Set(recurring.map((r) => r.merchantKey));
  for (const override of overrides.filter((o) => o.is_recurring)) {
    if (existingKeys.has(override.merchant_key)) continue; // already detected
    const matching = transactions.filter(
      (tx) => tx.type !== "income" && toMerchantKey(tx.description) === override.merchant_key
    );
    if (matching.length === 0) continue;
    recurring.push(buildManualRecurring(matching, override.merchant_key));
  }

  // Re-sort after applying overrides
  recurring.sort((a, b) => b.monthlyAmount - a.monthlyAmount);

  return <RecurringClient recurring={recurring} allTransactions={transactions} />;
}
