-- Migration: add 'transfer' as a valid value for transactions.type
-- Run this in the Supabase SQL editor: Dashboard → SQL Editor → New query

-- Step 1: Drop the existing check constraint on transactions.type
-- The constraint name may differ; look it up first if needed.
-- In most Supabase projects the column is defined as TEXT with a CHECK constraint.
-- If your table uses a check constraint named differently, adjust the name below.

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Find the check constraint on transactions.type
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'transactions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE transactions DROP CONSTRAINT %I', constraint_name);
  END IF;
END;
$$;

-- Step 2: Add the new check constraint that allows income, expense, and transfer
ALTER TABLE transactions
  ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('income', 'expense', 'transfer'));
