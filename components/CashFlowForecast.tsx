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
              {/* Solid anchor dot at day 0 (today's actual balance) */}
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
              {/* Dashed forecast line with gradient fill */}
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
