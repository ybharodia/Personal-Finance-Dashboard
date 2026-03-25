// components/CashPositionChart.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  ResponsiveContainer,
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

type CustomTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: DataPoint }>;
};

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const { date, total_balance } = payload[0].payload;
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
    const controller = new AbortController();
    fetch("/api/balances/history", { signal: controller.signal })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
        } else {
          setData(json.data as DataPoint[]);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message ?? "Failed to load");
      });
    return () => controller.abort();
  }, []);

  const currentBalance = useMemo(
    () => (data?.length ? data[data.length - 1].total_balance : null),
    [data],
  );

  // Build tick set: 5 evenly-spaced dates
  const tickDates = useMemo(
    () => (data ? fiveIndices(data.length).map((i) => data[i].date) : []),
    [data],
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 h-full flex flex-col">
      {/* Header */}
      <div className="mb-3">
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

      {/* Chart area */}
      <div className="flex-1 min-h-0">
        {error ? (
          <p className="text-xs text-red-500 mt-4">{error}</p>
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
