"use client";

import { useState, useMemo } from "react";
import AccountsPanel from "@/components/AccountsPanel";
import { getCategoryMeta, formatCurrency } from "@/lib/data";
import type { DbAccount, DbTransaction } from "@/lib/database.types";

type Props = {
  accounts: DbAccount[];
  transactions: DbTransaction[];
};

export default function TransactionsClient({ accounts, transactions }: Props) {
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = selectedAccount
      ? transactions.filter((t) => t.account_id === selectedAccount)
      : transactions;

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
    return list; // already sorted date DESC from server
  }, [selectedAccount, search, transactions, accounts]);

  const totalIncome = filtered.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpenses = filtered.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  return (
    <div className="flex h-full">
      <AccountsPanel accounts={accounts} selectedAccount={selectedAccount} onSelect={setSelectedAccount} />

      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
              <p className="text-sm text-gray-400 mt-0.5">{filtered.length} transactions</p>
            </div>
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
          </div>

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
                            <p className="text-gray-400" style={{ fontSize: 11 }}>{acct?.name}</p>
                          </td>
                          <td className="px-5 py-3 text-gray-700 max-w-xs">
                            <p className="truncate">{t.description}</p>
                            <p className="text-gray-400 text-xs mt-0.5">{t.subcategory}</p>
                          </td>
                          <td className="px-5 py-3">
                            {meta ? (
                              <span
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                                style={{ backgroundColor: meta.color + "20", color: meta.color }}
                              >
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                                {meta.name}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">Income</span>
                            )}
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
    </div>
  );
}
