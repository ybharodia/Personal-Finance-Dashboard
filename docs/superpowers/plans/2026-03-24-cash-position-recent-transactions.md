# Cash Position Chart + Recent Transactions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace two dashboard placeholders with a 60-day cash balance area chart (Row 2) and an 8-row recent transactions panel with full edit modal (Row 3 right).

**Architecture:** The API route reconstructs balance history by walking backwards from today's known account balances, reversing each transaction. CashPositionChart self-fetches that route. RecentTransactions is prop-fed from DashboardClient, which already holds all required data. TransactionModal is reused unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, Recharts, Supabase (via `createAdminClient`)

**Spec:** `docs/superpowers/specs/2026-03-24-cash-position-recent-transactions-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/schema.sql` | Modify | Add `daily_balances` table DDL |
| `lib/database.types.ts` | Modify | Add `daily_balances` table type |
| `app/api/balances/history/route.ts` | Create | GET — reconstruct 60-day balance series |
| `components/CashPositionChart.tsx` | Create | Self-fetching area chart widget |
| `components/RecentTransactions.tsx` | Create | 8-row recent transactions + edit modal |
| `components/DashboardClient.tsx` | Modify | Wire in both new components |

---

## Task 1: Add `daily_balances` table to schema and types

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `lib/database.types.ts`

- [ ] **Step 1: Add DDL to schema.sql**

Append to `supabase/schema.sql` after the budgets block:

