"use client";

import { useState, useMemo, startTransition } from "react";
import { useRouter } from "next/navigation";
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
import { formatCurrency, getCategoryMeta } from "@/lib/data";
import type { CategoryMeta } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { exportToExcel } from "@/lib/exportToExcel";
import TransactionModal from "@/components/TransactionModal";
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50);
}

const PRESET_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#3b82f6",
  "#ec4899", "#8b5cf6", "#f97316", "#06b6d4",
  "#84cc16", "#ef4444", "#14b8a6", "#a855f7",
];

const SPENT_COLORS: Record<string, string> = {
  "Housing": "#8B6F5E",
  "Transportation": "#B8956A",
  "Food & Groceries": "#5C8A6F",
  "Insurance": "#7A8A6F",
  "Personal & Lifestyle": "#A0624A",
  "Discretionary / Variable": "#7B6EA8",
  "Jash Support": "#C4784A",
  "Business Expense": "#4A7EA0",
  "Savings & Investments": "#6B8FA8",
};

// ── AddCategoryModal ──────────────────────────────────────────────────────────

function AddCategoryModal({
  existingIds,
  nextSortOrder,
  onSave,
  onClose,
}: {
  existingIds: string[];
  nextSortOrder: number;
  onSave: (cat: CategoryMeta) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { setError("Name is required."); return; }

    let id = slugify(trimmed);
    if (!id) { setError("Name must contain letters or numbers."); return; }

    // Ensure unique ID
    let finalId = id;
    let counter = 2;
    while (existingIds.includes(finalId)) {
      finalId = `${id}-${counter++}`;
    }

    setSaving(true);
    setError(null);
    const { error: dbErr } = await supabase
      .from("budget_categories")
      .insert({ id: finalId, name: trimmed, color, sort_order: nextSortOrder });

    if (dbErr) { setError(dbErr.message); setSaving(false); return; }

    onSave({ id: finalId, name: trimmed, color });
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
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 sm:hidden" />
        <h2 className="text-base font-semibold text-gray-900 mb-5">Add Category</h2>

        {/* Name */}
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
          Category Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Healthcare"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
        />

        {/* Color */}
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
          Color
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-7 h-7 rounded-full transition-all ${color === c ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "hover:scale-110"}`}
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
        </div>
        {/* Custom colour picker */}
        <div className="flex items-center gap-2 mt-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border border-gray-200"
          />
          <span className="text-xs text-gray-400">Custom colour</span>
        </div>

        {/* Preview */}
        <div className="mt-4 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-sm font-medium text-gray-700">{name || "Category name"}</span>
        </div>

        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

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
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {saving ? "Adding…" : "Add Category"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AddSubcategoryModal ───────────────────────────────────────────────────────

function AddSubcategoryModal({
  catId,
  catName,
  catColor,
  month,
  year,
  existingSubNames,
  onSave,
  onClose,
}: {
  catId: string;
  catName: string;
  catColor: string;
  month: number;
  year: number;
  existingSubNames: string[];
  onSave: (budget: DbBudget) => void;
  onClose: () => void;
}) {
  const [subName, setSubName] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = subName.trim();
    if (!trimmed) { setError("Subcategory name is required."); return; }
    if (existingSubNames.map((s) => s.toLowerCase()).includes(trimmed.toLowerCase())) {
      setError("A subcategory with that name already exists.");
      return;
    }

    const num = amount.trim() ? parseFloat(amount) : 0;
    if (amount.trim() && (isNaN(num) || num < 0)) {
      setError("Please enter a valid amount or leave blank.");
      return;
    }

    setSaving(true);
    setError(null);

    const newId = crypto.randomUUID();
    const { data, error: dbErr } = await supabase
      .from("budgets")
      .insert({
        id: newId,
        category: catId,
        subcategory: trimmed,
        budgeted_amount: num,
        month: 1,
        year: 1900,
      })
      .select()
      .single();

    if (dbErr) { setError(dbErr.message); setSaving(false); return; }

    onSave(data as DbBudget);
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
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 sm:hidden" />

        {/* Header with category color indicator */}
        <div className="flex items-center gap-2 mb-1">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: catColor }} />
          <span className="text-xs text-gray-400 font-medium">{catName}</span>
        </div>
        <h2 className="text-base font-semibold text-gray-900 mb-5">Add Subcategory</h2>

        {/* Subcategory name */}
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
          Subcategory Name
        </label>
        <input
          type="text"
          value={subName}
          onChange={(e) => setSubName(e.target.value)}
          placeholder="e.g. Rent, Groceries"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
        />

        {/* Budget amount */}
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
          Monthly Budget <span className="normal-case font-normal text-gray-300">(optional)</span>
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
            placeholder="0.00"
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
            className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

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
                Adding…
              </>
            ) : (
              "Add Subcategory"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [subcategoryName, setSubcategoryName] = useState(editing.subcategory);
  const [amount, setAmount] = useState(
    editing.currentAmount > 0 ? editing.currentAmount.toFixed(2) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmedName = subcategoryName.trim();
    if (!trimmedName) { setError("Subcategory name is required."); return; }
    const num = parseFloat(amount);
    if (isNaN(num) || num < 0) {
      setError("Please enter a valid amount (e.g. 500 or 1200.00)");
      return;
    }
    const nameChanged = trimmedName !== editing.subcategory;
    setSaving(true);
    setError(null);
    try {
      // If the subcategory name changed, rename it across ALL months and ALL transactions first
      if (nameChanged) {
        await supabase
          .from("budgets")
          .update({ subcategory: trimmedName })
          .eq("category", editing.catId)
          .eq("subcategory", editing.subcategory);
        await supabase
          .from("transactions")
          .update({ subcategory: trimmedName })
          .eq("category", editing.catId)
          .eq("subcategory", editing.subcategory);
      }

      if (editing.existingId) {
        // Update this month's budget amount (and name if changed — already handled above)
        const { data, error: dbErr } = await supabase
          .from("budgets")
          .update({ budgeted_amount: num, subcategory: trimmedName })
          .eq("id", editing.existingId)
          .select()
          .single();
        if (dbErr) throw dbErr;
        onSave(data as DbBudget);
      } else {
        // No budget row for this month yet — insert one
        const newId = crypto.randomUUID();
        const { data, error: dbErr } = await supabase
          .from("budgets")
          .insert({
            id: newId,
            category: editing.catId,
            subcategory: trimmedName,
            budgeted_amount: num,
            month: 1,
            year: 1900,
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
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 sm:hidden" />
        <h2 className="text-base font-semibold text-gray-900 mb-0.5">
          {editing.existingId ? "Edit Budget" : "Set Budget"}
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          {editing.catName}
        </p>

        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
          Name
        </label>
        <input
          type="text"
          value={subcategoryName}
          onChange={(e) => setSubcategoryName(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
          placeholder="Subcategory name"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        />

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

// ── Icons ─────────────────────────────────────────────────────────────────────

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

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

// ── CategoryRow ───────────────────────────────────────────────────────────────

function CategoryRow({
  cat,
  accounts,
  isIncome,
  onEditSubcategory,
  onDelete,
  onDeleteSubcategory,
  onAddSubcategory,
  onEditTransaction,
}: {
  cat: CatView;
  accounts: DbAccount[];
  isIncome?: boolean;
  onEditSubcategory: (
    catId: string,
    catName: string,
    subcategory: string,
    currentAmount: number,
    existingId: string | null
  ) => void;
  onDelete: (catId: string) => void;
  onDeleteSubcategory: (catId: string, subName: string, budgetId: string | null) => Promise<void>;
  onAddSubcategory: (catId: string, catName: string, catColor: string) => void;
  onEditTransaction: (tx: DbTransaction) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedSub, setExpandedSub] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteSub, setConfirmDeleteSub] = useState<string | null>(null);
  const [deletingSub, setDeletingSub] = useState<string | null>(null);

  const remaining = cat.budgeted - cat.spent;
  const pct = cat.budgeted > 0 ? Math.min((cat.spent / cat.budgeted) * 100, 100) : 0;
  const over = cat.spent > cat.budgeted;

  async function handleConfirmDeleteSub(subName: string, budgetId: string | null) {
    setConfirmDeleteSub(null);
    setDeletingSub(subName);
    try {
      await onDeleteSubcategory(cat.id, subName, budgetId);
    } finally {
      setDeletingSub(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header row — split into expand area + action buttons */}
      <div className="flex items-center hover:bg-gray-50 transition-colors group">
        <button
          onClick={() => startTransition(() => setExpanded(!expanded))}
          className="flex-1 flex items-center justify-between px-5 py-4 min-w-0"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
            <span className="font-semibold text-gray-800 text-sm">{cat.name}</span>
            <span className="text-xs text-gray-400">{cat.subcategories.length} categories</span>
          </div>
          <div className="flex items-center gap-6 shrink-0 ml-4">
            {isIncome ? (
              <div className="text-right">
                <p className="text-xs text-gray-400">Received</p>
                <p className="text-sm font-semibold tabular-nums text-emerald-600">{formatCurrency(cat.spent)}</p>
              </div>
            ) : (
              <>
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
              </>
            )}
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

        {/* Add subcategory button */}
        <div className="shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onAddSubcategory(cat.id, cat.name, cat.color); }}
            className="p-1.5 rounded-lg text-gray-300 hover:text-emerald-500 hover:bg-emerald-50 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
            title="Add subcategory"
            aria-label={`Add subcategory to ${cat.name}`}
          >
            <PlusIcon />
          </button>
        </div>

        {/* Delete controls */}
        <div className="pr-4 shrink-0">
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 whitespace-nowrap">Delete?</span>
              <button
                onClick={() => { setConfirmDelete(false); onDelete(cat.id); }}
                className="px-2 py-1 text-xs font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 text-xs font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
              title="Delete category"
              aria-label={`Delete ${cat.name} category`}
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>

      {/* Category progress bar */}
      {!isIncome && (
        <div className="px-5 pb-3">
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: over ? "#ef4444" : cat.color }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{pct.toFixed(0)}% used</p>
        </div>
      )}

      {/* Subcategories */}
      {expanded && (
        <div className="border-t border-gray-100">
          {cat.subcategories.map((sc) => {
            const subPct = sc.budgeted > 0 ? Math.min((sc.spent / sc.budgeted) * 100, 100) : 0;
            const subOver = sc.budgeted > 0 && sc.spent > sc.budgeted;
            const subKey = `${cat.id}-${sc.name}`;
            const isOpen = expandedSub === subKey;
            const isConfirming = confirmDeleteSub === sc.name;
            const isDeleting = deletingSub === sc.name;

            return (
              <div key={sc.name} className="border-b border-gray-50 last:border-0">
                <div className="flex items-center px-5 py-3 hover:bg-gray-50 transition-colors group/sub">
                  <button
                    onClick={() => startTransition(() => setExpandedSub(isOpen ? null : subKey))}
                    className="flex-1 min-w-0 text-left"
                    disabled={isDeleting}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-medium ${isDeleting ? "text-gray-300" : "text-gray-600"}`}>
                        {sc.name}
                      </span>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        {isIncome ? (
                          <span className="text-sm font-semibold tabular-nums text-emerald-600">
                            {formatCurrency(sc.spent)}
                          </span>
                        ) : (
                          <>
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
                          </>
                        )}
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
                    {!isIncome && (
                      <div className="w-full bg-gray-100 rounded-full h-1">
                        <div
                          className="h-1 rounded-full"
                          style={{
                            width: `${subPct}%`,
                            backgroundColor: subOver ? "#ef4444" : cat.color,
                          }}
                        />
                      </div>
                    )}
                  </button>

                  {/* Subcategory action buttons */}
                  <div className="flex items-center gap-0.5 ml-2 shrink-0">
                    {/* Edit budget */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditSubcategory(cat.id, cat.name, sc.name, sc.budgeted, sc.budgetId);
                      }}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 sm:opacity-0 sm:group-hover/sub:opacity-100 transition-all"
                      title={sc.budgetId ? "Edit budget" : "Set budget"}
                      aria-label={`${sc.budgetId ? "Edit" : "Set"} budget for ${sc.name}`}
                      disabled={isDeleting}
                    >
                      <PencilIcon />
                    </button>

                    {/* Delete subcategory — confirm inline */}
                    {isConfirming ? (
                      <div className="flex items-center gap-1 ml-1">
                        <span className="text-xs text-gray-500 whitespace-nowrap">Delete?</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleConfirmDeleteSub(sc.name, sc.budgetId); }}
                          className="px-2 py-1 text-xs font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                        >
                          Yes
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteSub(null); }}
                          className="px-2 py-1 text-xs font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : isDeleting ? (
                      <svg className="w-3.5 h-3.5 ml-1 animate-spin text-gray-300" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteSub(sc.name); }}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 sm:opacity-0 sm:group-hover/sub:opacity-100 transition-all"
                        title="Delete subcategory"
                        aria-label={`Delete ${sc.name} subcategory`}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && sc.transactions.length > 0 && (
                  <div className="bg-gray-50 border-t border-gray-100">
                    {sc.transactions.map((t) => {
                      const acct = accounts.find((a) => a.id === t.account_id);
                      const catMeta = getCategoryMeta(t.category);
                      return (
                        <div
                          key={t.id}
                          className="flex items-center justify-between px-8 py-2 border-b border-gray-100 last:border-0"
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <span className="text-xs font-mono text-gray-400 shrink-0">{t.date}</span>
                            <div className="min-w-0">
                              <p className="text-xs text-gray-700 truncate">{t.description}</p>
                              <p className="text-gray-400" style={{ fontSize: 10 }}>
                                {acct?.bank_name} · {acct?.name}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-4">
                            <button
                              onClick={(e) => { e.stopPropagation(); onEditTransaction(t); }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium transition-colors hover:opacity-80"
                              style={{
                                backgroundColor: (catMeta?.color ?? "#94a3b8") + "20",
                                color: catMeta?.color ?? "#94a3b8",
                              }}
                              title="Click to edit transaction"
                            >
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: catMeta?.color ?? "#94a3b8" }} />
                              {catMeta?.name ?? t.category}
                            </button>
                            <span className={`text-xs font-semibold tabular-nums ${isIncome ? "text-emerald-600" : "text-red-500"}`}>
                              {isIncome ? "+" : "−"}{formatCurrency(t.amount)}
                            </span>
                          </div>
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
  categories: CategoryMeta[];
  month?: number;
  year?: number;
};

export default function BudgetsClient({
  accounts,
  transactions,
  budgets: initialBudgets,
  categories: initialCategories,
  month = 2,
  year = 2026,
}: Props) {
  const router = useRouter();
  const [localBudgets, setLocalBudgets] = useState<DbBudget[]>(initialBudgets);
  const [localCategories, setLocalCategories] = useState<CategoryMeta[]>(initialCategories);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);
  // Track subcategories deleted mid-session so they vanish from txn-derived rows immediately
  const [deletedSubKeys, setDeletedSubKeys] = useState<Set<string>>(new Set());
  // State for AddSubcategoryModal
  const [addingSubFor, setAddingSubFor] = useState<{ catId: string; catName: string; catColor: string } | null>(null);

  // All pre-loaded transactions (2-year window loaded server-side)
  const [allTransactions, setAllTransactions] = useState<DbTransaction[]>(transactions);

  // Filter state
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const defaultFilterMonth = `${year}-${String(month).padStart(2, "0")}`;
  const [filterMonth, setFilterMonth] = useState(defaultFilterMonth);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterBudgetStatus, setFilterBudgetStatus] = useState<"all" | "over" | "under">("all");

  // Derive selected transactions for the chosen month (client-side, no Supabase calls)
  const selectedTransactions = useMemo(
    () => allTransactions.filter((t) => t.date.startsWith(filterMonth)),
    [allTransactions, filterMonth]
  );

  // Available months derived from loaded transactions + always include current month
  const availableMonths = useMemo(() => {
    const seen = new Set<string>();
    for (const t of allTransactions) seen.add(t.date.slice(0, 7));
    seen.add(`${currentYear}-${String(currentMonth).padStart(2, "0")}`);
    return Array.from(seen).sort().reverse();
  }, [allTransactions, currentMonth, currentYear]);

  const [filterMonthNum, filterYearNum] = filterMonth.split("-").map(Number);
  const isCurrentMonth = filterMonthNum === currentMonth && filterYearNum === currentYear;

  const daysInMonth = new Date(filterYearNum, filterMonthNum, 0).getDate();
  const dayOfMonth = isCurrentMonth ? now.getDate() : daysInMonth;
  const expectedPace = dayOfMonth / daysInMonth; // 0–1 fraction
  const expectedPct = Math.round(expectedPace * 100); // for display
  const daysLeft = daysInMonth - dayOfMonth;

  function navigateMonth(delta: number) {
    const [y, m] = filterMonth.split("-").map(Number);
    let nm = m + delta, ny = y;
    if (nm < 1) { nm = 12; ny -= 1; }
    if (nm > 12) { nm = 1; ny += 1; }
    if (ny > currentYear || (ny === currentYear && nm > currentMonth)) return;
    setFilterMonth(`${ny}-${String(nm).padStart(2, "0")}`);
  }

  function handleBudgetSaved(saved: DbBudget) {
    const nameChanged = editing && saved.subcategory !== editing.subcategory;
    setLocalBudgets((prev) => {
      // If the subcategory was renamed, update ALL local budget rows with the old name
      let updated = prev;
      if (nameChanged && editing) {
        updated = prev.map((b) =>
          b.category === editing.catId && b.subcategory === editing.subcategory
            ? { ...b, subcategory: saved.subcategory }
            : b
        );
      }
      // Then update or insert the specific saved row
      const exists = updated.find((b) => b.id === saved.id);
      if (exists) return updated.map((b) => (b.id === saved.id ? saved : b));
      return [...updated, saved];
    });
    if (nameChanged && editing) {
      // Hide the old txn-derived row immediately; router.refresh() will sync transactions
      setDeletedSubKeys((prev) => new Set([...prev, `${editing.catId}|||${editing.subcategory}`]));
      router.refresh();
    }
    setEditing(null);
  }

  function openEdit(
    catId: string,
    catName: string,
    subcategory: string,
    currentAmount: number,
    existingId: string | null
  ) {
    startTransition(() => {
      setEditing({ catId, catName, subcategory, currentAmount, existingId });
    });
  }

  function handleCategoryAdded(cat: CategoryMeta) {
    setLocalCategories((prev) => [...prev, cat]);
    setShowAddCategory(false);
  }

  function handleSubcategoryAdded(budget: DbBudget) {
    setLocalBudgets((prev) => [...prev, budget]);
    // Also remove from deletedSubKeys in case it was previously deleted then re-added
    setDeletedSubKeys((prev) => {
      const next = new Set(prev);
      next.delete(`${budget.category}|||${budget.subcategory}`);
      return next;
    });
    setAddingSubFor(null);
  }

  async function handleDeleteCategory(catId: string) {
    setDeletingCatId(catId);
    try {
      // 1. Delete all budget rows for this category
      await supabase.from("budgets").delete().eq("category", catId);
      // 2. Set affected transactions to "uncategorized" (preserves them in the list)
      await supabase
        .from("transactions")
        .update({ category: "uncategorized", subcategory: "Uncategorized" })
        .eq("category", catId);
      // 3. Delete the category itself
      await supabase.from("budget_categories").delete().eq("id", catId);
      // 4. Update local state
      setLocalBudgets((prev) => prev.filter((b) => b.category !== catId));
      setLocalCategories((prev) => prev.filter((c) => c.id !== catId));
      // 5. Refresh server data (so transaction pages reflect the category change)
      router.refresh();
    } finally {
      setDeletingCatId(null);
    }
  }

  const [editingTxn, setEditingTxn] = useState<DbTransaction | null>(null);

  function handleTxnSave(updatedTxns: DbTransaction[]) {
    setEditingTxn(null);
    setAllTransactions((prev) => {
      const rest = prev.filter((t) => !t.date.startsWith(filterMonth));
      return [...rest, ...updatedTxns].sort((a, b) => b.date.localeCompare(a.date));
    });
  }

  async function handleDeleteSubcategory(catId: string, subName: string, _budgetId: string | null) {
    // 1. Delete ALL budget rows for this subcategory across ALL months (makes deletion permanent)
    await supabase
      .from("budgets")
      .delete()
      .eq("category", catId)
      .eq("subcategory", subName);
    setLocalBudgets((prev) =>
      prev.filter((b) => !(b.category === catId && b.subcategory === subName))
    );
    // 2. Clear subcategory on affected transactions (don't delete them)
    await supabase
      .from("transactions")
      .update({ subcategory: "Uncategorized" })
      .eq("category", catId)
      .eq("subcategory", subName);
    // 3. Mark as deleted so it doesn't reappear from txn-derived subcategories
    setDeletedSubKeys((prev) => new Set([...prev, `${catId}|||${subName}`]));
  }

  // Build category views using dynamic localCategories
  const categoryViews = useMemo((): CatView[] => {
    return localCategories.map((meta) => {
      // All budget rows for this category — getBudgets() already deduplicates to one row per
      // subcategory, preferring the permanent sentinel (month=1, year=1900) over month-specific rows.
      const catBudgets = localBudgets.filter((b) => b.category === meta.id);
      // Include both expenses and income (exclude only transfers)
      const catTxns = selectedTransactions.filter((t) => t.type !== "transfer" && t.category === meta.id);

      // All unique subcategory names — subcategories are month-independent
      const allSubNames = new Set(catBudgets.map((b) => b.subcategory));

      const subcatMap = new Map<string, SubView>();

      // Build an entry for every known subcategory
      for (const subName of allSubNames) {
        const subKey = `${meta.id}|||${subName}`;
        if (deletedSubKeys.has(subKey)) continue;
        // Budget amount comes from the permanent (or only) row for this subcategory
        const budgetRow = catBudgets.find((b) => b.subcategory === subName);
        const subTxns = catTxns.filter((t) => t.subcategory === subName);
        subcatMap.set(subName, {
          name: subName,
          budgeted: budgetRow?.budgeted_amount ?? 0,
          spent: subTxns.reduce((s, t) => s + t.amount, 0),
          transactions: subTxns,
          budgetId: budgetRow?.id ?? null,
        });
      }

      // Also surface transaction-derived subcategories that have no budget row in any month
      const txnSubs = [...new Set(catTxns.map((t) => t.subcategory))];
      for (const sub of txnSubs) {
        const subKey = `${meta.id}|||${sub}`;
        // Skip if already covered by a budget row (any month), or explicitly deleted this session
        if (!allSubNames.has(sub) && !deletedSubKeys.has(subKey)) {
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
  }, [localBudgets, localCategories, selectedTransactions, deletedSubKeys]);

  // Filtered category views for the budget list
  const displayedCategoryViews = useMemo(() => {
    let views = categoryViews;
    if (filterCategory) {
      views = views.filter((c) => c.id === filterCategory);
    }
    if (filterBudgetStatus !== "all") {
      views = views.filter((c) => {
        if (c.name === "Income") return false;
        return filterBudgetStatus === "over"
          ? c.spent > c.budgeted
          : c.spent <= c.budgeted;
      });
    }
    return views;
  }, [categoryViews, filterCategory, filterBudgetStatus]);

  // Transactions with no category — shown in a dedicated Uncategorized section
  const uncategorizedTxns = useMemo(
    () => selectedTransactions.filter((t) => t.type !== "transfer" && !t.category),
    [selectedTransactions]
  );

  const spendingCategories = categoryViews.filter((c) => c.name !== "Income");

  const totalBudgeted = spendingCategories.reduce((s, c) => s + c.budgeted, 0);
  const totalSpent = spendingCategories.reduce((s, c) => s + c.spent, 0);
  const totalRemaining = totalBudgeted - totalSpent;
  const overallPct = totalBudgeted > 0 ? Math.min((totalSpent / totalBudgeted) * 100, 100) : 0;

  const chartData = spendingCategories.map((c) => ({
    name: c.name,
    Budgeted: parseFloat(c.budgeted.toFixed(2)),
    Spent: parseFloat(c.spent.toFixed(2)),
    color: c.color,
    spentColor: SPENT_COLORS[c.name] ?? c.color,
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

  // Find existing subcategory names for the "add subcategory" modal duplicate check
  const existingSubNamesForCat = useMemo(() => {
    if (!addingSubFor) return [];
    return localBudgets
      .filter((b) => b.category === addingSubFor.catId)
      .map((b) => b.subcategory);
  }, [addingSubFor, localBudgets]);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Budgets</h1>
            <div className="flex items-center gap-1 mt-0.5">
              <button
                onClick={() => navigateMonth(-1)}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors rounded"
                aria-label="Previous month"
              >
                ←
              </button>
              <p className="text-sm text-gray-400 w-32 text-center tabular-nums">
                {MONTH_NAMES[filterMonthNum - 1]} {filterYearNum}
              </p>
              <button
                onClick={() => navigateMonth(1)}
                disabled={isCurrentMonth}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors rounded"
                aria-label="Next month"
                style={{ visibility: isCurrentMonth ? "hidden" : "visible" }}
              >
                →
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const rows = categoryViews.flatMap((cat) =>
                  cat.subcategories.flatMap((sub) =>
                    sub.transactions.map((t) => ({
                      Category: cat.name,
                      Subcategory: sub.name,
                      Date: t.date,
                      Description: t.description,
                      Amount: t.amount,
                    }))
                  )
                );
                exportToExcel(rows, "budgets", "Budgets");
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
              </svg>
              Download Excel
            </button>
            <button
              onClick={() => setShowAddCategory(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Category
            </button>
          </div>
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
            <div style={{ minWidth: Math.max(720, spendingCategories.length * 110) }}>
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
                  <Bar dataKey="Budgeted" fill="#E8E2D9" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Spent" radius={[3, 3, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.spentColor} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Uncategorized transactions */}
        {uncategorizedTxns.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Uncategorized</h2>
            <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span className="text-sm font-semibold text-amber-800">Needs categorization</span>
                <span className="ml-auto text-xs text-amber-600 font-medium">
                  {uncategorizedTxns.length} transaction{uncategorizedTxns.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {uncategorizedTxns.map((t) => {
                  const acct = accounts.find((a) => a.id === t.account_id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => setEditingTxn(t)}
                      className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate">{t.description}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {t.date}{acct ? ` · ${acct.bank_name}` : ""}
                        </p>
                      </div>
                      <span className={`text-sm font-semibold tabular-nums shrink-0 ${t.type === "income" ? "text-emerald-600" : "text-gray-800"}`}>
                        {t.type === "income" ? "+" : "−"}{formatCurrency(t.amount)}
                      </span>
                      <span className="text-xs text-amber-500 font-medium shrink-0 flex items-center gap-1">
                        Categorize
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Month selector */}
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
          >
            {availableMonths.map((ym) => {
              const [y, m] = ym.split("-").map(Number);
              return <option key={ym} value={ym}>{MONTH_NAMES[m - 1]} {y}</option>;
            })}
          </select>

          <div className="h-4 w-px bg-gray-200" />

          {/* Category filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
          >
            <option value="">All categories</option>
            {localCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <div className="h-4 w-px bg-gray-200" />

          {/* Over/Under budget toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(["all", "over", "under"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setFilterBudgetStatus(opt)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterBudgetStatus === opt
                    ? opt === "over"
                      ? "bg-red-500 text-white"
                      : opt === "under"
                      ? "bg-emerald-500 text-white"
                      : "bg-indigo-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {opt === "all" ? "All" : opt === "over" ? "Over budget" : "Under budget"}
              </button>
            ))}
          </div>

          {/* Clear filters */}
          {(filterMonth !== defaultFilterMonth || filterCategory || filterBudgetStatus !== "all") && (
            <button
              onClick={() => { setFilterMonth(defaultFilterMonth); setFilterCategory(""); setFilterBudgetStatus("all"); }}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Category breakdown label + pacing view */}
        <div className="space-y-2">
          <p style={{ fontSize: 10, letterSpacing: "1.4px", color: "#A39A8F", fontWeight: 600, textTransform: "uppercase" }}>
            CATEGORY BREAKDOWN
          </p>

          {categoryViews.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-10 text-center">
              <p className="text-gray-400 text-sm">No categories yet. Click "Add Category" to get started.</p>
            </div>
          ) : displayedCategoryViews.filter((c) => c.name !== "Income").length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-10 text-center">
              <p className="text-gray-400 text-sm">No categories match the active filters.</p>
            </div>
          ) : (
            <div className="bg-white" style={{ border: "1px solid #EBE5DC", borderRadius: 10 }}>
              {/* Pacing header */}
              <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid #EBE5DC" }}>
                <span className="text-sm font-medium text-gray-700">
                  Pacing for {MONTH_NAMES[filterMonthNum - 1]} · Day {dayOfMonth} of {daysInMonth}
                </span>
                <span className="text-xs text-gray-400">
                  Expected pace: {expectedPct}%
                </span>
              </div>

              {/* Category rows */}
              {displayedCategoryViews
                .filter((cat) => cat.name !== "Income")
                .map((cat, i, arr) => {
                  const pct = cat.budgeted > 0 ? cat.spent / cat.budgeted : 0;
                  const pacing = pct - expectedPace;
                  const over = pct > 1;
                  const catColor = SPENT_COLORS[cat.name] ?? cat.color;
                  const barColor = over ? "#ef4444" : catColor;
                  const barWidth = Math.min(pct * 100, 100);
                  const remaining = cat.budgeted - cat.spent;
                  const projected = dayOfMonth > 0 ? (cat.spent / dayOfMonth) * daysInMonth : cat.spent;
                  const diff = projected - cat.budgeted;

                  let pillBg: string, pillColor: string, pillText: string;
                  if (over) {
                    pillBg = "oklch(0.95 0.03 25)";
                    pillColor = "oklch(0.52 0.13 25)";
                    pillText = "Over budget";
                  } else if (pacing > 0.1) {
                    pillBg = "oklch(0.96 0.05 80)";
                    pillColor = "oklch(0.62 0.12 70)";
                    pillText = "Trending over";
                  } else if (pacing < -0.1) {
                    pillBg = "oklch(0.95 0.04 150)";
                    pillColor = "oklch(0.52 0.09 150)";
                    pillText = "Ahead";
                  } else {
                    pillBg = "#F3EFE7";
                    pillColor = "#6B635B";
                    pillText = "On track";
                  }

                  return (
                    <div
                      key={cat.id}
                      className="grid items-center gap-4 py-3 px-5"
                      style={{
                        gridTemplateColumns: "180px 120px 1fr 180px",
                        borderBottom: i < arr.length - 1 ? "1px solid #EBE5DC" : undefined,
                      }}
                    >
                      {/* Col 1: dot + name */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: catColor }} />
                        <span className="truncate" style={{ fontWeight: 500, fontSize: 12.5 }}>{cat.name}</span>
                      </div>

                      {/* Col 2: status pill */}
                      <div>
                        <span
                          className="inline-block px-2.5 py-0.5 rounded-full whitespace-nowrap"
                          style={{ backgroundColor: pillBg, color: pillColor, fontSize: 11, fontWeight: 500 }}
                        >
                          {pillText}
                        </span>
                      </div>

                      {/* Col 3: runway bar with pace marker */}
                      <div className="relative h-2 rounded-full" style={{ backgroundColor: "#F3F4F6", overflow: "visible" }}>
                        <div
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{ width: `${barWidth}%`, backgroundColor: barColor }}
                        />
                        <div
                          className="absolute"
                          style={{
                            left: `${expectedPct}%`,
                            top: "-4px",
                            width: "1.5px",
                            height: "16px",
                            backgroundColor: "#9CA3AF",
                            borderRadius: "1px",
                            transform: "translateX(-50%)",
                          }}
                        />
                      </div>

                      {/* Col 4: stats */}
                      <div className="text-right">
                        <p className="font-mono text-xs text-gray-700 tabular-nums leading-tight">
                          {formatCurrency(Math.max(remaining, 0))} left · {daysLeft}d
                        </p>
                        <p
                          className="font-mono tabular-nums leading-tight"
                          style={{ fontSize: 11, color: diff > 0 ? "#ef4444" : "#10b981" }}
                        >
                          Projected: {formatCurrency(projected)} ({diff > 0 ? "+" : ""}{formatCurrency(Math.abs(diff))})
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showAddCategory && (
        <AddCategoryModal
          existingIds={localCategories.map((c) => c.id)}
          nextSortOrder={localCategories.length}
          onSave={handleCategoryAdded}
          onClose={() => setShowAddCategory(false)}
        />
      )}

      {addingSubFor && (
        <AddSubcategoryModal
          catId={addingSubFor.catId}
          catName={addingSubFor.catName}
          catColor={addingSubFor.catColor}
          month={filterMonthNum}
          year={filterYearNum}
          existingSubNames={existingSubNamesForCat}
          onSave={handleSubcategoryAdded}
          onClose={() => setAddingSubFor(null)}
        />
      )}

      {editing && (
        <BudgetEditModal
          editing={editing}
          month={filterMonthNum}
          year={filterYearNum}
          onSave={handleBudgetSaved}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Edit Transaction modal */}
      {editingTxn && (
        <TransactionModal
          tx={editingTxn}
          budgets={localBudgets}
          categories={localCategories}
          onClose={() => setEditingTxn(null)}
          onSave={handleTxnSave}
          allTransactions={selectedTransactions}
        />
      )}

      {/* Full-screen deletion spinner */}
      {deletingCatId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl px-8 py-6 flex items-center gap-3">
            <svg className="w-5 h-5 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">Deleting category…</span>
          </div>
        </div>
      )}
    </div>
  );
}
