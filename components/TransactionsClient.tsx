"use client";

import { useState, useMemo } from "react";
import AccountsPanel from "@/components/AccountsPanel";
import DateRangeFilter, { type DateRange, getPresetRange } from "@/components/DateRangeFilter";
import TransactionModal from "@/components/TransactionModal";
import AddTransactionModal from "@/components/AddTransactionModal";
import { getCategoryMeta, formatCurrency } from "@/lib/data";
import type { DbAccount, DbTransaction, DbBudget } from "@/lib/database.types";

type Props = {
  accounts: DbAccount[];
  transactions: DbTransaction[];
  budgets: DbBudget[];
};

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function TransactionsClient({ accounts, transactions, budgets }: Props) {
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange("this-month"));
  const [localTxns, setLocalTxns] = useState<DbTransaction[]>(transactions);
  const [editingTx, setEditingTx] = useState<DbTransaction | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const filtered = useMemo(() => {
    const fromStr = toIsoDate(dateRange.from);
    const toStr = toIsoDate(dateRange.to);

    let list = selectedAccount
      ? localTxns.filter((t) => t.account_id === selectedAccount)
      : localTxns;

    // Date range filter
    list = list.filter((t) => t.date >= fromStr && t.date < toStr);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.subcategory.toLowerCase().includes(q) ||
          (getCategoryMeta(t.category)?.name ?? "").toLowerCase().includes(q) ||
          (accounts.find((a) => a.id === t.account_id)?.bank_name ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [selectedAccount, search, dateRange, localTxns, accounts]);

  const totalIncome = filtered.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpenses = filtered.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  function handleSaveEdit(updated: DbTransaction[]) {
    setLocalTxns(updated);
    setEditingTx(null);
  }

  function handleAdd(newTx: DbTransaction) {
    // Prepend and re-sort by date DESC
    const next = [newTx, ...localTxns].sort((a, b) => b.date.localeCompare(a.date));
    setLocalTxns(next);
    setShowAddModal(false);
  }

  return (
    <div className="flex h-full">
      <AccountsPanel accounts={accounts} selectedAccount={selectedAccount} onSelect={setSelectedAccount} />

      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-4 md:p-6 space-y-4 md:space-y-5">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
              <p className="text-sm text-gray-400 mt-0.5">{filtered.length} transactions</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-3 text-sm">
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-2 text-center">
                  <p className="text-xs text-gray-400 font-medium">Income</p>
                  <p className="font-bold text-emerald-600 tabular-nums">{formatCurrency(totalIncome)}</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-2 text-center">
                  <p className="text-xs text-gray-400 font-medium">Expenses</p>
                  <p className="font-bold text-red-500 tabular-nums">{formatCurrency(totalExpenses)}</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Transaction
              </button>
            </div>
          </div>

          {/* Date range filter */}
          <DateRangeFilter value={dateRange} onChange={setDateRange} />

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search transactions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {["Date", "Account", "Description", "Category", "Amount"].map((h, i) => (
                      <th key={h} className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-gray-400 text-sm">
                        No transactions found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((t) => {
                      const acct = accounts.find((a) => a.id === t.account_id);
                      const meta = getCategoryMeta(t.category);
                      return (
                        <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3 text-gray-500 whitespace-nowrap font-mono text-xs">{t.date}</td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            <p className="text-xs font-medium text-gray-700">{acct?.bank_name}</p>
                            <p className="text-gray-400" style={{ fontSize: 11 }}>{acct ? (acct.custom_name?.trim() || acct.name) : ""}</p>
                          </td>
                          <td className="px-5 py-3 text-gray-700 max-w-xs">
                            <p className="truncate">{t.description}</p>
                            <p className="text-gray-400 text-xs mt-0.5">{t.subcategory}</p>
                          </td>
                          <td className="px-5 py-3">
                            <button
                              onClick={() => setEditingTx(t)}
                              className="group"
                              title="Edit transaction"
                            >
                              {meta ? (
                                <span
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap transition-opacity group-hover:opacity-75"
                                  style={{ backgroundColor: meta.color + "20", color: meta.color }}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                                  {meta.name}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                                  {t.type === "income" ? "Income" : t.category}
                                </span>
                              )}
                            </button>
                          </td>
                          <td className={`px-5 py-3 text-right font-semibold tabular-nums whitespace-nowrap ${t.type === "expense" ? "text-red-500" : "text-emerald-600"}`}>
                            {t.type === "expense" ? "−" : "+"}{formatCurrency(t.amount)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Edit/Recategorize Modal */}
      {editingTx && (
        <TransactionModal
          tx={editingTx}
          budgets={budgets}
          allTransactions={localTxns}
          onClose={() => setEditingTx(null)}
          onSave={handleSaveEdit}
        />
      )}

      {/* Add Transaction Modal */}
      {showAddModal && (
        <AddTransactionModal
          accounts={accounts}
          budgets={budgets}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAdd}
        />
      )}
    </div>
  );
}