```sql
-- ── daily_balances ────────────────────────────────────────────────────────────
-- Optional override rows. If a row exists for a date, it takes precedence over
-- the reconstructed value from account balances + transaction history.
CREATE TABLE IF NOT EXISTS daily_balances (
  date          DATE PRIMARY KEY,
  total_balance NUMERIC(12, 2) NOT NULL,
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Run the DDL in Supabase**

Go to Supabase → SQL Editor → New query, and run **only this snippet**:

```sql
CREATE TABLE IF NOT EXISTS daily_balances (
  date          DATE PRIMARY KEY,
  total_balance NUMERIC(12, 2) NOT NULL,
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT now()
);
```

Verify: the `daily_balances` table appears in the Table Editor.

- [ ] **Step 3: Add the type to `lib/database.types.ts`**

Inside the `Tables` block (after `merchant_rules`, before the closing `}`), add:

```ts
      daily_balances: {
        Row: {
          date: string;
          total_balance: number;
          updated_at: string;
        };
        Insert: {
          date: string;
          total_balance: number;
          updated_at?: string;
        };
        Update: {
          date?: string;
          total_balance?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
```

Also add a convenience type at the bottom of the file (after the existing `DbMerchantRule` line):

```ts
export type DbDailyBalance    = Database["public"]["Tables"]["daily_balances"]["Row"];
```

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql lib/database.types.ts
git commit -m "feat: add daily_balances table schema and types"
```

---

## Task 2: Create `/api/balances/history` route

**Files:**
- Create: `app/api/balances/history/route.ts`

The route uses `createAdminClient()` (server-side only — never import this in a client component).

**Algorithm detail:**
- "Liquid" accounts: `account_group IN ('checking', 'savings', 'business_checking', 'investment')`
- Today's total = sum of their current `balance` values
- Walk backwards 59 days: `balancePrevDay = balanceCurrDay - sum(income on currDay) + sum(expenses on currDay)`
- Merge: `daily_balances` rows override reconstructed values (stored row = trusted snapshot)
- Return: `{ date: "YYYY-MM-DD", total_balance: number }[]` sorted oldest → newest (60 points)

- [ ] **Step 1: Create the route file**

```ts
// app/api/balances/history/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

const LIQUID_GROUPS = ["checking", "savings", "business_checking", "investment"];

/** Returns "YYYY-MM-DD" for a Date object using local-date arithmetic */
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add `days` calendar days to a date (negative = subtract) */
function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export async function GET() {
  try {
    const db = createAdminClient();

    // ── 1. Today's total cash balance ─────────────────────────────────────────
    const { data: accounts, error: accErr } = await db
      .from("accounts")
      .select("balance, account_group")
      .in("account_group", LIQUID_GROUPS);

    if (accErr) {
      console.error("[balances/history] accounts error:", accErr.message);
      return NextResponse.json({ error: accErr.message }, { status: 500 });
    }

    const todayTotal = (accounts ?? []).reduce((s, a) => s + Number(a.balance), 0);

    // ── 2. Fetch last 60 days of transactions ─────────────────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sixtyDaysAgo = addDays(today, -59);

    const { data: txns, error: txErr } = await db
      .from("transactions")
      .select("date, amount, type")
      .gte("date", toIsoDate(sixtyDaysAgo))
      .lte("date", toIsoDate(today));

    if (txErr) {
      console.error("[balances/history] transactions error:", txErr.message);
      return NextResponse.json({ error: txErr.message }, { status: 500 });
    }

    // Group transactions by date
    const byDate = new Map<string, { income: number; expenses: number }>();
    for (const t of txns ?? []) {
      const entry = byDate.get(t.date) ?? { income: 0, expenses: 0 };
      if (t.type === "income") entry.income += Number(t.amount);
      else if (t.type === "expense") entry.expenses += Number(t.amount);
      byDate.set(t.date, entry);
    }

    // ── 3. Reconstruct daily balances walking backwards ───────────────────────
    const reconstructed = new Map<string, number>();
    let runningBalance = todayTotal;
    reconstructed.set(toIsoDate(today), runningBalance);

    for (let i = 1; i < 60; i++) {
      const currDay = toIsoDate(addDays(today, -(i - 1)));
      const { income = 0, expenses = 0 } = byDate.get(currDay) ?? {};
      // Reverse today's transactions to get yesterday's closing balance
      runningBalance = runningBalance - income + expenses;
      const prevDay = toIsoDate(addDays(today, -i));
      reconstructed.set(prevDay, runningBalance);
    }

    // ── 4. Merge with stored daily_balances (stored rows take precedence) ─────
    const { data: stored } = await db
      .from("daily_balances")
      .select("date, total_balance")
      .gte("date", toIsoDate(sixtyDaysAgo))
      .lte("date", toIsoDate(today));

    for (const row of stored ?? []) {
      reconstructed.set(row.date, Number(row.total_balance));
    }

    // ── 5. Sort oldest → newest and return ───────────────────────────────────
    const data = Array.from(reconstructed.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, total_balance]) => ({ date, total_balance }));

    return NextResponse.json({ data });
  } catch (err: any) {
    console.error("[balances/history] unexpected error:", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify route works**

Start the dev server (`npm run dev`). In a browser or terminal:

```bash
curl http://localhost:3000/api/balances/history
```

Expected: `{"data":[{"date":"2026-01-23","total_balance":...},...]}`
60 entries, oldest date first, no `"error"` key.

- [ ] **Step 3: Commit**

```bash
git add 'app/api/balances/history/route.ts'
git commit -m "feat: add /api/balances/history — 60-day cash balance reconstruction"
```

---

## Task 3: Create `CashPositionChart`

**Files:**
- Create: `components/CashPositionChart.tsx`

Dependencies: `recharts` (already installed — used in BudgetsClient). `formatCurrency` from `@/lib/data`.

- [ ] **Step 1: Create the component**

```tsx
// components/CashPositionChart.tsx
"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import { formatCurrency } from "@/lib/data";

type DataPoint = { date: string; total_balance: number };

/** Pick 5 evenly-spaced indices from an array of length n */
function fiveIndices(n: number): number[] {
  if (n <= 5) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / 4;
  return [0, 1, 2, 3, 4].map((i) => Math.round(i * step));
}

/** Format "YYYY-MM-DD" → "Jan 15" */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const { date, total_balance } = payload[0].payload as DataPoint;
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm text-sm">
      <p className="text-gray-400 text-xs mb-0.5">{fmtDate(date)}</p>
      <p className="font-semibold text-gray-900 tabular-nums">
        {formatCurrency(total_balance)}
      </p>
    </div>
  );
}

