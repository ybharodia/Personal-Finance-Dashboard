"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { BUDGET_CATEGORIES, getCategoryMeta, formatCurrency } from "@/lib/data";
import type { DbAccount, DbTransaction, DbBudget } from "@/lib/database.types";

// ── Types ────────────────────────────────────────────────────────────────────

type SubView = {
  name: string;
  budgeted: number;
  spent: number;
  transactions: DbTransaction[];
};

type CatView = {
  id: string;
  name: string;
  color: string;
  budgeted: number;
  spent: number;
  subcategories: SubView[];
};

// ── CategoryRow ───────────────────────────────────────────────────────────────

function CategoryRow({ cat, accounts }: { cat: CatView; accounts: DbAccount[] }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedSub, setExpandedSub] = useState<string | null>(null);
  const remaining = cat.budgeted - cat.spent;
  const pct = cat.budgeted > 0 ? Math.min((cat.spent / cat.budgeted) * 100, 100) : 0;
  const over = cat.spent > cat.budgeted;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
          <span className="font-semibold text-gray-800 text-sm">{cat.name}</span>
          <span className="text-xs text-gray-400">{cat.subcategories.length} categories</span>
        </div>
        <div className="flex items-center gap-6 shrink-0 ml-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-gray-400">Budgeted</p>
            <p className="text-sm font-medium text-gray-700 tabular-nums">{formatCurrency(cat.budgeted)}</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-gray-400">Spent</p>
            <p className={`text-sm font-medium tabular-nums ${over ? "text-red-500" : "text-gray-700"}`}>{formatCurrency(cat.spent)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Remaining</p>
            <p className={`text-sm font-semibold tabular-nums ${remaining < 0 ? "text-red-500" : "text-emerald-600"}`}>
              {formatCurrency(remaining)}
            </p>
          </div>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Category progress bar */}
      <div className="px-5 pb-3">
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: over ? "#ef4444" : cat.color }} />
        </div>
        <p className="text-xs text-gray-400 mt-1">{pct.toFixed(0)}% used</p>
      </div>

      {/* Subcategories */}
      {expanded && (
        <div className="border-t border-gray-100">
          {cat.subcategories.map((sc) => {
            const subPct = sc.budgeted > 0 ? Math.min((sc.spent / sc.budgeted) * 100, 100) : 0;
            const subOver = sc.spent > sc.budgeted;
            const subKey = `${cat.id}-${sc.name}`;
            const isOpen = expandedSub === subKey;

            return (
              <div key={sc.name} className="border-b border-gray-50 last:border-0">
                <button
                  onClick={() => setExpandedSub(isOpen ? null : subKey)}
                  className="w-full flex items-center px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-600 font-medium">{sc.name}</span>
                      <div className="flex items-center gap-4 shrink-0 ml-4">
                        <span className="text-xs text-gray-400 hidden sm:inline">
                          {formatCurrency(sc.spent)} / {formatCurrency(sc.budgeted)}
                        </span>
                        <span className={`text-sm font-semibold tabular-nums ${subOver ? "text-red-500" : "text-emerald-600"}`}>
                          {formatCurrency(sc.budgeted - sc.spent)}
                        </span>
                        {sc.transactions.length > 0 && (
                          <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1">
                      <div className="h-1 rounded-full" style={{ width: `${subPct}%`, backgroundColor: subOver ? "#ef4444" : cat.color }} />
                    </div>
                  </div>
                </button>

                {/* Sub-transactions */}
                {isOpen && sc.transactions.length > 0 && (
                  <div className="bg-gray-50 border-t border-gray-100">
                    {sc.transactions.map((t) => {
                      const acct = accounts.find((a) => a.id === t.account_id);
                      return (
                        <div key={t.id} className="flex items-center justify-between px-8 py-2 border-b border-gray-100 last:border-0">
                          <div className="flex items-center gap-4">
                            <span className="text-xs font-mono text-gray-400">{t.date}</span>
                            <div>
                              <p className="text-xs text-gray-700">{t.description}</p>
                              <p className="text-gray-400" style={{ fontSize: 10 }}>{acct?.bank_name} · {acct?.name}</p>
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-red-500 tabular-nums">
                            −{formatCurrency(t.amount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  accounts: DbAccount[];
  transactions: DbTransaction[];
  budgets: DbBudget[];
};

export default function BudgetsClient({ accounts, transactions, budgets }: Props) {
  // Build category views: merge static metadata + budget rows + computed spent
  const categoryViews = useMemo((): CatView[] => {
    return BUDGET_CATEGORIES.map((meta) => {
      const catBudgets = budgets.filter((b) => b.category === meta.id);
      const catTxns = transactions.filter((t) => t.type === "expense" && t.category === meta.id);

      const subcategories: SubView[] = catBudgets.map((b) => {
        const subTxns = catTxns.filter((t) => t.subcategory === b.subcategory);
        return {
          name: b.subcategory,
          budgeted: b.budgeted_amount,
          spent: subTxns.reduce((s, t) => s + t.amount, 0),
          transactions: subTxns,
        };
      });

      return {
        id: meta.id,
        name: meta.name,
        color: meta.color,
        budgeted: subcategories.reduce((s, sc) => s + sc.budgeted, 0),
        spent: subcategories.reduce((s, sc) => s + sc.spent, 0),
        subcategories,
      };
    });
  }, [budgets, transactions]);

  const totalBudgeted = categoryViews.reduce((s, c) => s + c.budgeted, 0);
  const totalSpent = categoryViews.reduce((s, c) => s + c.spent, 0);
  const totalRemaining = totalBudgeted - totalSpent;
  const overallPct = totalBudgeted > 0 ? Math.min((totalSpent / totalBudgeted) * 100, 100) : 0;

  // Bar chart
  const chartData = categoryViews.map((c) => ({
    name: c.name,
    Budgeted: parseFloat(c.budgeted.toFixed(2)),
    Spent: parseFloat(c.spent.toFixed(2)),
    color: c.color,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
        <p className="font-semibold text-gray-800 mb-2">{label}</p>
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center justify-between gap-6">
            <span className="text-gray-500">{p.name}</span>
            <span className="font-semibold" style={{ color: p.fill }}>{formatCurrency(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  function wrapLabel(name: string): [string, string] {
    if (name.includes("/")) {
      const idx = name.indexOf("/");
      return [name.slice(0, idx + 1).trim(), name.slice(idx + 1).trim()];
    }
    if (name.includes("&")) {
      const idx = name.indexOf("&");
      return [name.slice(0, idx + 1).trim(), name.slice(idx + 1).trim()];
    }
    const words = name.split(" ");
    if (words.length <= 1) return [name, ""];
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  }

  function CustomXTick({ x, y, payload }: any) {
    const [line1, line2] = wrapLabel(payload.value as string);
    return (
      <g transform={`translate(${x},${y})`}>
        <text textAnchor="middle" fill="#374151" fontWeight="700" fontSize={10}>
          <tspan x="0" dy="12">{line1}</tspan>
          {line2 && <tspan x="0" dy="13">{line2}</tspan>}
        </text>
      </g>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budgets</h1>
          <p className="text-sm text-gray-400 mt-0.5">February 2026</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Total Budgeted</p>
            <p className="text-2xl font-bold text-gray-800 tabular-nums">{formatCurrency(totalBudgeted)}</p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Total Spent</p>
            <p className="text-2xl font-bold text-amber-600 tabular-nums">{formatCurrency(totalSpent)}</p>
            <p className="text-xs text-gray-400 mt-1">{overallPct.toFixed(0)}% of budget used</p>
          </div>
          <div className={`border rounded-xl px-5 py-4 shadow-sm ${totalRemaining < 0 ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100"}`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Remaining</p>
            <p className={`text-2xl font-bold tabular-nums ${totalRemaining < 0 ? "text-red-500" : "text-emerald-600"}`}>
              {formatCurrency(totalRemaining)}
            </p>
            <p className="text-xs text-gray-400 mt-1">{totalRemaining < 0 ? "Over budget" : "Still available"}</p>
          </div>
        </div>

        {/* Bar chart */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-5 pt-5 pb-2">
            <h2 className="text-sm font-semibold text-gray-700">Budgeted vs Spent by Category</h2>
          </div>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: Math.max(720, categoryViews.length * 110) }}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }} barGap={2} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    tick={<CustomXTick />}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    height={44}
                  />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc" }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#6b7280", paddingTop: 8 }} />
                  <Bar dataKey="Budgeted" fill="#e2e8f0" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Spent" radius={[3, 3, 0, 0]}>
                    {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Category Breakdown</h2>
          {categoryViews.map((cat) => (
            <CategoryRow key={cat.id} cat={cat} accounts={accounts} />
          ))}
        </div>
      </div>
    </div>
  );
}
