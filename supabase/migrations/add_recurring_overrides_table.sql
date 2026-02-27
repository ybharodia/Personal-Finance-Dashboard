-- recurring_overrides: lets users manually force-include or force-exclude
-- a merchant from the recurring transactions list.
-- merchant_key is the normalized merchant description (see toMerchantKey in lib/recurring.ts).
create table if not exists public.recurring_overrides (
  id          uuid        default gen_random_uuid() primary key,
  merchant_key text       not null unique,
  is_recurring boolean    not null,
  created_at  timestamptz default now() not null
);
