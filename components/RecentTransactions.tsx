"use client";

import { useState } from "react";
import Link from "next/link";
import type { DbTransaction, DbBudget } from "@/lib/database.types";
import type { CategoryMeta } from "@/lib/data";
import { getCategoryMeta, formatCurrency, fmtDate } from "@/lib/data";
import TransactionModal from "@/components/TransactionModal";

type Props = {
  transactions: DbTransaction[];
  budgets: DbBudget[];
  categories: CategoryMeta[];
};

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
