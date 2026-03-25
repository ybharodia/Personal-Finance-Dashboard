# 30-Day Cash Flow Forecast Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "30-Day Forecast — coming soon" placeholder in Row 3 left with a self-fetching forecast panel that projects the next 30 days of cash balance using recurring transaction detection.

**Architecture:** A new API route (`/api/forecast`) fetches 90 days of transaction history, detects recurring merchants using two separate thresholds (regular vs. transfer/bill-payment), and projects forward 30 days from today's liquid balance. A self-fetching `CashFlowForecast` component mirrors the pattern of `CashPositionChart` and renders the result as a dual-series Recharts `AreaChart` — solid dot for today's actual balance, dashed green line for the projection. The `fiveIndices` helper is extracted from `CashPositionChart` into `lib/data.ts` so both chart components share it.

**Tech Stack:** Next.js 16 App Router, TypeScript, Recharts, Supabase (`createAdminClient`), Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-03-24-accounts-box-design.md` (design discussed in session chat)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/data.ts` | Modify | Export `fiveIndices` helper (extracted from CashPositionChart) |
| `components/CashPositionChart.tsx` | Modify | Import `fiveIndices` from `@/lib/data` instead of defining it locally |
| `app/api/forecast/route.ts` | Create | GET — recurring detection + 30-day projection |
| `components/CashFlowForecast.tsx` | Create | Self-fetching dual-series area chart widget |
| `components/DashboardClient.tsx` | Modify | Replace Row 3 left placeholder with `<CashFlowForecast />` |

---

## Task 1: Export `fiveIndices` from `lib/data.ts`

**Files:**
- Modify: `lib/data.ts`
- Modify: `components/CashPositionChart.tsx`

`fiveIndices` is currently a private function inside `CashPositionChart.tsx`. `CashFlowForecast` needs the same logic. Extract it to `lib/data.ts` to avoid duplication.

- [ ] **Step 1: Add `fiveIndices` export to `lib/data.ts`**

Append to the bottom of `lib/data.ts` (after `fmtDate`):

```ts
/** Pick 5 evenly-spaced indices from an array of length n */
export function fiveIndices(n: number): number[] {
  if (n <= 5) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / 4;
  return [0, 1, 2, 3, 4].map((i) => Math.round(i * step));
}
```

- [ ] **Step 2: Update `CashPositionChart.tsx` to import from `lib/data`**

In `components/CashPositionChart.tsx`, the import on line 12 currently reads:
```ts
import { formatCurrency, fmtDate } from "@/lib/data";
```

Change it to:
```ts
import { formatCurrency, fmtDate, fiveIndices } from "@/lib/data";
```

Then **delete** the local `fiveIndices` function definition (lines 17–21):
```ts
// DELETE THIS:
/** Pick 5 evenly-spaced indices from an array of length n */
function fiveIndices(n: number): number[] {
  if (n <= 5) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / 4;
  return [0, 1, 2, 3, 4].map((i) => Math.round(i * step));
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/yash/finance-dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/data.ts components/CashPositionChart.tsx
git commit -m "refactor: export fiveIndices from lib/data, import in CashPositionChart"
```

---

## Task 2: Create `app/api/forecast/route.ts`

**Files:**
- Create: `app/api/forecast/route.ts`

This is a Next.js App Router GET handler. Uses `createAdminClient()` — server-side only.

**Algorithm:**
1. Fetch liquid accounts + last 90 days of transactions in parallel
2. Split transactions: `regular` = category does NOT match `/transfer/i`; `transfers` = category matches `/transfer/i`
3. Run `detectRecurring(regular, 0.10)` — threshold 10% (max/min ≤ 1.1)
4. Run `detectRecurring(transfers, 0.40)` — threshold 40% (max/min ≤ 1.4)
5. Today's balance = sum of liquid account balances
6. Project forward 30 days: for each future day, apply any recurring item whose `avgDayOfMonth` is within ±1 of that day-of-month — but only once per calendar month per merchant
7. Return `{ current_balance, projected_balance, data: [{date, balance, is_forecast}] }` — 31 points (day 0 is today, is_forecast: false)

- [ ] **Step 1: Create the file**

