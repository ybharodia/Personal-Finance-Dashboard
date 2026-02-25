-- FinanceOS — one-shot setup
-- Paste this entire file into: Supabase Dashboard → SQL Editor → New query → Run
-- Creates all three tables and seeds them with February 2026 data.

-- ════════════════════════════════════════════════════════════════════════════
-- SCHEMA
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,
  bank_name  TEXT           NOT NULL,
  name       TEXT           NOT NULL,
  type       TEXT           NOT NULL CHECK (type IN ('checking', 'savings', 'credit')),
  balance    NUMERIC(12, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id          TEXT PRIMARY KEY,
  date        DATE           NOT NULL,
  account_id  TEXT           NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  description TEXT           NOT NULL,
  category    TEXT           NOT NULL,
  subcategory TEXT           NOT NULL DEFAULT '',
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  type        TEXT           NOT NULL CHECK (type IN ('income', 'expense'))
);

CREATE INDEX IF NOT EXISTS transactions_date_idx       ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS transactions_account_id_idx ON transactions(account_id);
CREATE INDEX IF NOT EXISTS transactions_category_idx   ON transactions(category);

CREATE TABLE IF NOT EXISTS budgets (
  id               TEXT PRIMARY KEY,
  category         TEXT           NOT NULL,
  subcategory      TEXT           NOT NULL,
  budgeted_amount  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  month            SMALLINT       NOT NULL CHECK (month BETWEEN 1 AND 12),
  year             SMALLINT       NOT NULL,
  UNIQUE (category, subcategory, month, year)
);

CREATE INDEX IF NOT EXISTS budgets_month_year_idx ON budgets(month, year);


-- ════════════════════════════════════════════════════════════════════════════
-- SEED — ACCOUNTS
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO accounts (id, bank_name, name, type, balance) VALUES
  ('pnc-1',   'PNC Bank',           'Virtual Wallet',      'checking',  4821.37),
  ('pnc-2',   'PNC Bank',           'Performance Savings', 'savings',  12450.00),
  ('pnc-3',   'PNC Bank',           'Reserve',             'savings',   3200.00),
  ('chase-1', 'Chase',              'Total Checking',      'checking',  6340.88),
  ('chase-2', 'Chase',              'Sapphire Reserve',    'credit',   -2185.42),
  ('chase-3', 'Chase',              'Freedom Unlimited',   'credit',    -874.19),
  ('boa-1',   'Bank of America',    'Advantage Plus',      'checking',  1925.60),
  ('cap-1',   'Capital One',        '360 Checking',        'checking',  3100.00),
  ('fnb-1',   'First National Bank','Classic Savings',     'savings',   8750.00)
ON CONFLICT (id) DO UPDATE
  SET bank_name = EXCLUDED.bank_name,
      name      = EXCLUDED.name,
      type      = EXCLUDED.type,
      balance   = EXCLUDED.balance;


