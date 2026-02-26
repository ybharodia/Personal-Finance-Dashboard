-- Migration: add 'transfer' as a valid value for transactions.type
-- Run this in the Supabase SQL editor: Dashboard → SQL Editor → New query

ALTER TABLE transactions DROP CONSTRAINT transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check CHECK (type IN ('income', 'expense', 'transfer'));
