-- Backfill user_categorized for transactions that were categorized before the
-- user_categorized column was added (migration: add_user_categorized_to_transactions.sql).
--
-- Strategy: a subcategory that exists in the budgets table was chosen by the user
-- from the app's dropdown. Plaid auto-assigned subcategories (e.g. "General Merchandise
-- Superstores", "Gasoline") are in Plaid's own taxonomy and will not match our budget rows
-- unless the user independently defined a subcategory with the exact same name.
--
-- Run this AFTER add_user_categorized_to_transactions.sql.

UPDATE transactions
SET user_categorized = true
WHERE subcategory IN (
  SELECT DISTINCT subcategory FROM budgets WHERE subcategory != ''
)
AND user_categorized = false;