-- ════════════════════════════════════════════════════════════════════════════
-- SEED — TRANSACTIONS
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO transactions (id, date, account_id, description, category, subcategory, amount, type) VALUES
  -- Housing
  ('t001','2026-02-01','pnc-1',  'Rent Payment - Sunrise Apts',              'housing',       'Rent',                                  1800.00,'expense'),
  ('t002','2026-02-03','pnc-1',  'ComEd Electric Bill',                      'housing',       'Electricity/Gas',                          97.43,'expense'),
  ('t003','2026-02-05','pnc-1',  'City Water Dept',                          'housing',       'Water/Sewer',                              54.20,'expense'),
  ('t004','2026-02-06','chase-1','Xfinity Internet',                         'housing',       'Internet',                                 69.99,'expense'),
  ('t005','2026-02-07','chase-1','State Farm Renters Insurance',              'housing',       'Renters Insurance',                        24.50,'expense'),
  ('t006','2026-02-14','chase-2','Home Depot - Supplies',                    'housing',       'Maintenance/Home Improvement',             43.67,'expense'),
  -- Transportation
  ('t007','2026-02-01','pnc-1',  'VW Financial - Tiguan',                    'transportation','Tiguan Car Payment',                      420.00,'expense'),
  ('t008','2026-02-02','pnc-1',  'Geico Auto Insurance',                     'transportation','Auto Insurance',                          185.00,'expense'),
  ('t009','2026-02-08','chase-2','Shell Gas Station',                        'transportation','Gasoline',                                  52.40,'expense'),
  ('t010','2026-02-15','chase-2','BP Gas Station',                           'transportation','Gasoline',                                  48.17,'expense'),
  ('t011','2026-02-20','chase-2','Speedway Gas',                             'transportation','Gasoline',                                  27.90,'expense'),
  ('t012','2026-02-10','chase-1','Chicago Parking Garage',                   'transportation','Parking/Tolls',                            22.50,'expense'),
  -- Food & Groceries
  ('t013','2026-02-02','chase-3','Whole Foods Market',                       'food',          'Groceries',                               124.37,'expense'),
  ('t014','2026-02-09','chase-3','Mariano''s Fresh Market',                  'food',          'Groceries',                                98.55,'expense'),
  ('t015','2026-02-16','chase-3','Trader Joe''s',                            'food',          'Groceries',                                87.30,'expense'),
  ('t016','2026-02-22','chase-3','Jewel-Osco',                               'food',          'Groceries',                                77.70,'expense'),
  ('t017','2026-02-05','chase-2','Maple & Ash Restaurant',                   'food',          'Dining Out/Restaurants',                   87.60,'expense'),
  ('t018','2026-02-11','chase-2','Big Bowl Thai',                            'food',          'Dining Out/Restaurants',                   43.20,'expense'),
  ('t019','2026-02-17','chase-2','Chipotle Mexican Grill',                   'food',          'Dining Out/Restaurants',                   18.45,'expense'),
  ('t020','2026-02-21','chase-2','Starbucks Coffee',                         'food',          'Dining Out/Restaurants',                    9.75,'expense'),
  ('t021','2026-02-23','chase-2','Lou Malnati''s Pizza',                     'food',          'Dining Out/Restaurants',                   54.45,'expense'),
  -- Insurance
  ('t022','2026-02-01','pnc-1',  'Northwestern Mutual Life Insurance',       'insurance',     'Northwestern Life Insurance',             210.00,'expense'),
  -- Personal & Lifestyle
  ('t023','2026-02-04','pnc-1',  'T-Mobile Wireless',                        'personal',      'T-Mobile Bill',                            85.00,'expense'),
  ('t024','2026-02-01','chase-1','Planet Fitness Monthly',                   'personal',      'Gym Membership',                           45.00,'expense'),
  ('t025','2026-02-12','chase-3','Ulta Beauty',                              'personal',      'Personal Care',                            38.17,'expense'),
  ('t026','2026-02-13','chase-2','Zara - Lincoln Park',                      'personal',      'Clothing & Shoes',                         67.50,'expense'),
  ('t027','2026-02-01','chase-3','Netflix Subscription',                     'personal',      'Subscriptions',                            15.99,'expense'),
  ('t028','2026-02-01','chase-3','Spotify Premium',                          'personal',      'Subscriptions',                            10.99,'expense'),
  ('t029','2026-02-01','chase-3','ChatGPT Plus',                             'personal',      'Subscriptions',                            20.99,'expense'),
  ('t030','2026-02-18','chase-2','AMC Movie Theaters',                       'personal',      'Entertainment',                            34.00,'expense'),
  ('t031','2026-02-22','chase-2','Chicago Museum of Art',                    'personal',      'Entertainment',                            20.00,'expense'),
  ('t032','2026-02-07','chase-3','Amazon.com - Various',                     'personal',      'Amazon Purchases',                         89.43,'expense'),
  ('t033','2026-02-19','chase-3','Amazon.com - Electronics',                 'personal',      'Amazon Purchases',                         53.79,'expense'),
  -- Discretionary / Variable
  ('t034','2026-02-10','chase-3','Target - Household',                       'discretionary', 'Household Items & Supplies',               62.14,'expense'),
  ('t035','2026-02-14','pnc-1',  'PNC Monthly Fee',                          'discretionary', 'Bank Fees/Other',                          12.00,'expense'),
  ('t036','2026-02-08','pnc-1',  'ATM Withdrawal',                           'discretionary', 'ATM/Cash',                                 40.00,'expense'),
  ('t037','2026-02-20','pnc-1',  'ATM Withdrawal',                           'discretionary', 'ATM/Cash',                                 40.00,'expense'),
  -- Jash Support
  ('t038','2026-02-01','chase-1','Zelle - Jash Rent/Living',                 'jash',          'Jash Living Expenses/Rent',               600.00,'expense'),
  ('t039','2026-02-03','chase-1','College Board - Tuition',                  'jash',          'Jash Education',                          150.00,'expense'),
  -- Business Expense
  ('t040','2026-02-05','boa-1',  'Illinois LLC Renewal Fee',                 'business',      'Licensing & Business Expenses',            89.00,'expense'),
  ('t041','2026-02-15','boa-1',  'Merrill Lynch Advisory Fee',               'business',      'Investment Advisory Fee',                 100.00,'expense'),
  -- Savings & Investments
  ('t042','2026-02-01','pnc-2',  'Northwestern Investment - Capital Call',   'savings',       'Northwestern Investment/Capital Call',    500.00,'expense'),
  ('t043','2026-02-01','pnc-2',  'Bharodia Partners - Capital Call',         'savings',       'Bharodia Investment Capital Call',        300.00,'expense'),
  -- Income
  ('t044','2026-02-01','chase-1','Payroll - Direct Deposit',                 'income',        'Salary',                                 5200.00,'income'),
  ('t045','2026-02-15','chase-1','Payroll - Direct Deposit',                 'income',        'Salary',                                 5200.00,'income'),
  ('t046','2026-02-10','boa-1',  'Freelance Consulting',                     'income',        'Freelance',                              1500.00,'income'),
  ('t047','2026-02-20','pnc-2',  'Interest Income',                          'income',        'Interest',                                 42.18,'income')
