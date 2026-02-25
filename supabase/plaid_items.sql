-- Run this in the Supabase SQL Editor after setup.sql

CREATE TABLE IF NOT EXISTS plaid_items (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token     TEXT        NOT NULL,
  item_id          TEXT        NOT NULL UNIQUE,
  institution_name TEXT        NOT NULL DEFAULT '',
  cursor           TEXT,                           -- transactionsSync pagination cursor
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
