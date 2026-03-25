CREATE TABLE IF NOT EXISTS recurring_rules (
  id SERIAL PRIMARY KEY,
  merchant_key TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('checking_savings', 'credit_card')),
  is_recurring BOOLEAN NOT NULL DEFAULT true,
  frequency TEXT CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  transaction_type TEXT CHECK (transaction_type IN ('income', 'expense')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(merchant_key, account_type)
);
