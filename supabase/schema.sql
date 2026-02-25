-- FinanceOS schema
-- Run this once in the Supabase SQL editor: Dashboard → SQL Editor → New query

-- ── accounts ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,
  bank_name  TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  type       TEXT        NOT NULL CHECK (type IN ('checking', 'savings', 'credit')),
  balance    NUMERIC(12, 2) NOT NULL DEFAULT 0
);

-- ── transactions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id          TEXT PRIMARY KEY,
  date        DATE        NOT NULL,
  account_id  TEXT        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  description TEXT        NOT NULL,
  category    TEXT        NOT NULL,
  subcategory TEXT        NOT NULL DEFAULT '',
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  type        TEXT        NOT NULL CHECK (type IN ('income', 'expense'))
);

CREATE INDEX IF NOT EXISTS transactions_date_idx        ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS transactions_account_id_idx  ON transactions(account_id);
CREATE INDEX IF NOT EXISTS transactions_category_idx    ON transactions(category);

-- ── budgets ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id               TEXT PRIMARY KEY,
  category         TEXT        NOT NULL,
  subcategory      TEXT        NOT NULL,
  budgeted_amount  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  month            SMALLINT    NOT NULL CHECK (month BETWEEN 1 AND 12),
  year             SMALLINT    NOT NULL,
  UNIQUE (category, subcategory, month, year)
);

CREATE INDEX IF NOT EXISTS budgets_month_year_idx ON budgets(month, year);
