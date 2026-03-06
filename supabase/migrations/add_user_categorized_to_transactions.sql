-- Add user_categorized to distinguish user-saved categories from Plaid-auto-assigned ones.
-- Plaid-synced transactions default to false; user edits via TransactionModal set this to true.
-- applyMerchantRules uses this to skip only genuinely user-chosen categories, not Plaid defaults.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_categorized BOOLEAN NOT NULL DEFAULT false;
