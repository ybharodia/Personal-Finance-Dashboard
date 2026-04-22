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

const SANS = "'Inter', -apple-system, system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

const CATEGORY_CHIPS: Record<string, { bg: string; ink: string }> = {
  food: { bg: "oklch(0.94 0.04 60)", ink: "oklch(0.45 0.1 60)" },
  housing: { bg: "oklch(0.94 0.03 260)", ink: "oklch(0.44 0.1 260)" },
  transportation: { bg: "oklch(0.94 0.04 160)", ink: "oklch(0.42 0.08 160)" },
  personal: { bg: "oklch(0.97 0.02 35)", ink: "oklch(0.45 0.12 35)" },
  discretionary: { bg: "oklch(0.94 0.04 290)", ink: "oklch(0.45 0.1 290)" },
  income: { bg: "oklch(0.95 0.04 150)", ink: "oklch(0.52 0.09 150)" },
  health: { bg: "oklch(0.94 0.04 120)", ink: "oklch(0.42 0.08 120)" },
  other: { bg: "#f3efe7", ink: "#6b635b" },
};

function CategoryChip({ category }: { category: string }) {
  const chip = CATEGORY_CHIPS[category.toLowerCase()] ?? CATEGORY_CHIPS.other;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: chip.bg,
        color: chip.ink,
        padding: "3px 9px",
        borderRadius: 11,
        fontSize: 11,
        fontWeight: 500,
        textTransform: "capitalize",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: 3,
          background: chip.ink,
          opacity: 0.75,
          flexShrink: 0,
        }}
      />
      {category}
    </span>
  );
}