```ts
// app/api/forecast/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

const LIQUID_GROUPS = ["checking", "savings", "business_checking", "investment"];
const FORECAST_DAYS = 30;
const LOOKBACK_DAYS = 90;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

type RawTxn = { description: string; amount: number; date: string; type: string; category: string };
type RecurringItem = {
  description: string;
  avgAmount: number;
  avgDayOfMonth: number;
  isIncome: boolean;
};

/**
 * Finds merchants that appear ≥2 times with amounts within `threshold` of each other.
 * threshold = 0.10 means max/min ≤ 1.10 (within 10%).
 * Returns one RecurringItem per qualifying merchant.
 */
function detectRecurring(txns: RawTxn[], threshold: number): RecurringItem[] {
  const groups = new Map<string, Array<{ amount: number; day: number; isIncome: boolean }>>();

  for (const t of txns) {
    // Parse date without timezone shift: split "YYYY-MM-DD" directly
    const day = Number(t.date.split("-")[2]);
    const list = groups.get(t.description) ?? [];
    list.push({ amount: Number(t.amount), day, isIncome: t.type === "income" });
    groups.set(t.description, list);
  }

  const result: RecurringItem[] = [];
  for (const [description, entries] of groups) {
    if (entries.length < 2) continue;
    const amounts = entries.map((e) => e.amount);
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    if (min <= 0) continue;
    if (max / min > 1 + threshold) continue;

    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const avgDay = entries.map((e) => e.day).reduce((a, b) => a + b, 0) / entries.length;
    const isIncome = entries[0].isIncome;

    result.push({ description, avgAmount, avgDayOfMonth: Math.round(avgDay), isIncome });
  }
  return result;
}

export async function GET() {
  try {
    const db = createAdminClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lookbackStart = addDays(today, -LOOKBACK_DAYS);

    const [
      { data: accounts, error: accErr },
      { data: txnRows, error: txErr },
    ] = await Promise.all([
      db.from("accounts").select("balance, account_group").in("account_group", LIQUID_GROUPS),
      db
        .from("transactions")
        .select("description, date, amount, type, category")
        .gte("date", toIsoDate(lookbackStart))
        .lt("date", toIsoDate(today)),
    ]);

    if (accErr) {
      console.error("[forecast] accounts error:", accErr.message);
      return NextResponse.json({ error: accErr.message }, { status: 500 });
    }
    if (txErr) {
      console.error("[forecast] transactions error:", txErr.message);
      return NextResponse.json({ error: txErr.message }, { status: 500 });
    }

    const currentBalance = (accounts ?? []).reduce((s, a) => s + Number(a.balance), 0);

    const allTxns = (txnRows ?? []) as RawTxn[];
    const regularTxns = allTxns.filter((t) => !/transfer/i.test(t.category));
    const transferTxns = allTxns.filter((t) => /transfer/i.test(t.category));

    const regularRecurring = detectRecurring(regularTxns, 0.1);
    const transferRecurring = detectRecurring(transferTxns, 0.4);
    const allRecurring = [...regularRecurring, ...transferRecurring];

    // Project forward FORECAST_DAYS days
    const data: Array<{ date: string; balance: number; is_forecast: boolean }> = [];
    data.push({ date: toIsoDate(today), balance: currentBalance, is_forecast: false });

    let runningBalance = currentBalance;
    // key: `${description}:${yearMonth}` — prevents double-applying same merchant in same month
    const applied = new Set<string>();

    for (let i = 1; i <= FORECAST_DAYS; i++) {
      const day = addDays(today, i);
      const dayOfMonth = day.getDate();
      const yearMonth = day.getFullYear() * 100 + (day.getMonth() + 1);

      for (const item of allRecurring) {
        const key = `${item.description}:${yearMonth}`;
        if (applied.has(key)) continue;
        if (Math.abs(dayOfMonth - item.avgDayOfMonth) <= 1) {
          runningBalance += item.isIncome ? item.avgAmount : -item.avgAmount;
          applied.add(key);
        }
      }

      data.push({ date: toIsoDate(day), balance: runningBalance, is_forecast: true });
    }

    return NextResponse.json({
      current_balance: currentBalance,
      projected_balance: runningBalance,
      data,
    });
  } catch (err: any) {
    console.error("[forecast] unexpected error:", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add 'app/api/forecast/route.ts'
git commit -m "feat: add /api/forecast — 30-day cash flow projection with recurring detection"
```

---

## Task 3: Create `CashFlowForecast` component

**Files:**
- Create: `components/CashFlowForecast.tsx`

