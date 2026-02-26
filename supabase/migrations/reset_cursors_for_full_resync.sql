-- reset_cursors_for_full_resync.sql
-- Run this in the Supabase SQL editor: Dashboard → SQL Editor → New query
--
-- Why: a bug in the sync route's stale-account cleanup (now fixed) was
-- deleting all accounts for an institution on every sync, which cascade-deleted
-- all their transactions.  The Plaid cursor was still saved at "end of history",
-- so subsequent syncs returned 0 transactions and Chase data never came back.
--
-- Fix: clear all cursors so the next press of Sync triggers a full historical
-- re-fetch from Plaid for every connected institution.

-- Step 1 — see what will be reset (safe to run first as a preview):
SELECT item_id, institution_name, cursor IS NOT NULL AS had_cursor
FROM plaid_items
ORDER BY institution_name;

-- Step 2 — reset all cursors:
UPDATE plaid_items SET cursor = NULL;

-- Step 3 — confirm:
SELECT item_id, institution_name, cursor
FROM plaid_items
ORDER BY institution_name;
-- cursor column should be NULL for every row.
--
-- After running this, press the Sync button in the app.
-- Plaid will re-deliver the full transaction history for all connected banks.
