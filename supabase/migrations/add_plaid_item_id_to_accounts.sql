-- Migration: add plaid_item_id to accounts table
-- Run this once in the Supabase SQL Editor before deploying the exchange-token route change.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS plaid_item_id TEXT;

-- Backfill existing rows from plaid_items via the matching plaid_account_id
UPDATE accounts a
SET plaid_item_id = pi.item_id
FROM plaid_items pi
WHERE a.bank_name = pi.institution_name
  AND a.plaid_item_id IS NULL;
