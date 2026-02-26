-- fix_orphaned_transactions.sql
-- Run this in the Supabase SQL editor: Dashboard → SQL Editor → New query
--
-- Purpose: detect transactions whose account_id no longer exists in the
-- accounts table (can happen if the dedup migration deleted the row they
-- pointed to), then re-point them to the surviving account row for the
-- same Plaid account.
--
-- Step 1 — Diagnostic: see which orphaned transactions exist and whether
--           a surviving account can be matched.
--
-- (Run this SELECT first so you can verify the matches look correct.)

SELECT
  t.id                        AS tx_id,
  t.date,
  t.description,
  t.account_id                AS stale_account_id,
  a_new.id                    AS surviving_account_id,
  a_new.name                  AS surviving_account_name,
  a_new.bank_name
FROM transactions t
-- The account_id in the transaction has no matching row:
LEFT JOIN accounts a_old ON a_old.id = t.account_id
-- Try to find the surviving row that has plaid_account_id = stale account_id
LEFT JOIN accounts a_new ON a_new.plaid_account_id = t.account_id
WHERE a_old.id IS NULL   -- transaction is orphaned
ORDER BY t.date DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2 — Fix: re-point orphaned transactions to the surviving account.
--
-- Only updates rows where a unique surviving account can be found via
-- plaid_account_id.  Safe to run multiple times (idempotent).

UPDATE transactions t
SET account_id = a_new.id
FROM accounts a_new
WHERE
  -- Transaction's current account_id has no row in accounts:
  NOT EXISTS (SELECT 1 FROM accounts a_chk WHERE a_chk.id = t.account_id)
  -- A surviving account exists whose plaid_account_id matches the stale id:
  AND a_new.plaid_account_id = t.account_id;

-- Step 3 — Verify: after running the UPDATE, this should return 0 rows.
SELECT COUNT(*) AS still_orphaned
FROM transactions t
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = t.account_id);