export default function CashPositionChart() {
  const [data, setData] = useState<DataPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/balances/history")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
        } else {
          setData(json.data as DataPoint[]);
        }
      })
      .catch((err) => setError(err.message ?? "Failed to load"));
  }, []);

  const currentBalance = data?.length ? data[data.length - 1].total_balance : null;

  // Build tick set: 5 evenly-spaced dates
  const tickDates = data
    ? fiveIndices(data.length).map((i) => data[i].date)
    : [];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Cash Position
          </p>
          {currentBalance !== null ? (
            <p className="text-2xl font-bold text-gray-900 tabular-nums mt-0.5">
              {formatCurrency(currentBalance)}
            </p>
          ) : (
            <div className="mt-1 h-7 w-32 bg-gray-100 animate-pulse rounded" />
          )}
          <p className="text-xs text-gray-400 mt-0.5">Last 60 days</p>
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 min-h-0">
        {error ? (
          <p className="text-xs text-red-400 mt-4">{error}</p>
        ) : !data ? (
          <div className="h-full bg-gray-100 animate-pulse rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#378ADD" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#378ADD" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                ticks={tickDates}
                tickFormatter={fmtDate}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="total_balance"
                stroke="#378ADD"
                strokeWidth={2}
                fill="url(#balanceGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#378ADD" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify visually**

In the browser at `http://localhost:3000`:
- Row 2 left shows "Cash Position" with a current balance number and area chart
- Hovering shows a tooltip with date + formatted balance
- Chart uses a blue (`#378ADD`) stroke and gradient fill
- 5 x-axis labels visible

- [ ] **Step 3: Commit**

```bash
git add components/CashPositionChart.tsx
git commit -m "feat: add CashPositionChart — 60-day area chart with balance history"
```

---

## Task 4: Create `RecentTransactions`

**Files:**
- Create: `components/RecentTransactions.tsx`

Props: `transactions: DbTransaction[]`, `budgets: DbBudget[]`, `categories: CategoryMeta[]`
Displays 8 most recent. Click → `TransactionModal`. `onSave` receives full `DbTransaction[]` — replaces `localTxns` wholesale. "View all →" links to `/transactions`.

- [ ] **Step 1: Create the component**

```tsx
// components/RecentTransactions.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { DbTransaction, DbBudget } from "@/lib/database.types";
import type { CategoryMeta } from "@/lib/data";
import { getCategoryMeta, formatCurrency } from "@/lib/data";
import TransactionModal from "@/components/TransactionModal";

type Props = {
  transactions: DbTransaction[];
  budgets: DbBudget[];
  categories: CategoryMeta[];
};

/** Format "YYYY-MM-DD" → "Jan 15" */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function RecentTransactions({ transactions, budgets, categories }: Props) {
  const [localTxns, setLocalTxns] = useState<DbTransaction[]>(transactions);
  const [editing, setEditing] = useState<DbTransaction | null>(null);

  const recent = [...localTxns]
    .sort((a, b) => {
      if (b.date !== a.date) return b.date < a.date ? -1 : 1;
      return b.id < a.id ? -1 : 1;
    })
    .slice(0, 8);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 h-full flex flex-col">
      {/* Header */}
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
        Recent Transactions
      </p>

      {/* Rows */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {recent.length === 0 ? (
          <p className="text-sm text-gray-400 text-center mt-6">
            No recent transactions.
          </p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {recent.map((t) => {
              const meta = getCategoryMeta(t.category, categories);
              const isExpense = t.type === "expense";
              return (
                <li
                  key={t.id}
                  onClick={() => setEditing(t)}
                  className="flex items-center gap-2 py-2 cursor-pointer hover:bg-gray-50 rounded-lg px-1 -mx-1 transition-colors"
                >
                  {/* Date */}
                  <span className="text-xs text-gray-400 w-12 shrink-0 tabular-nums">
                    {fmtDate(t.date)}
                  </span>

                  {/* Description */}
                  <span className="flex-1 text-sm text-gray-800 truncate min-w-0">
                    {t.description}
                  </span>

                  {/* Category pill */}
                  <span className="flex items-center gap-1 shrink-0 text-xs text-gray-500 max-w-[90px]">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: meta?.color ?? "#d1d5db" }}
                    />
                    <span className="truncate">{meta?.name ?? t.category}</span>
                  </span>

                  {/* Amount */}
                  <span
                    className={`text-sm font-semibold tabular-nums shrink-0 ${
                      isExpense ? "text-red-500" : "text-emerald-600"
                    }`}
                  >
                    {isExpense ? "-" : ""}
                    {formatCurrency(t.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 flex justify-end border-t border-gray-50 pt-2">
        <Link
          href="/transactions"
          className="text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors"
        >
          View all →
        </Link>
      </div>

      {/* Edit modal */}
      {editing && (
        <TransactionModal
          tx={editing}
          budgets={budgets}
          categories={categories}
          allTransactions={localTxns}
          onClose={() => setEditing(null)}
          onSave={(updatedTxns) => {
            setLocalTxns(updatedTxns);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify visually**

In the browser at `http://localhost:3000`:
- Row 3 right shows "Recent Transactions" header
- 8 rows visible: date, description, colored category dot + name, amount
- Expense amounts in red (`-$XX.XX`), income in green
- Clicking a row opens TransactionModal
- "View all →" link in bottom-right navigates to `/transactions`

- [ ] **Step 3: Commit**

```bash
git add components/RecentTransactions.tsx
git commit -m "feat: add RecentTransactions — 8-row panel with full edit modal"
```

---

## Task 5: Wire both components into `DashboardClient`

**Files:**
- Modify: `components/DashboardClient.tsx` (lines 9–10 imports, lines 167–183 placeholders)

- [ ] **Step 1: Add imports**

At the top of `components/DashboardClient.tsx`, add after the existing `AccountsBox` import (line 10):

```ts
import CashPositionChart from "@/components/CashPositionChart";
import RecentTransactions from "@/components/RecentTransactions";
```

- [ ] **Step 2: Replace Row 2 left placeholder**

Find and replace the cash position placeholder (lines ~167–169):

```tsx
// BEFORE
<div className="flex-[3] min-h-[220px] bg-gray-100 rounded-xl flex items-center justify-center">
  <span className="text-sm text-gray-400 font-medium">Cash Position Chart — coming soon</span>
</div>

// AFTER
<div className="flex-[3] min-h-[220px]">
  <CashPositionChart />
</div>
```

- [ ] **Step 3: Replace Row 3 right placeholder**

Find and replace the recent transactions placeholder (lines ~180–182):

```tsx
// BEFORE
<div className="flex-1 min-h-[220px] bg-gray-100 rounded-xl flex items-center justify-center">
  <span className="text-sm text-gray-400 font-medium">Recent Transactions — coming soon</span>
</div>

// AFTER
<div className="flex-1 min-h-[220px]">
  <RecentTransactions
    transactions={localTxns}
    budgets={budgets}
    categories={categories}
  />
</div>
```

Note: pass `localTxns` (not `transactions`) so the dashboard's own optimistic state is reflected.

- [ ] **Step 4: Final visual check**

In the browser at `http://localhost:3000`:
- [ ] Row 1: three stat cards (Income, Expenses, Cash Flow) ✓ unchanged
- [ ] Row 2 left: CashPositionChart with area chart and header
- [ ] Row 2 right: AccountsBox ✓ unchanged
- [ ] Row 3 left: "30-Day Forecast — coming soon" placeholder ✓ unchanged
- [ ] Row 3 right: RecentTransactions with 8 rows
- [ ] Click a transaction row → TransactionModal opens, can save
- [ ] TypeScript check passes: `npx tsc --noEmit`

- [ ] **Step 5: Run /simplify**

Run the simplify skill on changed files before committing.

- [ ] **Step 6: Commit and push**

```bash
git add components/DashboardClient.tsx
git commit -m "feat: wire CashPositionChart and RecentTransactions into dashboard"
git push origin main
```

---

## Notes

- **`daily_balances` merge:** The stored-row override in the API exists for future use. The table starts empty; all 60 points come from reconstruction. No writes happen to `daily_balances` from this feature.
- **`localTxns` prop:** RecentTransactions receives `localTxns` from DashboardClient, not the original `transactions` prop. This ensures edits made via the dashboard's own date-range view are also reflected here.
- **Height matching:** `h-full` on inner card components requires the parent `div` to have an explicit height or flex constraint. The `min-h-[220px]` on the wrapping `div` provides this floor.
- **Chart data points:** The API returns exactly 60 points (indices 0–59), one per day, sorted oldest → newest. The chart renders all 60; only 5 get x-axis tick labels.
