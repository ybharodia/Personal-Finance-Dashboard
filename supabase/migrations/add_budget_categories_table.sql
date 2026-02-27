-- Migration: create budget_categories table for dynamic category management
-- Run this in the Supabase SQL editor: Dashboard → SQL Editor → New query

CREATE TABLE IF NOT EXISTS budget_categories (
  id          TEXT    PRIMARY KEY,
  name        TEXT    NOT NULL,
  color       TEXT    NOT NULL DEFAULT '#6366f1',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Seed with the existing hardcoded categories so nothing breaks
INSERT INTO budget_categories (id, name, color, sort_order) VALUES
  ('housing',        'Housing',                  '#6366f1', 0),
  ('transportation', 'Transportation',            '#f59e0b', 1),
  ('food',           'Food & Groceries',          '#10b981', 2),
  ('insurance',      'Insurance',                 '#3b82f6', 3),
  ('personal',       'Personal & Lifestyle',      '#ec4899', 4),
  ('discretionary',  'Discretionary / Variable',  '#8b5cf6', 5),
  ('jash',           'Jash Support',              '#f97316', 6),
  ('business',       'Business Expense',          '#06b6d4', 7),
  ('savings',        'Savings & Investments',     '#84cc16', 8)
ON CONFLICT (id) DO NOTHING;
