"use client";

import { useState, useMemo } from "react";
import AccountsPanel from "@/components/AccountsPanel";
import { BUDGET_CATEGORIES, getCategoryMeta, formatCurrency } from "@/lib/data";
import type { DbAccount, DbTransaction, DbBudget } from "@/lib/database.types";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
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

type Props = {
  accounts: DbAccount[];
  transactions: DbTransaction[];
  budgets: DbBudget[];
};

export default function DashboardClient({ accounts, transactions, budgets }: Props) {
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("expense");

  const filtered = useMemo(
    () => selectedAccount ? transactions.filter((t) => t.account_id === selectedAccount) : transactions,
    [selectedAccount, transactions]
  );

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

  // Budget summary — budgeted from DB, spent computed from transactions
  const totalBudgeted = useMemo(() => budgets.reduce((s, b) => s + b.budgeted_amount, 0), [budgets]);
  const totalSpent = useMemo(
    () => transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    [transactions]
  );
  const budgetPct = totalBudgeted > 0 ? Math.min((totalSpent / totalBudgeted) * 100, 100) : 0;

  const recent = useMemo(() => [...filtered].slice(0, 10), [filtered]);

  return (
    <div className="flex h-full">
      <AccountsPanel accounts={accounts} selectedAccount={selectedAccount} onSelect={setSelectedAccount} />

      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-400 mt-0.5">February 2026</p>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
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
                  <p className="text-sm text-gray-400">Net cash flow for February 2026</p>
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
                  {recent.map((t) => {
                    const acct = accounts.find((a) => a.id === t.account_id);
                    const meta = getCategoryMeta(t.category);
                    return (
                      <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{t.date}</td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className="text-xs text-gray-600">{acct?.bank_name}</span>
                          <span className="block text-gray-400" style={{ fontSize: 11 }}>{acct?.name}</span>
                        </td>
                        <td className="px-5 py-3 text-gray-700">{t.description}</td>
                        <td className="px-5 py-3">
                          {meta ? (
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
                        <td className={`px-5 py-3 text-right font-semibold tabular-nums ${t.type === "expense" ? "text-red-500" : "text-emerald-600"}`}>
                          {t.type === "expense" ? "−" : "+"}{formatCurrency(t.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Budget progress */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-700">Monthly Budget</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatCurrency(totalSpent)} spent of {formatCurrency(totalBudgeted)} budgeted
                </p>
              </div>
              <span className={`text-sm font-semibold ${totalSpent > totalBudgeted ? "text-red-500" : "text-emerald-600"}`}>
                {formatCurrency(totalBudgeted - totalSpent)} remaining
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${budgetPct > 90 ? "bg-red-400" : budgetPct > 70 ? "bg-amber-400" : "bg-emerald-500"}`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            <div className="flex justify-between mt-2">
              {BUDGET_CATEGORIES.slice(0, 5).map((c) => {
                const catBudgeted = budgets.filter((b) => b.category === c.id).reduce((s, b) => s + b.budgeted_amount, 0);
                const catSpent = transactions.filter((t) => t.type === "expense" && t.category === c.id).reduce((s, t) => s + t.amount, 0);
                const pct = catBudgeted > 0 ? Math.min((catSpent / catBudgeted) * 100, 100) : 0;
                return (
                  <div key={c.id} className="flex-1 mx-0.5">
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: c.color }} />
                    </div>
                    <p className="text-gray-400 mt-0.5 truncate" style={{ fontSize: 9 }}>{c.name}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
