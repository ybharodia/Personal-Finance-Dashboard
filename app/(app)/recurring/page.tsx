import { getTransactionsByDateRange, getRecurringOverrides, getAccounts } from "@/lib/db";
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

  const [transactions, overrides, accounts] = await Promise.all([
    getTransactionsByDateRange(from, to),
    getRecurringOverrides().catch(() => []),
    getAccounts(),
  ]);

  // Separate account IDs by type so recurring detection is scoped per tab
  const checkingSavingsIds = new Set(
    accounts.filter((a) => a.type === "checking" || a.type === "savings").map((a) => a.id)
  );
  const creditIds = new Set(
    accounts.filter((a) => a.type === "credit").map((a) => a.id)
  );

  const checkingSavingsTxns = transactions.filter((tx) => checkingSavingsIds.has(tx.account_id));
  const creditTxns = transactions.filter((tx) => creditIds.has(tx.account_id));

  // Detect recurring independently for each account type
  let checkingSavingsRecurring = detectRecurringTransactions(checkingSavingsTxns);
  const creditRecurring = detectRecurringTransactions(creditTxns);

  // Apply overrides (force-exclude / force-include) only to checking & savings
  const excludedKeys = new Set(
    overrides.filter((o) => !o.is_recurring).map((o) => o.merchant_key)
  );
  checkingSavingsRecurring = checkingSavingsRecurring.filter(
    (r) => !excludedKeys.has(r.merchantKey)
  );

  const existingKeys = new Set(checkingSavingsRecurring.map((r) => r.merchantKey));
  for (const override of overrides.filter((o) => o.is_recurring)) {
    if (existingKeys.has(override.merchant_key)) continue;
    const matching = checkingSavingsTxns.filter(
      (tx) => tx.type !== "income" && toMerchantKey(tx.description) === override.merchant_key
    );
    if (matching.length === 0) continue;
    checkingSavingsRecurring.push(buildManualRecurring(matching, override.merchant_key));
  }

  checkingSavingsRecurring.sort((a, b) => b.monthlyAmount - a.monthlyAmount);

  return (
    <RecurringClient
      recurring={checkingSavingsRecurring}
      allTransactions={checkingSavingsTxns}
      creditRecurring={creditRecurring}
    />
  );
}
