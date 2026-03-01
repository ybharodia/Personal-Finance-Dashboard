"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import AccountsPanel from "@/components/AccountsPanel";
import DateRangeFilter, { type DateRange, getPresetRange } from "@/components/DateRangeFilter";
import { BUDGET_CATEGORIES, getCategoryMeta, formatCurrency } from "@/lib/data";
import type { DbAccount, DbTransaction, DbBudget } from "@/lib/database.types";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

type ViewMode = "expense" | "income" | "cashflow";

const RADIAN = Math.PI / 180;
function CustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.04) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatRangeLabel(range: DateRange): string {
  const { from, to, preset } = range;
  if (preset === "this-month") {
    return from.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  const lastDay = new Date(to.getTime() - 86400000);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (from.getFullYear() === lastDay.getFullYear()) {
    return `${fmt(from)} – ${fmt(lastDay)}, ${from.getFullYear()}`;
  }
  return `${fmt(from)}, ${from.getFullYear()} – ${fmt(lastDay)}, ${lastDay.getFullYear()}`;
}

// Spending Tracker circular progress ring
function ProgressRing({ pct }: { pct: number }) {
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(pct, 1));
  const color = pct > 0.9 ? "#ef4444" : pct > 0.7 ? "#f59e0b" : "#6366f1";

  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#e5e7eb" strokeWidth="12" />
      <circle
        cx="70" cy="70" r={r}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 70 70)"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text x="70" y="64" textAnchor="middle" fill="#111827" fontSize="22" fontWeight="700">
        {Math.round(Math.min(pct, 1) * 100)}%
      </text>
      <text x="70" y="80" textAnchor="middle" fill="#9ca3af" fontSize="9">
        of budget
      </text>
    </svg>
  );
}

type SyncStatus = "idle" | "syncing" | "success" | "error";

type Props = {
  accounts: DbAccount[];
  transactions: DbTransaction[];
  budgets: DbBudget[];
};

