-- Migration: change transactions.account_id FK from ON DELETE CASCADE to ON DELETE SET NULL
-- Run this in the Supabase SQL Editor.
-- Effect: deleting an account no longer deletes its transactions; account_id is set to NULL instead.

ALTER TABLE transactions
  DROP CONSTRAINT transactions_account_id_fkey;

ALTER TABLE transactions
  ALTER COLUMN account_id DROP NOT NULL;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;
