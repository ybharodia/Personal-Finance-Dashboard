-- Migration: add type column to budget_categories
-- Run this in the Supabase SQL editor: Dashboard → SQL Editor → New query

-- 1. Add the column (defaults to 'expense' so all existing rows are safe)
ALTER TABLE budget_categories
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'expense'
    CHECK (type IN ('income', 'expense'));

-- 2. Mark any existing income category as 'income' (none in the default seed,
--    but guard for the case where a user already created one)
UPDATE budget_categories SET type = 'income' WHERE id = 'income';

-- 3. All other seeded categories are already 'expense' via the default — done.