ON CONFLICT (id) DO UPDATE
  SET date        = EXCLUDED.date,
      account_id  = EXCLUDED.account_id,
      description = EXCLUDED.description,
      category    = EXCLUDED.category,
      subcategory = EXCLUDED.subcategory,
      amount      = EXCLUDED.amount,
      type        = EXCLUDED.type;


-- ════════════════════════════════════════════════════════════════════════════
-- SEED — BUDGETS (February 2026)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO budgets (id, category, subcategory, budgeted_amount, month, year) VALUES
  -- Housing
  ('b001','housing',       'Rent',                                  1800, 2, 2026),
  ('b002','housing',       'Electricity/Gas',                        120, 2, 2026),
  ('b003','housing',       'Water/Sewer',                             60, 2, 2026),
  ('b004','housing',       'Internet',                                70, 2, 2026),
  ('b005','housing',       'Pest Control',                            40, 2, 2026),
  ('b006','housing',       'Renters Insurance',                       25, 2, 2026),
  ('b007','housing',       'Maintenance/Home Improvement',           100, 2, 2026),
  -- Transportation
  ('b008','transportation','Tiguan Car Payment',                     420, 2, 2026),
  ('b009','transportation','Auto Insurance',                         185, 2, 2026),
  ('b010','transportation','Gasoline',                               150, 2, 2026),
  ('b011','transportation','Car Maintenance/Oil Change',              80, 2, 2026),
  ('b012','transportation','Car Registration',                        30, 2, 2026),
  ('b013','transportation','DMV Penalty/Reinstatement Fee',            0, 2, 2026),
  ('b014','transportation','Parking/Tolls',                           40, 2, 2026),
  -- Food & Groceries
  ('b015','food',          'Groceries',                              500, 2, 2026),
  ('b016','food',          'Dining Out/Restaurants',                 250, 2, 2026),
  -- Insurance
  ('b017','insurance',     'Northwestern Life Insurance',            210, 2, 2026),
  -- Personal & Lifestyle
  ('b018','personal',      'T-Mobile Bill',                           85, 2, 2026),
  ('b019','personal',      'Gym Membership',                          45, 2, 2026),
  ('b020','personal',      'Personal Care',                           60, 2, 2026),
  ('b021','personal',      'Clothing & Shoes',                       100, 2, 2026),
  ('b022','personal',      'Subscriptions',                           50, 2, 2026),
  ('b023','personal',      'Entertainment',                           80, 2, 2026),
  ('b024','personal',      'Amazon Purchases',                       100, 2, 2026),
  -- Discretionary / Variable
  ('b025','discretionary', 'Household Items & Supplies',              80, 2, 2026),
  ('b026','discretionary', 'Bank Fees/Other',                         20, 2, 2026),
  ('b027','discretionary', 'ATM/Cash',                               100, 2, 2026),
  -- Jash Support
  ('b028','jash',          'Jash Living Expenses/Rent',              600, 2, 2026),
  ('b029','jash',          'Jash Education',                         200, 2, 2026),
  -- Business Expense
  ('b030','business',      'Licensing & Business Expenses',          150, 2, 2026),
  ('b031','business',      'Investment Advisory Fee',                100, 2, 2026),
  -- Savings & Investments
  ('b032','savings',       'Northwestern Investment/Capital Call',   500, 2, 2026),
  ('b033','savings',       'Bharodia Investment Capital Call',       300, 2, 2026)
ON CONFLICT (id) DO UPDATE
  SET category        = EXCLUDED.category,
      subcategory     = EXCLUDED.subcategory,
      budgeted_amount = EXCLUDED.budgeted_amount,
      month           = EXCLUDED.month,
      year            = EXCLUDED.year;
