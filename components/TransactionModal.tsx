"use client";

import { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/data";
import type { CategoryMeta } from "@/lib/data";
import type { DbTransaction, DbBudget } from "@/lib/database.types";

type Props = {
  tx: DbTransaction;
  budgets: DbBudget[];
  categories: CategoryMeta[];
  onClose: () => void;
  onSave: (updatedTxns: DbTransaction[]) => void;
  allTransactions: DbTransaction[];
};

export default function TransactionModal({
  tx,
  budgets,
  categories,
  onClose,
  onSave,
  allTransactions,
}: Props) {
  const [date, setDate] = useState(tx.date);
  const [description, setDescription] = useState(tx.description);
  const [amount, setAmount] = useState(String(tx.amount));
  const [type, setType] = useState<"income" | "expense" | "transfer">(tx.type);
  const [category, setCategory] = useState(tx.category);

  // Validate tx.subcategory against the known options for its category.
  // If Plaid sent a value not in our pre-defined list, start blank.
  const [subcategory, setSubcategory] = useState(() => {
    const validOptions = budgets
      .filter((b) => b.category === tx.category)
      .map((b) => b.subcategory)
      .filter((s, i, arr) => arr.indexOf(s) === i);
    return validOptions.includes(tx.subcategory) ? tx.subcategory : "";
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recategorization confirmation
  const [showConfirm, setShowConfirm] = useState(false);

  // Category changes are only meaningful for income/expense transactions
  const categoryChanged =
    type !== "transfer" &&
    (category !== tx.category || subcategory !== tx.subcategory);

  // Filter categories based on transaction type:
  // income → only the "Income" category; expense → everything else
  const categoryOptions = useMemo(() => {
    if (type === "income") return categories.filter((c) => c.name === "Income");
    return categories.filter((c) => c.name !== "Income");
  }, [categories, type]);

  // When type changes, reset category/subcategory if the current category
  // doesn't belong to the new type's category set
  function handleTypeChange(newType: "income" | "expense" | "transfer") {
    setType(newType);
    if (newType === "transfer") return;
    const newCats =
      newType === "income"
        ? categories.filter((c) => c.name === "Income")
        : categories.filter((c) => c.name !== "Income");
    if (newCats.length > 0 && !newCats.find((c) => c.id === category)) {
      setCategory(newCats[0].id);
      setSubcategory("");
    }
  }

  const subcategoryOptions = useMemo(() => {
    const seen = new Set<string>();
    return budgets
      .filter((b) => b.category === category)
      .map((b) => b.subcategory)
      .filter((s) => {
        if (seen.has(s)) return false;
        seen.add(s);
        return true;
      });
  }, [budgets, category]);

  async function doSave(applyToAll: boolean) {
    setSaving(true);
    setError(null);
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setError("Amount must be a positive number.");
      setSaving(false);
      return;
    }

    try {
      if (applyToAll) {
        // Update all transactions with the same original description to use new category/subcategory
        const { error: bulkErr } = await supabase
          .from("transactions")
          .update({ category, subcategory })
          .eq("description", tx.description)
          .neq("id", tx.id);
        if (bulkErr) throw bulkErr;
      }

      // Always update the specific transaction with all changed fields
      const { error: singleErr } = await supabase
        .from("transactions")
        .update({ date, description, amount: parsedAmount, type, category, subcategory })
        .eq("id", tx.id);
      if (singleErr) throw singleErr;

      // Build updated local list
      const updated = allTransactions.map((t) => {
        if (t.id === tx.id) {
          return { ...t, date, description, amount: parsedAmount, type, category, subcategory };
        }
        if (applyToAll && t.description === tx.description) {
          return { ...t, category, subcategory };
        }
        return t;
      });

      onSave(updated);
    } catch (err: any) {
      setError(err.message ?? "Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    if (categoryChanged) {
      setShowConfirm(true);
    } else {
      doSave(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Edit Transaction</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Type</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(["expense", "income", "transfer"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => handleTypeChange(t)}
                  className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                    type === t
                      ? t === "expense"
                        ? "bg-red-500 text-white"
                        : t === "income"
                        ? "bg-emerald-500 text-white"
                        : "bg-blue-500 text-white"
                      : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Category + Subcategory — hidden for transfers */}
          {type !== "transfer" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setSubcategory(""); // reset subcategory when category changes
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                >
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  {/* Fallback if current category isn't in the filtered list */}
                  {!categoryOptions.find((c) => c.id === category) && (
                    <option value={category}>{category}</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Subcategory</label>
                <select
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                >
                  <option value="">— Select subcategory —</option>
                  {subcategoryOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          {/* Recategorization confirmation */}
          {showConfirm && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
              <p className="text-sm text-gray-700">
                Apply this category to{" "}
                <strong>all transactions from "{tx.description}"</strong>?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowConfirm(false); doSave(true); }}
                  disabled={saving}
                  className="flex-1 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  Yes, apply to all
                </button>
                <button
                  onClick={() => { setShowConfirm(false); doSave(false); }}
                  disabled={saving}
                  className="flex-1 py-2 bg-white border border-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  No, just this one
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0 bg-white">
          {showConfirm ? (
            <p className="flex-1 text-xs text-gray-400 self-center">Select an option above to save.</p>
          ) : (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