Mirrors the structure of `CashPositionChart.tsx`. Key differences:
- Fetches `/api/forecast` instead of `/api/balances/history`
- Renders **two `Area` series** on the same chart:
  - `balance_actual`: solid stroke, non-null only on day 0 (today's anchor point)
  - `balance_forecast`: dashed stroke (`strokeDasharray="4 2"`), non-null for all 31 days (includes day 0 as the join point), has the gradient fill
- Header shows projected balance (day 30) with a muted "projected" label, not current balance
- Gradient uses `#1D9E75` (green), gradient id `"forecastGrad"`
- Tooltip shows "Projected" tag for future dates

**Data transformation:** The API returns `{ date, balance, is_forecast }[]`. The component transforms this into chart points:
```ts
{ date, balance_actual: is_forecast ? null : balance, balance_forecast: balance, is_forecast }
```

- [ ] **Step 1: Create the component**

```tsx
// components/CashFlowForecast.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency, fmtDate, fiveIndices } from "@/lib/data";

type ApiResponse = {
  current_balance: number;
  projected_balance: number;
  data: Array<{ date: string; balance: number; is_forecast: boolean }>;
};

type ChartPoint = {
  date: string;
  balance_actual: number | null;
  balance_forecast: number;
  is_forecast: boolean;
};

type CustomTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
};

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const { date, balance_forecast, is_forecast } = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm text-sm">
      <p className="text-gray-400 text-xs mb-0.5">{fmtDate(date)}</p>
      <p className="font-semibold text-gray-900 tabular-nums">
        {formatCurrency(balance_forecast)}
      </p>
      {is_forecast && <p className="text-xs text-gray-400 mt-0.5">Projected</p>}
    </div>
  );
}

export default function CashFlowForecast() {
  const [raw, setRaw] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/forecast", { signal: controller.signal })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setRaw(json as ApiResponse);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message ?? "Failed to load");
      });
    return () => controller.abort();
  }, []);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!raw) return [];
    return raw.data.map((p) => ({
      date: p.date,
      balance_actual: p.is_forecast ? null : p.balance,
      balance_forecast: p.balance,
      is_forecast: p.is_forecast,
    }));
  }, [raw]);

  const tickDates = useMemo(
    () => (chartData.length ? fiveIndices(chartData.length).map((i) => chartData[i].date) : []),
    [chartData],
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 h-full flex flex-col">
      {/* Header */}
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          30-Day Forecast
        </p>
        {raw ? (
          <p className="text-2xl font-bold text-gray-900 tabular-nums mt-0.5">
            {formatCurrency(raw.projected_balance)}{" "}
            <span className="text-sm font-normal text-gray-400">projected</span>
          </p>
        ) : (
          <div className="mt-1 h-7 w-40 bg-gray-100 animate-pulse rounded" />
        )}
        <p className="text-xs text-gray-400 mt-0.5">Based on recurring transactions</p>
      </div>

      {/* Chart area */}
      <div className="flex-1 min-h-0">
        {error ? (
          <p className="text-xs text-red-500 mt-4">{error}</p>
        ) : !raw ? (
          <div className="h-full bg-gray-100 animate-pulse rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1D9E75" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#1D9E75" stopOpacity={0} />
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
              {/* Solid anchor dot at day 0 (actual balance) */}
              <Area
                type="monotone"
                dataKey="balance_actual"
                stroke="#1D9E75"
                strokeWidth={2}
                fill="none"
                dot={false}
                activeDot={{ r: 4, fill: "#1D9E75" }}
                connectNulls={false}
              />
              {/* Dashed forecast line with gradient fill for all 31 days */}
              <Area
                type="monotone"
                dataKey="balance_forecast"
                stroke="#1D9E75"
                strokeWidth={2}
                strokeDasharray="4 2"
                fill="url(#forecastGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#1D9E75" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/CashFlowForecast.tsx
git commit -m "feat: add CashFlowForecast — 30-day projection with dual-series chart"
```

---

## Task 4: Wire `CashFlowForecast` into `DashboardClient`

**Files:**
- Modify: `components/DashboardClient.tsx` (lines 1–12 imports, lines 177–181 placeholder)

- [ ] **Step 1: Add import**

In `components/DashboardClient.tsx`, add after the `RecentTransactions` import (line 12):

```ts
import CashFlowForecast from "@/components/CashFlowForecast";
```

- [ ] **Step 2: Replace the placeholder**

Find the Row 3 left placeholder (lines 177–181):
```tsx
<div className="flex-1 min-h-[220px] bg-gray-100 rounded-xl flex items-center justify-center">
  <span className="text-sm text-gray-400 font-medium">30-Day Forecast — coming soon</span>
</div>
```

Replace with:
```tsx
<div className="flex-1 min-h-[220px]">
  <CashFlowForecast />
</div>
```

Do NOT touch the Row 3 right `RecentTransactions` panel or any other part of the file.

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Visual check**

Verify in the browser at `http://localhost:3000`:
- Row 3 left: "30-Day Forecast" panel with green dashed area chart and projected balance
- Row 3 right: `RecentTransactions` unchanged
- Row 2: `CashPositionChart` unchanged

- [ ] **Step 5: Run /simplify on changed files**

Run the simplify skill on `app/api/forecast/route.ts`, `components/CashFlowForecast.tsx`, and `components/DashboardClient.tsx`.

- [ ] **Step 6: Commit and push**

```bash
git add components/DashboardClient.tsx
git commit -m "feat: wire CashFlowForecast into dashboard — completes Row 3"
git push origin main
```

---

## Notes

- **`connectNulls={false}`** on the `balance_actual` Area is important — it prevents Recharts from drawing a line between non-adjacent non-null values (there's only one: day 0).
- **Why two Area series instead of one with conditional style:** Recharts doesn't support per-point stroke styles. Two overlapping series with different `dataKey`s is the idiomatic solution.
- **`fiveIndices` extraction:** Only two files change (`lib/data.ts` + `CashPositionChart.tsx`). The function body is identical — this is a pure refactor with no behavioral change.
- **Transfer threshold 40%:** Credit card bill payments vary month to month (e.g. $1,200 one month, $1,500 the next). 10% would miss most of them; 40% catches them without false positives on random transfers.
- **Day-of-month ±1 window:** Handles merchants that don't hit exactly the same day each month (e.g. "15th or 16th"). The `applied` Set prevents double-applying when day 14, 15, and 16 all fall within ±1 of avgDayOfMonth=15.