export default function MerchantRulesClient({ initialRules, budgets, categories }: Props) {
  const [rules, setRules] = useState<DbMerchantRule[]>(initialRules);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [deleting, setDeleting] = useState<DeleteState | null>(null);
  const [applyMode, setApplyMode] = useState<ApplyMode>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const filteredRules = useMemo(() => {
    if (!search.trim()) return rules;
    const q = search.toLowerCase();
    return rules.filter(
      (r) =>
        r.display_name.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.subcategory.toLowerCase().includes(q)
    );
  }, [rules, search]);

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

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: "#faf8f4", fontFamily: SANS }}
    >
      {/* Page header */}
      <div
        className="px-6 py-5 shrink-0 flex items-center justify-between"
        style={{ background: "#ffffff", borderBottom: "1px solid #ebe5dc" }}
      >
        <div>
          <h1
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: 26,
              fontWeight: 500,
              letterSpacing: "-0.5px",
              color: "#1a1715",
              margin: 0,
            }}
          >
            Merchant Rules
          </h1>
          <p style={{ fontSize: 11.5, color: "#6b635b", marginTop: 4, marginBottom: 0 }}>
            Saved category rules applied automatically to matching transactions.
          </p>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {/* Export button */}
          <button
            onClick={() => {
              const csv = [
                ["Merchant", "Category", "Subcategory"].join(","),
                ...rules.map((r) =>
                  [
                    `"${r.display_name.replace(/"/g, '""')}"`,
                    r.category,
                    r.subcategory,
                  ].join(",")
                ),
              ].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "merchant-rules.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              border: "1px solid #ebe5dc",
              background: "#ffffff",
              color: "#1a1715",
              padding: "8px 13px",
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            Export
          </button>
          {/* Add Rule button (placeholder) */}
          <button
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "oklch(0.45 0.12 35)",
              color: "#ffffff",
              border: "none",
              padding: "8px 13px",
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Rule
          </button>
        </div>
      </div>

      {/* Search bar row */}
      <div
        style={{
          padding: "12px 24px",
          background: "#faf8f4",
          borderBottom: "1px solid #ebe5dc",
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            background: "#ffffff",
            border: "1px solid #ebe5dc",
            borderRadius: 8,
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#a39a8f" strokeWidth={1.5}>
            <circle cx="11" cy="11" r="8" />
            <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search merchants, categories…"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: 12.5,
              fontFamily: SANS,
              color: "#1a1715",
              background: "transparent",
            }}
          />
        </div>
        <span style={{ fontSize: 11.5, color: "#6b635b", fontFamily: MONO, whiteSpace: "nowrap" }}>
          {filteredRules.length} / {rules.length} rules
        </span>
      </div>

      {/* Table area */}
      <div
        className="flex-1 overflow-auto"
        style={{ padding: "18px 24px 24px" }}
      >
        {rules.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "#6b635b", marginTop: 32, textAlign: "center" }}>
            No merchant rules saved yet. Categorize a transaction and choose &ldquo;Yes, save as rule&rdquo; to create one.
          </p>
        ) : (
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #ebe5dc",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <table
              style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}
            >
              <colgroup>
                <col style={{ width: "33%" }} />
                <col style={{ width: "21%" }} />
                <col style={{ width: "25%" }} />
                <col style={{ width: 140 }} />
              </colgroup>
              <thead>
                <tr style={{ background: "#f3efe7", borderBottom: "1px solid #ebe5dc" }}>
                  {["Merchant", "Category", "Subcategory"].map((label) => (
                    <th
                      key={label}
                      style={{
                        textAlign: "left",
                        padding: "12px 16px",
                        fontSize: 10,
                        letterSpacing: "1.4px",
                        textTransform: "uppercase",
                        color: "#6b635b",
                        fontWeight: 600,
                        fontFamily: SANS,
                      }}
                    >
                      {label}
                    </th>
                  ))}
                  <th
                    style={{
                      textAlign: "right",
                      padding: "12px 16px",
                      fontSize: 10,
                      letterSpacing: "1.4px",
                      textTransform: "uppercase",
                      color: "#6b635b",
                      fontWeight: 600,
                      fontFamily: SANS,
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.map((rule, ri) => {
                  const isEditingThis = editing?.merchantKey === rule.merchant_key;
                  const isDeletingThis = deleting?.merchantKey === rule.merchant_key;
                  const isLast = ri === filteredRules.length - 1;
                  const isHovered = hoveredKey === rule.merchant_key;

                  return (
                    <tr
                      key={rule.merchant_key}
                      onMouseEnter={() => setHoveredKey(rule.merchant_key)}
                      onMouseLeave={() => setHoveredKey(null)}
                      style={{
                        background: isHovered ? "#f3efe7" : "transparent",
                        borderBottom: isLast ? "none" : "1px solid #ebe5dc",
                        alignItems: "center",
                        transition: "background 0.1s",
                      }}
                    >
                      {/* Merchant name */}
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 12.5,
                          color: "#1a1715",
                          fontFamily: MONO,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {rule.display_name}
                      </td>

                      {/* Inline edit form */}
                      {isEditingThis ? (
                        <>
                          <td style={{ padding: "8px 16px" }}>
                            <select
                              value={editing.category}
                              onChange={(e) => {
                                setEditing({ ...editing, category: e.target.value, subcategory: "" });
                                setApplyMode(null);
                              }}
                              style={{
                                border: "1px solid #ebe5dc",
                                borderRadius: 6,
                                padding: "6px 8px",
                                fontSize: 12,
                                background: "#ffffff",
                                color: "#1a1715",
                                width: "100%",
                                outline: "none",
                                fontFamily: SANS,
                              }}
                            >
                              {categoryOptions.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: "8px 16px" }}>
                            <select
                              value={editing.subcategory}
                              onChange={(e) => {
                                setEditing({ ...editing, subcategory: e.target.value });
                                setApplyMode(null);
                              }}
                              style={{
                                border: "1px solid #ebe5dc",
                                borderRadius: 6,
                                padding: "6px 8px",
                                fontSize: 12,
                                background: "#ffffff",
                                color: "#1a1715",
                                width: "100%",
                                outline: "none",
                                fontFamily: SANS,
                              }}
                            >
                              <option value="">— Select —</option>
                              {subcategoryOptions(editing.category).map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: "8px 16px", whiteSpace: "nowrap" }}>
                            {applyMode === null ? (
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  onClick={handleEditSave}
                                  disabled={saving}
                                  style={{
                                    padding: "4px 12px",
                                    fontSize: 11.5,
                                    fontWeight: 600,
                                    background: "oklch(0.45 0.12 35)",
                                    color: "#ffffff",
                                    border: "none",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                    opacity: saving ? 0.5 : 1,
                                    fontFamily: SANS,
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => { setEditing(null); setApplyMode(null); setError(null); }}
                                  style={{
                                    padding: "4px 12px",
                                    fontSize: 11.5,
                                    fontWeight: 500,
                                    background: "#ffffff",
                                    color: "#1a1715",
                                    border: "1px solid #ebe5dc",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                    fontFamily: SANS,
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
                                <p style={{ fontSize: 11, color: "#6b635b", margin: 0 }}>Apply to past transactions?</p>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button
                                    onClick={() => confirmEdit("past+future")}
                                    disabled={saving}
                                    style={{
                                      flex: 1,
                                      padding: "4px 8px",
                                      fontSize: 11.5,
                                      fontWeight: 600,
                                      background: "#92400e",
                                      color: "#ffffff",
                                      border: "none",
                                      borderRadius: 6,
                                      cursor: "pointer",
                                      opacity: saving ? 0.5 : 1,
                                      fontFamily: SANS,
                                    }}
                                  >
                                    {saving ? "Saving…" : "Past + future"}
                                  </button>
                                  <button
                                    onClick={() => confirmEdit("future")}
                                    disabled={saving}
                                    style={{
                                      flex: 1,
                                      padding: "4px 8px",
                                      fontSize: 11.5,
                                      fontWeight: 500,
                                      background: "#ffffff",
                                      color: "#1a1715",
                                      border: "1px solid #ebe5dc",
                                      borderRadius: 6,
                                      cursor: "pointer",
                                      opacity: saving ? 0.5 : 1,
                                      fontFamily: SANS,
                                    }}
                                  >
                                    Future only
                                  </button>
                                </div>
                              </div>
                            )}
                            {error && isEditingThis && (
                              <p style={{ fontSize: 11, color: "oklch(0.52 0.13 25)", marginTop: 4 }}>{error}</p>
                            )}
                          </td>
                        </>
                      ) : isDeletingThis ? (
                        <>
                          <td
                            colSpan={2}
                            style={{ padding: "12px 16px", fontSize: 12, color: "#6b635b", fontFamily: SANS }}
                          >
                            Keep existing categories on past transactions, or revert to uncategorized?
                          </td>
                          <td style={{ padding: "8px 16px", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={confirmDeleteKeep}
                                disabled={saving}
                                style={{
                                  padding: "4px 10px",
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  background: "#1a1715",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: 6,
                                  cursor: "pointer",
                                  opacity: saving ? 0.5 : 1,
                                  fontFamily: SANS,
                                }}
                              >
                                {saving ? "Deleting…" : "Keep"}
                              </button>
                              <button
                                onClick={confirmDeleteRevert}
                                disabled={saving}
                                style={{
                                  padding: "4px 10px",
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  background: "oklch(0.52 0.13 25)",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: 6,
                                  cursor: "pointer",
                                  opacity: saving ? 0.5 : 1,
                                  fontFamily: SANS,
                                }}
                              >
                                {saving ? "Reverting…" : "Revert"}
                              </button>
                              <button
                                onClick={() => { setDeleting(null); setError(null); }}
                                style={{
                                  padding: "4px 10px",
                                  fontSize: 11.5,
                                  fontWeight: 500,
                                  background: "#ffffff",
                                  color: "#1a1715",
                                  border: "1px solid #ebe5dc",
                                  borderRadius: 6,
                                  cursor: "pointer",
                                  fontFamily: SANS,
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                            {error && isDeletingThis && (
                              <p style={{ fontSize: 11, color: "oklch(0.52 0.13 25)", marginTop: 4 }}>{error}</p>
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          {/* Category chip */}
                          <td style={{ padding: "12px 16px" }}>
                            <CategoryChip category={rule.category} />
                          </td>
                          {/* Subcategory */}
                          <td style={{ padding: "12px 16px", fontSize: 12.5, color: "#6b635b", fontFamily: SANS }}>
                            {rule.subcategory}
                          </td>
                          {/* Actions */}
                          <td
                            style={{
                              padding: "12px 16px",
                              display: "flex",
                              justifyContent: "flex-end",
                              gap: 6,
                            }}
                          >
                            <button
                              onClick={() => startEdit(rule)}
                              style={{
                                border: "1px solid #ebe5dc",
                                background: "#ffffff",
                                color: "#1a1715",
                                padding: "4px 12px",
                                borderRadius: 6,
                                fontSize: 11.5,
                                fontFamily: SANS,
                                cursor: "pointer",
                              }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => startDelete(rule)}
                              style={{
                                border: "1px solid oklch(0.95 0.03 25)",
                                background: "#ffffff",
                                color: "oklch(0.52 0.13 25)",
                                padding: "4px 12px",
                                borderRadius: 6,
                                fontSize: 11.5,
                                fontFamily: SANS,
                                cursor: "pointer",
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Empty search state */}
            {filteredRules.length === 0 && rules.length > 0 && (
              <p
                style={{
                  fontSize: 12.5,
                  color: "#6b635b",
                  padding: "32px 24px",
                  textAlign: "center",
                  margin: 0,
                }}
              >
                No rules match &ldquo;{search}&rdquo;
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
