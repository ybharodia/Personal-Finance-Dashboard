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
import { BUDGET_CATEGORIES, formatCurrency } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import type { DbAccount, DbTransaction, DbBudget } from "@/lib/database.types";

// ── Types ────────────────────────────────────────────────────────────────────

type SubView = {
  name: string;
  budgeted: number;
  spent: number;
  transactions: DbTransaction[];
  budgetId: string | null;
};

type CatView = {
  id: string;
  name: string;
  color: string;
  budgeted: number;
  spent: number;
  subcategories: SubView[];
};

type EditingState = {
  catId: string;
  catName: string;
  subcategory: string;
  currentAmount: number;
  existingId: string | null;
};

// ── BudgetEditModal ───────────────────────────────────────────────────────────

function BudgetEditModal({
  editing,
  month,
  year,
  onSave,
  onClose,
}: {
  editing: EditingState;
  month: number;
  year: number;
  onSave: (saved: DbBudget) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(
    editing.currentAmount > 0 ? editing.currentAmount.toFixed(2) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const num = parseFloat(amount);
    if (isNaN(num) || num < 0) {
      setError("Please enter a valid amount (e.g. 500 or 1200.00)");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing.existingId) {
        // Update existing row
        const { data, error: dbErr } = await supabase
          .from("budgets")
          .update({ budgeted_amount: num })
          .eq("id", editing.existingId)
          .select()
          .single();
        if (dbErr) throw dbErr;
        onSave(data as DbBudget);
      } else {
        // Insert new row
        const newId = crypto.randomUUID();
        const { data, error: dbErr } = await supabase
          .from("budgets")
          .insert({
            id: newId,
            category: editing.catId,
            subcategory: editing.subcategory,
            budgeted_amount: num,
            month,
            year,
          })
          .select()
          .single();
        if (dbErr) throw dbErr;
        onSave(data as DbBudget);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save. Please try again.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm p-6 pb-10 sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 sm:hidden" />

        <h2 className="text-base font-semibold text-gray-900 mb-0.5">
          {editing.existingId ? "Edit Budget" : "Set Budget"}
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          {editing.catName}
          <span className="mx-1.5 text-gray-300">›</span>
          {editing.subcategory}
        </p>

        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
          Monthly Budget Amount
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm select-none">
            $
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="0.00"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") onClose();
            }}
          />
        </div>

        {error && (
          <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
            <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </p>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Saving…
              </>
            ) : (
              "Save Budget"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PencilIcon ────────────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
    </svg>
  );
}

// ── CategoryRow ───────────────────────────────────────────────────────────────

function CategoryRow({
  cat,
  accounts,
  onEditSubcategory,
}: {
  cat: CatView;
  accounts: DbAccount[];
  onEditSubcategory: (
    catId: string,
    catName: string,
    subcategory: string,
    currentAmount: number,
    existingId: string | null
  ) => void;
}) {
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
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Category progress bar */}
      <div className="px-5 pb-3">
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: over ? "#ef4444" : cat.color }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">{pct.toFixed(0)}% used</p>
      </div>

      {/* Subcategories */}
      {expanded && (
        <div className="border-t border-gray-100">
          {cat.subcategories.map((sc) => {
            const subPct = sc.budgeted > 0 ? Math.min((sc.spent / sc.budgeted) * 100, 100) : 0;
            const subOver = sc.budgeted > 0 && sc.spent > sc.budgeted;
            const subKey = `${cat.id}-${sc.name}`;
            const isOpen = expandedSub === subKey;

            return (
              <div key={sc.name} className="border-b border-gray-50 last:border-0">
                {/* Row: expand button + pencil */}
                <div className="flex items-center px-5 py-3 hover:bg-gray-50 transition-colors group">
                  {/* Clickable area to expand transactions */}
                  <button
                    onClick={() => setExpandedSub(isOpen ? null : subKey)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-600 font-medium">{sc.name}</span>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <span className="text-xs text-gray-400 hidden sm:inline">
                          {formatCurrency(sc.spent)}{" "}
                          <span className="text-gray-300">/</span>{" "}
                          {sc.budgeted > 0 ? formatCurrency(sc.budgeted) : "no budget"}
                        </span>
                        <span
                          className={`text-sm font-semibold tabular-nums ${
                            subOver
                              ? "text-red-500"
                              : sc.budgeted === 0
                              ? "text-gray-400"
                              : "text-emerald-600"
                          }`}
                        >
                          {sc.budgeted > 0 ? formatCurrency(sc.budgeted - sc.spent) : "—"}
                        </span>
                        {sc.transactions.length > 0 && (
                          <svg
                            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1">
                      <div
                        className="h-1 rounded-full"
                        style={{
                          width: `${subPct}%`,
                          backgroundColor: subOver ? "#ef4444" : cat.color,
                        }}
                      />
                    </div>
                  </button>

                  {/* Pencil / Set Budget button — always visible on mobile, hover on desktop */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditSubcategory(cat.id, cat.name, sc.name, sc.budgeted, sc.budgetId);
                    }}
                    className="ml-3 p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 sm:opacity-0 sm:group-hover:opacity-100 transition-all shrink-0"
                    title={sc.budgetId ? "Edit budget" : "Set budget"}
                    aria-label={`${sc.budgetId ? "Edit" : "Set"} budget for ${sc.name}`}
                  >
                    <PencilIcon />
                  </button>
                </div>

                {/* Sub-transactions */}
                {isOpen && sc.transactions.length > 0 && (
                  <div className="bg-gray-50 border-t border-gray-100">
                    {sc.transactions.map((t) => {
                      const acct = accounts.find((a) => a.id === t.account_id);
                      return (
                        <div
                          key={t.id}
                          className="flex items-center justify-between px-8 py-2 border-b border-gray-100 last:border-0"
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-xs font-mono text-gray-400">{t.date}</span>
                            <div>
                              <p className="text-xs text-gray-700">{t.description}</p>
                              <p className="text-gray-400" style={{ fontSize: 10 }}>
                                {acct?.bank_name} · {acct?.name}
                              </p>
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
  month?: number;
  year?: number;
};

export default function BudgetsClient({
  accounts,
  transactions,
  budgets: initialBudgets,
  month = 2,
  year = 2026,
}: Props) {
  const [localBudgets, setLocalBudgets] = useState<DbBudget[]>(initialBudgets);
  const [editing, setEditing] = useState<EditingState | null>(null);

  function handleBudgetSaved(saved: DbBudget) {
    setLocalBudgets((prev) => {
      const exists = prev.find((b) => b.id === saved.id);
      if (exists) return prev.map((b) => (b.id === saved.id ? saved : b));
      return [...prev, saved];
    });
    setEditing(null);
  }

  function openEdit(
    catId: string,
    catName: string,
    subcategory: string,
    currentAmount: number,
    existingId: string | null
  ) {
    setEditing({ catId, catName, subcategory, currentAmount, existingId });
  }

  // Build category views: merge budgets + transaction subcategories
  const categoryViews = useMemo((): CatView[] => {
    return BUDGET_CATEGORIES.map((meta) => {
      const catBudgets = localBudgets.filter((b) => b.category === meta.id);
      const catTxns = transactions.filter((t) => t.type === "expense" && t.category === meta.id);

      // Build a map keyed by subcategory name, starting from budget rows
      const subcatMap = new Map<string, SubView>();
      for (const b of catBudgets) {
        const subTxns = catTxns.filter((t) => t.subcategory === b.subcategory);
        subcatMap.set(b.subcategory, {
          name: b.subcategory,
          budgeted: b.budgeted_amount,
          spent: subTxns.reduce((s, t) => s + t.amount, 0),
          transactions: subTxns,
          budgetId: b.id,
        });
      }

      // Also surface subcategories from transactions that have no budget yet
      const budgetedSubs = new Set(catBudgets.map((b) => b.subcategory));
      const txnSubs = [...new Set(catTxns.map((t) => t.subcategory))];
      for (const sub of txnSubs) {
        if (!budgetedSubs.has(sub)) {
          const subTxns = catTxns.filter((t) => t.subcategory === sub);
          subcatMap.set(sub, {
            name: sub,
            budgeted: 0,
            spent: subTxns.reduce((s, t) => s + t.amount, 0),
            transactions: subTxns,
            budgetId: null,
          });
        }
      }

      const subcategories = Array.from(subcatMap.values());
      return {
        id: meta.id,
        name: meta.name,
        color: meta.color,
        budgeted: subcategories.reduce((s, sc) => s + sc.budgeted, 0),
        spent: subcategories.reduce((s, sc) => s + sc.spent, 0),
        subcategories,
      };
    });
  }, [localBudgets, transactions]);

  const totalBudgeted = categoryViews.reduce((s, c) => s + c.budgeted, 0);
  const totalSpent = categoryViews.reduce((s, c) => s + c.spent, 0);
  const totalRemaining = totalBudgeted - totalSpent;
  const overallPct = totalBudgeted > 0 ? Math.min((totalSpent / totalBudgeted) * 100, 100) : 0;

  // Bar chart data
  const chartData = categoryViews.map((c) => ({
    name: c.name,
    Budgeted: parseFloat(c.budgeted.toFixed(2)),
    Spent: parseFloat(c.spent.toFixed(2)),
    color: c.color,
  }));

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; fill: string; value: number }[]; label?: string }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
        <p className="font-semibold text-gray-800 mb-2">{label}</p>
        {payload.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-6">
            <span className="text-gray-500">{p.name}</span>
            <span className="font-semibold" style={{ color: p.fill }}>
              {formatCurrency(p.value)}
            </span>
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

  function CustomXTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
    const [line1, line2] = wrapLabel((payload?.value ?? "") as string);
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
          <div
            className={`border rounded-xl px-5 py-4 shadow-sm ${
              totalRemaining < 0 ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Remaining</p>
            <p
              className={`text-2xl font-bold tabular-nums ${
                totalRemaining < 0 ? "text-red-500" : "text-emerald-600"
              }`}
            >
              {formatCurrency(totalRemaining)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {totalRemaining < 0 ? "Over budget" : "Still available"}
            </p>
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
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                  barGap={2}
                  barSize={14}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    tick={<CustomXTick />}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    height={44}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc" }} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: "#6b7280", paddingTop: 8 }}
                  />
                  <Bar dataKey="Budgeted" fill="#e2e8f0" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Spent" radius={[3, 3, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
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
            <CategoryRow
              key={cat.id}
              cat={cat}
              accounts={accounts}
              onEditSubcategory={openEdit}
            />
          ))}
        </div>
      </div>

      {/* Budget edit modal */}
      {editing && (
        <BudgetEditModal
          editing={editing}
          month={month}
          year={year}
          onSave={handleBudgetSaved}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
