"use client";

import { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { applyRuleToDb, revertRuleFromDb } from "@/lib/merchantRuleUtils";
import type { CategoryMeta } from "@/lib/data";
import type { DbBudget, DbMerchantRule } from "@/lib/database.types";

type Props = {
  initialRules: DbMerchantRule[];
  budgets: DbBudget[];
  categories: CategoryMeta[];
};

type EditState = {
  merchantKey: string;
  displayName: string;
  category: string;
  subcategory: string;
};

type DeleteState = {
  merchantKey: string;
  displayName: string;
};

// "past+future" | "future" → shown after edit confirm
type ApplyMode = "past+future" | "future" | null;

export default function MerchantRulesClient({ initialRules, budgets, categories }: Props) {
  const [rules, setRules] = useState<DbMerchantRule[]>(initialRules);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [deleting, setDeleting] = useState<DeleteState | null>(null);
  const [applyMode, setApplyMode] = useState<ApplyMode>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Category options for expense (rules are always for expense transactions)
  const categoryOptions = useMemo(
    () => categories.filter((c) => c.name !== "Income"),
    [categories]
  );

  function subcategoryOptions(catId: string): string[] {
    const seen = new Set<string>();
    return budgets
      .filter((b) => b.category === catId)
      .map((b) => b.subcategory)
      .filter((s) => {
        if (seen.has(s)) return false;
        seen.add(s);
        return true;
      });
  }

  function startEdit(rule: DbMerchantRule) {
    setEditing({
      merchantKey: rule.merchant_key,
      displayName: rule.display_name,
      category: rule.category,
      subcategory: rule.subcategory,
    });
    setApplyMode(null);
    setError(null);
  }

  function startDelete(rule: DbMerchantRule) {
    setDeleting({ merchantKey: rule.merchant_key, displayName: rule.display_name });
    setError(null);
  }

  // Step 1 of edit: user picks category/subcategory and clicks Save — show apply-mode prompt
  function handleEditSave() {
    if (!editing?.category || !editing?.subcategory) {
      setError("Please select both category and subcategory.");
      return;
    }
    setError(null);
    setApplyMode("past+future"); // default selection; user can switch
  }

  // Step 2 of edit: user confirms how to apply the rule
  async function confirmEdit(mode: "past+future" | "future") {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      // Upsert the rule
      const { error: upsertErr } = await supabase
        .from("merchant_rules")
        .upsert(
          {
            merchant_key: editing.merchantKey,
            display_name: editing.displayName,
            category: editing.category,
            subcategory: editing.subcategory,
          },
          { onConflict: "merchant_key" }
        );
      if (upsertErr) throw upsertErr;

      if (mode === "past+future") {
        await applyRuleToDb(editing.merchantKey, editing.category, editing.subcategory);
      }

      // Update local rule list
      setRules((prev) =>
        prev.map((r) =>
          r.merchant_key === editing.merchantKey
            ? { ...r, category: editing.category, subcategory: editing.subcategory }
            : r
        )
      );
      setEditing(null);
      setApplyMode(null);
    } catch (err: any) {
      setError(err.message ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  // Delete with "keep" — just delete the rule row
  async function confirmDeleteKeep() {
    if (!deleting) return;
    setSaving(true);
    setError(null);
    try {
      const { error: delErr } = await supabase
        .from("merchant_rules")
        .delete()
        .eq("merchant_key", deleting.merchantKey);
      if (delErr) throw delErr;

      setRules((prev) => prev.filter((r) => r.merchant_key !== deleting.merchantKey));
      setDeleting(null);
    } catch (err: any) {
      setError(err.message ?? "Delete failed.");
    } finally {
      setSaving(false);
    }
  }

  // Delete with "revert" — delete rule + blank out matching transactions
  async function confirmDeleteRevert() {
    if (!deleting) return;
    setSaving(true);
    setError(null);
    try {
      await revertRuleFromDb(deleting.merchantKey);

      const { error: delErr } = await supabase
        .from("merchant_rules")
        .delete()
        .eq("merchant_key", deleting.merchantKey);
      if (delErr) throw delErr;

      setRules((prev) => prev.filter((r) => r.merchant_key !== deleting.merchantKey));
      setDeleting(null);
    } catch (err: any) {
      setError(err.message ?? "Delete failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="px-6 py-5 bg-white border-b border-gray-200 shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">Merchant Rules</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Saved category rules applied automatically to matching transactions.
        </p>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {rules.length === 0 ? (
          <p className="text-sm text-gray-500 mt-8 text-center">
            No merchant rules saved yet. Categorize a transaction and choose "Yes, save as rule" to create one.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-widest text-gray-500">Merchant</th>
                <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-widest text-gray-500">Category</th>
                <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-widest text-gray-500">Subcategory</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, ri) => {
                const isEditingThis = editing?.merchantKey === rule.merchant_key;
                const isDeletingThis = deleting?.merchantKey === rule.merchant_key;

                return (
                  <tr
                    key={rule.merchant_key}
                    className={`border-b border-gray-100 ${ri % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                  >
                    <td className="px-3 py-3 text-gray-800 font-medium whitespace-nowrap">{rule.display_name}</td>

                    {/* Inline edit form */}
                    {isEditingThis ? (
                      <>
                        <td className="px-3 py-2">
                          <select
                            value={editing.category}
                            onChange={(e) => {
                              setEditing({ ...editing, category: e.target.value, subcategory: "" });
                              setApplyMode(null);
                            }}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full"
                          >
                            {categoryOptions.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={editing.subcategory}
                            onChange={(e) => {
                              setEditing({ ...editing, subcategory: e.target.value });
                              setApplyMode(null);
                            }}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full"
                          >
                            <option value="">— Select —</option>
                            {subcategoryOptions(editing.category).map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {applyMode === null ? (
                            <div className="flex gap-2">
                              <button
                                onClick={handleEditSave}
                                disabled={saving}
                                className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => { setEditing(null); setApplyMode(null); setError(null); }}
                                className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1.5 min-w-[200px]">
                              <p className="text-xs text-gray-600">Apply to past transactions?</p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => confirmEdit("past+future")}
                                  disabled={saving}
                                  className="flex-1 px-2 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                                >
                                  {saving ? "Saving…" : "Past + future"}
                                </button>
                                <button
                                  onClick={() => confirmEdit("future")}
                                  disabled={saving}
                                  className="flex-1 px-2 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                                >
                                  Future only
                                </button>
                              </div>
                            </div>
                          )}
                          {error && isEditingThis && (
                            <p className="text-xs text-red-500 mt-1">{error}</p>
                          )}
                        </td>
                      </>
                    ) : isDeletingThis ? (
                      <>
                        <td colSpan={2} className="px-3 py-3 text-sm text-gray-700">
                          Keep existing categories on past transactions, or revert to uncategorized?
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex gap-2">
                            <button
                              onClick={confirmDeleteKeep}
                              disabled={saving}
                              className="px-3 py-1.5 text-xs font-semibold bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                            >
                              {saving ? "Deleting…" : "Keep categories"}
                            </button>
                            <button
                              onClick={confirmDeleteRevert}
                              disabled={saving}
                              className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                              {saving ? "Reverting…" : "Revert"}
                            </button>
                            <button
                              onClick={() => { setDeleting(null); setError(null); }}
                              className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                          {error && isDeletingThis && (
                            <p className="text-xs text-red-500 mt-1">{error}</p>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-3 text-gray-600">{rule.category}</td>
                        <td className="px-3 py-3 text-gray-600">{rule.subcategory}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => startEdit(rule)}
                              className="px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => startDelete(rule)}
                              className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
