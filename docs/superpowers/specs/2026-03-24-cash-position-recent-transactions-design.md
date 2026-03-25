# Dashboard Session 3: Cash Position Chart + Recent Transactions

**Date:** 2026-03-24
**Status:** Approved

---

## Overview

Replace two remaining dashboard placeholders with functional components:

1. **CashPositionChart** — 60-day area chart of total liquid cash balance (Row 2, left column)
2. **RecentTransactions** — 8 most recent transactions with full edit modal (Row 3, right column)

The 30-Day Forecast placeholder in Row 3 left remains as-is.

---

## API Route — `GET /api/balances/history`

**Purpose:** Reconstruct 60 days of total cash balance history and return it as a time series.

**Liquid cash accounts:** `account_group IN ('checking', 'savings', 'business_checking', 'investment')`. Credit card accounts (`'credit'`, `'business_credit'`) are excluded — they represent liabilities, not liquid assets.

**Algorithm:**
1. Fetch all liquid cash accounts (filter above). Sum their current `balance` → today's total.
2. Fetch all transactions dated within the last 60 days.
3. Walk backwards from today: for each prior day, reverse that day's transactions (expenses add back, income subtracts) to estimate the prior-day balance.
4. Fetch any existing rows from `daily_balances` table; stored rows override reconstructed values.
5. Return `{ date: string, total_balance: number }[]` sorted oldest → newest, 60 data points.

**`daily_balances` table** (must be created before implementation):
```sql
CREATE TABLE IF NOT EXISTS daily_balances (
  date        date PRIMARY KEY,
  total_balance numeric NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

**Response shape:**
```ts
{ data: Array<{ date: string; total_balance: number }> }
// date is ISO format: "YYYY-MM-DD"
```

**Error handling:** Return `{ error: string }` with appropriate HTTP status on failure. Log errors server-side.

---

## Component — `CashPositionChart`

**File:** `components/CashPositionChart.tsx`
**Type:** `"use client"`, self-fetching

**State:**
- `data: { date: string; total_balance: number }[] | null` — null while loading
- `error: string | null`

**On mount:** fetch `/api/balances/history`. On success populate data. On failure set error.

**Loading state:** Gray animated skeleton bar (same height as chart area, `animate-pulse`).

**Error state:** Short inline message, no crash.

**Layout:**
```
┌─────────────────────────────────────────────┐
│ Cash Position          $XX,XXX.XX           │
│ Last 60 days                                │
│ [AreaChart — full width]                    │
└─────────────────────────────────────────────┘
```

**Chart spec (Recharts):**
- `AreaChart` with `type="monotone"` on the `Area` element
- SVG `linearGradient` from `#6366f1` (100% opacity) → `#6366f1` (0%) top-to-bottom
- No `CartesianGrid`
- No `YAxis`
- `XAxis`: 5 evenly-spaced labels formatted as "MMM DD" (e.g. "Jan 15"), `tickLine={false}`, `axisLine={false}`, small gray text
- Custom `Tooltip`: white card, date + formatted balance
- Stroke: `#6366f1`, strokeWidth 2
- Responsive via `ResponsiveContainer` at 100% width, fixed height ~160px

**Header:**
- "Cash Position" label (small caps, gray)
- Current balance = last data point's `total_balance`, formatted with `formatCurrency`
- "Last 60 days" subtext

---

## Component — `RecentTransactions`

**File:** `components/RecentTransactions.tsx`
**Type:** `"use client"`, prop-fed

**Props:**
```ts
type Props = {
  transactions: DbTransaction[];
  budgets: DbBudget[];
  categories: CategoryMeta[];
};
```

**State:**
- `localTxns: DbTransaction[]` — initialized from `transactions` prop; updated optimistically after modal saves
- `editing: DbTransaction | null` — currently open modal

**Display:** 8 most recent transactions sorted by `date` descending then by `id` descending for stability.

**Row layout:**
```
[date]  [merchant name — truncated]  [category pill]  [amount]
```

- Date: short format "Jan 15"
- Merchant: `t.description`, truncated with `truncate`
- Category pill: colored dot (using `getCategoryMeta(t.category, categories).color`) + category name; gray fallback for uncategorized
- Amount: right-aligned, `tabular-nums`; expenses shown as negative in red (`-$XX.XX`), income in emerald

**Interaction:** Clicking any row opens `TransactionModal` (full modal with all props). `TransactionModal.onSave` receives the full updated `DbTransaction[]` array — replace `localTxns` wholesale with this array.

**Footer:** "View all →" right-aligned link (`<Link href="/transactions">`).

**Empty state:** "No recent transactions." centered message.

---

## DashboardClient Wiring

**File:** `components/DashboardClient.tsx`

Changes:
1. Import `CashPositionChart` and `RecentTransactions`.
2. Replace Row 2 left placeholder with `<CashPositionChart />`.
3. Replace Row 3 right placeholder with `<RecentTransactions transactions={transactions} budgets={budgets} categories={categories} />`.
4. Row 3 left ("30-Day Forecast") remains as placeholder.

No new props needed — `transactions`, `budgets`, `categories` already exist on DashboardClient's Props type.

---

## Data Flow

```
app/page.tsx (server)
  └─ getAccounts(), getTransactions(), getBudgets()
       └─ DashboardClient (client, receives all data)
            ├─ CashPositionChart (client, self-fetches /api/balances/history)
            └─ RecentTransactions (client, receives transactions/budgets/categories)
                 └─ TransactionModal (on row click)
```

---

## Out of Scope

- 30-Day Forecast placeholder (future session)
- Pagination in RecentTransactions (footer link goes to /transactions)
- Writing new `daily_balances` rows from the API (only reads; reconstruction is sufficient)

---

## Files Changed

| File | Change |
|------|--------|
| `app/api/balances/history/route.ts` | New — GET handler |
| `components/CashPositionChart.tsx` | New |
| `components/RecentTransactions.tsx` | New |
| `components/DashboardClient.tsx` | Wire in new components |
