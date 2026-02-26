-- Migration: add plaid_account_id + custom_name to accounts table
-- Run this in the Supabase SQL editor: Dashboard → SQL Editor → New query

-- Step 1: Deduplicate accounts
-- For each (bank_name, name, type) group, keep the row with the most transactions.
-- Rows with fewer (or zero) transactions are deleted (CASCADE removes their transactions).
WITH ranked AS (
  SELECT
    a.id,
    ROW_NUMBER() OVER (
      PARTITION BY a.bank_name, a.name, a.type
      ORDER BY COUNT(t.id) DESC, a.id ASC
    ) AS rn
  FROM accounts a
  LEFT JOIN transactions t ON t.account_id = a.id
  GROUP BY a.id, a.bank_name, a.name, a.type
)
DELETE FROM accounts
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: Add plaid_account_id column (mirrors id for all existing Plaid-connected accounts)
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS plaid_account_id TEXT;

UPDATE accounts SET plaid_account_id = id WHERE plaid_account_id IS NULL;

ALTER TABLE accounts ALTER COLUMN plaid_account_id SET NOT NULL;

-- Step 3: Create unique index on plaid_account_id so upsert conflicts are reliable
CREATE UNIQUE INDEX IF NOT EXISTS accounts_plaid_account_id_idx
  ON accounts (plaid_account_id);

-- Step 4: Add custom_name column for user-defined display names
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS custom_name TEXT;