export default function DashboardClient({ accounts, transactions, budgets }: Props) {
  const router = useRouter();
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("expense");
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange("this-month"));
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncStatus("syncing");
    setSyncError(null);
    try {
      const res = await fetch("/api/plaid/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail;
        const msg =
          typeof detail === "string"
            ? detail
            : detail?.error_message
            ? `${detail.error_code}: ${detail.error_message}`
            : data.error ?? "Sync failed";
        throw new Error(msg);
      }
      setSyncStatus("success");
      router.refresh();
      setTimeout(() => setSyncStatus("idle"), 2500);
    } catch (err: any) {
      setSyncStatus("error");
      setSyncError(err.message ?? "Sync failed");
      setTimeout(() => { setSyncStatus("idle"); setSyncError(null); }, 4000);
    }
  };

  // Transactions filtered by account + date range (drives charts, summary, recent list)
  const filtered = useMemo(() => {
    const fromStr = toIsoDate(dateRange.from);
    const toStr = toIsoDate(dateRange.to);
    let list = selectedAccount
      ? transactions.filter((t) => t.account_id === selectedAccount)
      : transactions;
    return list.filter((t) => t.date >= fromStr && t.date < toStr);
  }, [selectedAccount, dateRange, transactions]);

  const totalIncome = useMemo(
    () => filtered.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
    [filtered]
  );
  const totalExpenses = useMemo(
    () => filtered.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    [filtered]
  );
  const cashFlow = totalIncome - totalExpenses;

  // Donut chart data
  const chartData = useMemo(() => {
    if (viewMode === "income") {
      return totalIncome > 0 ? [{ name: "Income", value: totalIncome, color: "#10b981" }] : [];
    }
    const byCategory: Record<string, number> = {};
    filtered
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
      });
    return Object.entries(byCategory).map(([id, value]) => {
      const meta = getCategoryMeta(id);
      return { name: meta?.name ?? id, value, color: meta?.color ?? "#94a3b8" };
    });
  }, [filtered, viewMode, totalIncome]);

  const recent = useMemo(() => [...filtered].slice(0, 10), [filtered]);

  // ── Spending Tracker — always current calendar month ──────────────────────
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const dayOfMonth = today.getDate();
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const lastMonthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const currentMonthTxns = useMemo(
    () =>
      transactions.filter((t) => {
        if (t.type !== "expense") return false;
        // Parse as local midnight (appending T00:00:00) so that dates like
        // "2026-02-01" are not shifted to the previous month in UTC-offset timezones.
        const d = new Date(t.date + "T00:00:00");
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }),
    [transactions, currentMonth, currentYear]
  );

  const lastMonthSamePointSpent = useMemo(
    () =>
      transactions
        .filter((t) => {
          if (t.type !== "expense") return false;
          // Same local-midnight fix to avoid UTC timezone drift.
          const d = new Date(t.date + "T00:00:00");
          return (
            d.getMonth() === lastMonth &&
            d.getFullYear() === lastMonthYear &&
            d.getDate() <= dayOfMonth
          );
        })
        .reduce((s, t) => s + t.amount, 0),
    [transactions, lastMonth, lastMonthYear, dayOfMonth]
  );

  const currentMonthSpent = currentMonthTxns.reduce((s, t) => s + t.amount, 0);
  const totalBudgeted = budgets.reduce((s, b) => s + b.budgeted_amount, 0);
  const spendingPct = totalBudgeted > 0 ? currentMonthSpent / totalBudgeted : 0;
  const vsLastMonth = currentMonthSpent - lastMonthSamePointSpent;

  const categoryTracker = useMemo(
    () =>
      BUDGET_CATEGORIES.map((meta) => {
        const catBudgeted = budgets
          .filter((b) => b.category === meta.id)
          .reduce((s, b) => s + b.budgeted_amount, 0);
        const catSpent = currentMonthTxns
          .filter((t) => t.category === meta.id)
          .reduce((s, t) => s + t.amount, 0);
        const pct = catBudgeted > 0 ? Math.min(catSpent / catBudgeted, 1) : 0;
        return { ...meta, budgeted: catBudgeted, spent: catSpent, pct };
      }).filter((c) => c.budgeted > 0),
    [budgets, currentMonthTxns]
  );

  // ── Monthly spending for the last 12 months (bar chart) ────────────────────
  const monthlySpending = useMemo(() => {
    const result = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const label = d.toLocaleDateString("en-US", { month: "short" });
      const isCurrent = i === 0;
      const total = transactions
        .filter((t) => {
          if (t.type !== "expense") return false;
          const td = new Date(t.date + "T00:00:00");
          return td.getFullYear() === y && td.getMonth() === m;
        })
        .reduce((s, t) => s + t.amount, 0);
      result.push({ label, total, isCurrent });
    }
    return result;
  }, [transactions]);

  // ── Monthly income for the last 12 months (bar chart) ─────────────────────
  const monthlyIncome = useMemo(() => {
    const result = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const label = d.toLocaleDateString("en-US", { month: "short" });
      const isCurrent = i === 0;
      const total = transactions
        .filter((t) => {
          if (t.type !== "income") return false;
          const td = new Date(t.date + "T00:00:00");
          return td.getFullYear() === y && td.getMonth() === m;
        })
        .reduce((s, t) => s + t.amount, 0);
      result.push({ label, total, isCurrent });
    }
    return result;
  }, [transactions]);

  return (
    <div className="flex h-full">
      <AccountsPanel accounts={accounts} selectedAccount={selectedAccount} onSelect={setSelectedAccount} />

      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-4 md:p-6 space-y-4 md:space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-sm text-gray-400 mt-0.5">{formatRangeLabel(dateRange)}</p>
            </div>
            <div className="flex flex-col items-end gap-1 mt-0.5">
              <button
                onClick={handleSync}
                disabled={syncStatus === "syncing"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  syncStatus === "success"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : syncStatus === "error"
                    ? "bg-red-50 text-red-600 border-red-200"
                    : syncStatus === "syncing"
                    ? "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {syncStatus === "syncing" ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Syncing…
                  </>
                ) : syncStatus === "success" ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Synced!
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Sync
                  </>
                )}
              </button>
              {syncStatus === "error" && syncError && (
                <p className="text-xs text-red-500 max-w-[160px] text-right">{syncError}</p>
              )}
            </div>
          </div>

          {/* Date range filter */}
          <DateRangeFilter value={dateRange} onChange={setDateRange} />

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Total Income", value: totalIncome, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
              { label: "Total Expenses", value: totalExpenses, color: "text-red-500", bg: "bg-red-50", border: "border-red-100" },
              { label: "Cash Flow", value: cashFlow, color: cashFlow >= 0 ? "text-emerald-600" : "text-red-500", bg: cashFlow >= 0 ? "bg-emerald-50" : "bg-red-50", border: cashFlow >= 0 ? "border-emerald-100" : "border-red-100" },
            ].map(({ label, value, color, bg, border }) => (
              <div key={label} className={`${bg} border ${border} rounded-xl px-5 py-4`}>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
                <p className={`text-2xl font-bold tabular-nums ${color}`}>
                  {label === "Total Expenses" ? `-${formatCurrency(value)}` : formatCurrency(value)}
                </p>
              </div>
            ))}
          </div>

          {/* Chart + toggle */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-5 pt-5 pb-0 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Spending by Category</h2>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {(["expense", "income", "cashflow"] as ViewMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setViewMode(m)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      viewMode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {m === "cashflow" ? "Cash Flow" : m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {viewMode === "cashflow" ? (
              <div className="flex items-center justify-center h-56">
                <div className="text-center space-y-1">
                  <p className={`text-3xl font-bold ${cashFlow >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {formatCurrency(cashFlow)}
                  </p>
                  <p className="text-sm text-gray-400">Net cash flow · {formatRangeLabel(dateRange)}</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    labelLine={false}
                    label={CustomLabel}
                  >
                    {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v: number | undefined) => formatCurrency(v ?? 0)}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span style={{ fontSize: 11, color: "#6b7280" }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Recent transactions */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Recent Transactions</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Date", "Account", "Description", "Category", "Amount"].map((h, i) => (
                      <th key={h} className={`px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400 ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-gray-400 text-sm">
                        No transactions in this period.
                      </td>
                    </tr>
                  ) : (
                    recent.map((t) => {
                      const acct = accounts.find((a) => a.id === t.account_id);
                      const meta = getCategoryMeta(t.category);
                      return (
                        <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{t.date}</td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            <span className="text-xs text-gray-600">{acct?.bank_name}</span>
                            <span className="block text-gray-400" style={{ fontSize: 11 }}>{acct ? (acct.custom_name?.trim() || acct.name) : ""}</span>
                          </td>
                          <td className="px-5 py-3 text-gray-700">{t.description}</td>
                          <td className="px-5 py-3">
                            {t.type === "transfer" ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                Transfer
                              </span>
                            ) : meta ? (
                              <span
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                                style={{ backgroundColor: meta.color + "20", color: meta.color }}
                              >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
                                {meta.name}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">{t.subcategory}</span>
                            )}
                          </td>
                          <td className={`px-5 py-3 text-right font-semibold tabular-nums ${t.type === "expense" ? "text-red-500" : t.type === "income" ? "text-emerald-600" : "text-blue-500"}`}>
                            {t.type === "expense" ? "−" : t.type === "income" ? "+" : "⇄"}{formatCurrency(t.amount)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Spending Tracker Widget ── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-700">Spending Tracker</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {today.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </p>
              </div>
            </div>

            {/* Top section: ring + stats */}
            <div className="flex items-center gap-6 mb-5">
              <ProgressRing pct={spendingPct} />

              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-2xl font-bold text-gray-900 tabular-nums">
                    {formatCurrency(currentMonthSpent)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    of {formatCurrency(totalBudgeted)} budgeted ·{" "}
                    <span className={totalBudgeted - currentMonthSpent >= 0 ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold"}>
                      {formatCurrency(Math.abs(totalBudgeted - currentMonthSpent))}{" "}
                      {totalBudgeted - currentMonthSpent >= 0 ? "remaining" : "over budget"}
                    </span>
                  </p>
                </div>

                {lastMonthSamePointSpent > 0 && (
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${vsLastMonth > 0 ? "text-red-500" : "text-emerald-600"}`}>
                    <span className="text-base leading-none">{vsLastMonth > 0 ? "↑" : "↓"}</span>
                    <span>
                      {formatCurrency(Math.abs(vsLastMonth))}{" "}
                      {vsLastMonth > 0 ? "more" : "less"} than {lastMonthNames[lastMonth]} (day {dayOfMonth})
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Category progress bars */}
            {categoryTracker.length > 0 && (
              <div className="space-y-3 border-t border-gray-100 pt-4">
                {categoryTracker.map((c) => (
                  <div key={c.id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                        <span className="text-xs font-medium text-gray-700 truncate">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className="text-xs text-gray-400 tabular-nums">
                          {formatCurrency(c.spent)} / {formatCurrency(c.budgeted)}
                        </span>
                        <span className={`text-xs font-semibold tabular-nums w-8 text-right ${c.pct > 1 ? "text-red-500" : "text-gray-500"}`}>
                          {Math.round(c.pct * 100)}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{
                          width: `${Math.min(c.pct, 1) * 100}%`,
                          backgroundColor: c.pct > 1 ? "#ef4444" : c.pct > 0.85 ? "#f59e0b" : c.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Monthly spending bar chart — last 12 months */}
            <div className="mt-5 border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Monthly Spending
                </h3>
                <span className="text-xs text-gray-400">Last 12 months</span>
              </div>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={monthlySpending} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v: number | undefined) => [formatCurrency(v ?? 0), "Spending"]}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    cursor={{ fill: "#f9fafb" }}
                  />
                  <Bar dataKey="total" radius={[3, 3, 0, 0]} maxBarSize={32}>
                    {monthlySpending.map((entry, i) => (
                      <Cell key={i} fill={entry.isCurrent ? "#6366f1" : "#c7d2fe"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-1 justify-end">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "#6366f1" }} />
                  <span className="text-xs text-gray-400">Current month</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "#c7d2fe" }} />
                  <span className="text-xs text-gray-400">Past months</span>
                </div>
              </div>
            </div>

            {/* Monthly Income bar chart — last 12 months */}
            <div className="mt-5 border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Monthly Income
                </h3>
                <span className="text-xs text-gray-400">Last 12 months</span>
              </div>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={monthlyIncome} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v: number | undefined) => [formatCurrency(v ?? 0), "Income"]}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    cursor={{ fill: "#f9fafb" }}
                  />
                  <Bar dataKey="total" radius={[3, 3, 0, 0]} maxBarSize={32}>
                    {monthlyIncome.map((entry, i) => (
                      <Cell key={i} fill={entry.isCurrent ? "#10b981" : "#a7f3d0"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-1 justify-end">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "#10b981" }} />
                  <span className="text-xs text-gray-400">Current month</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "#a7f3d0" }} />
                  <span className="text-xs text-gray-400">Past months</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
