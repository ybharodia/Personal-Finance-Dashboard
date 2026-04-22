"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { type DateRange, getPresetRange } from "@/components/DateRangeFilter";
import TransactionModal from "@/components/TransactionModal";
import AddTransactionModal from "@/components/AddTransactionModal";
import { getCategoryMeta, formatCurrency } from "@/lib/data";
import { exportToExcel } from "@/lib/exportToExcel";
import type { CategoryMeta } from "@/lib/data";
import type { DbAccount, DbTransaction, DbBudget, DbPlaidItem } from "@/lib/database.types";

type Props = {
  accounts: DbAccount[];
  transactions: DbTransaction[];
  budgets: DbBudget[];
  categories: CategoryMeta[];
  plaidItems?: DbPlaidItem[];
};

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtTxDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const CAT_COLORS: Record<string, { bg: string; ink: string }> = {
  "Income":                   { bg: "oklch(0.95 0.04 150)", ink: "oklch(0.52 0.09 150)" },
  "Housing":                  { bg: "oklch(0.94 0.03 260)", ink: "oklch(0.44 0.1 260)" },
  "Food & Dining":            { bg: "oklch(0.94 0.04 60)",  ink: "oklch(0.45 0.1 60)" },
  "Food & Groceries":         { bg: "oklch(0.94 0.04 60)",  ink: "oklch(0.45 0.1 60)" },
  "Transportation":           { bg: "oklch(0.94 0.04 160)", ink: "oklch(0.42 0.08 160)" },
  "Shopping":                 { bg: "oklch(0.94 0.04 340)", ink: "oklch(0.45 0.1 340)" },
  "Subscriptions":            { bg: "oklch(0.94 0.04 220)", ink: "oklch(0.44 0.1 220)" },
  "Personal & Lifestyle":     { bg: "oklch(0.97 0.02 35)",  ink: "oklch(0.45 0.12 35)" },
  "Business Expense":         { bg: "oklch(0.94 0.04 190)", ink: "oklch(0.42 0.08 190)" },
  "Health":                   { bg: "oklch(0.94 0.04 120)", ink: "oklch(0.42 0.08 120)" },
  "Transfer":                 { bg: "oklch(0.94 0.02 240)", ink: "oklch(0.45 0.08 240)" },
  "Discretionary / Variable": { bg: "oklch(0.94 0.04 290)", ink: "oklch(0.45 0.1 290)" },
};

const DEFAULT_CAT = { bg: "var(--fo-soft)", ink: "var(--fo-muted)" };

const CHEVRON_BTN: React.CSSProperties = {
  width: 28,
  height: 28,
  border: "1px solid var(--fo-hair)",
  borderRadius: 6,
  background: "var(--fo-card)",
  color: "var(--fo-muted)",
  cursor: "pointer",
  fontSize: 16,
  display: "grid",
  placeItems: "center",
};

export default function TransactionsClient({ accounts, transactions, budgets, categories, plaidItems: _plaidItems }: Props) {
  const router = useRouter();
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange("this-month"));
  const [fromInput, setFromInput] = useState<string>(() => toIsoDate(getPresetRange("this-month").from));
  const [toInput, setToInput] = useState<string>(() => toIsoDate(getPresetRange("this-month").to));
  const [filterCategory, setFilterCategory] = useState("");
  const [filterCategoryMode, setFilterCategoryMode] = useState<"include" | "exclude">("include");
  const [localTxns, setLocalTxns] = useState<DbTransaction[]>(transactions);

  // Sync fresh server data into local state after router.refresh()
  useEffect(() => { setLocalTxns(transactions); }, [transactions]);
  const [editingTx, setEditingTx] = useState<DbTransaction | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"income" | "expense" | "transfer" | null>(null);

  const uniqueCategories = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; name: string }[] = [];
    for (const t of localTxns) {
      if (t.category && !seen.has(t.category)) {
        seen.add(t.category);
        result.push({ id: t.category, name: getCategoryMeta(t.category, categories)?.name ?? t.category });
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [localTxns, categories]);

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
          (getCategoryMeta(t.category, categories)?.name ?? "").toLowerCase().includes(q) ||
          (accounts.find((a) => a.id === t.account_id)?.bank_name ?? "").toLowerCase().includes(q)
      );
    }

    if (filterCategory) {
      list = list.filter((t) =>
        filterCategoryMode === "include"
          ? t.category === filterCategory
          : t.category !== filterCategory
      );
    }

    return list;
  }, [selectedAccount, search, dateRange, filterCategory, filterCategoryMode, localTxns, accounts, categories]);

  // Totals always reflect the full date/account/search-filtered set, regardless of type filter
  const totalIncome    = filtered.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpenses  = filtered.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const totalTransfers = filtered.filter((t) => t.type === "transfer").reduce((s, t) => s + t.amount, 0);

  // Apply type filter only to the table
  const displayedTxns = typeFilter ? filtered.filter((t) => t.type === typeFilter) : filtered;

  function handleSaveEdit(updated: DbTransaction[]) {
    setLocalTxns(updated);
    setEditingTx(null);
    router.refresh();
  }

  function handleAdd(newTx: DbTransaction) {
    // Prepend and re-sort by date DESC
    const next = [newTx, ...localTxns].sort((a, b) => b.date.localeCompare(a.date));
    setLocalTxns(next);
    setShowAddModal(false);
    router.refresh();
  }

  function prevMonth() {
    const d = dateRange.from;
    const year = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
    const month = d.getMonth() === 0 ? 11 : d.getMonth() - 1;
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 1);
    setDateRange({ from, to, preset: "custom" });
    setFromInput(toIsoDate(from));
    setToInput(toIsoDate(to));
  }

  function nextMonth() {
    const d = dateRange.from;
    const year = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
    const month = d.getMonth() === 11 ? 0 : d.getMonth() + 1;
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 1);
    setDateRange({ from, to, preset: "custom" });
    setFromInput(toIsoDate(from));
    setToInput(toIsoDate(to));
  }

  function applyDateRange() {
    if (!fromInput || !toInput) return;
    const [fy, fm, fd] = fromInput.split("-").map(Number);
    const [ty, tm, td] = toInput.split("-").map(Number);
    setDateRange({ from: new Date(fy, fm - 1, fd), to: new Date(ty, tm - 1, td), preset: "custom" });
  }

  const monthLabel = dateRange.from.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function handleDownload() {
    const rows = displayedTxns.map((t) => ({
      Date: t.date,
      Description: t.description,
      Category: getCategoryMeta(t.category, categories)?.name ?? t.category ?? "",
      Subcategory: t.subcategory ?? "",
      Amount: t.amount,
      Type: t.type,
    }));
    exportToExcel(rows, "transactions", "Transactions");
  }

  // suppress unused-var warnings for state kept per spec
  void selectedAccount; void setSelectedAccount; void filterCategory; void setFilterCategory;
  void filterCategoryMode; void setFilterCategoryMode; void uniqueCategories;

  return (
    <div style={{ background: "var(--fo-bg)", minHeight: "100%", fontFamily: "var(--font-fo-sans)" }}>

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>

        {/* Month navigator */}
        <button style={CHEVRON_BTN} onClick={prevMonth}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fo-ink)", minWidth: 100, textAlign: "center" }}>
          {monthLabel}
        </span>
        <button style={CHEVRON_BTN} onClick={nextMonth}>›</button>

        {/* Date range picker */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--fo-faint)", fontFamily: "var(--font-fo-sans)" }}>From</span>
          <input
            type="date"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
            style={{ border: "1px solid var(--fo-hair)", borderRadius: 6, padding: "5px 8px", fontSize: 12, fontFamily: "var(--font-fo-mono)", color: "var(--fo-ink)", background: "var(--fo-card)", outline: "none" }}
          />
          <span style={{ fontSize: 11, color: "var(--fo-faint)", fontFamily: "var(--font-fo-sans)" }}>To</span>
          <input
            type="date"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
            style={{ border: "1px solid var(--fo-hair)", borderRadius: 6, padding: "5px 8px", fontSize: 12, fontFamily: "var(--font-fo-mono)", color: "var(--fo-ink)", background: "var(--fo-card)", outline: "none" }}
          />
          <button
            onClick={applyDateRange}
            style={{ border: "1px solid var(--fo-hair)", background: "var(--fo-card)", color: "var(--fo-ink)", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-fo-sans)" }}
          >
            Apply
          </button>
        </div>

        {/* Type filter pills */}
        {([
          { key: null,       label: "All" },
          { key: "income",   label: "Income" },
          { key: "expense",  label: "Expenses" },
          { key: "transfer", label: "Transfers" },
        ] as const).map(({ key, label }) => {
          const active = typeFilter === key;
          return (
            <button
              key={String(key)}
              onClick={() => setTypeFilter(key)}
              style={{
                background: active ? "var(--fo-accent)" : "var(--fo-soft)",
                color: active ? "white" : "var(--fo-muted)",
                fontWeight: active ? 500 : 450,
                borderRadius: 99,
                padding: "5px 14px",
                fontSize: 12,
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-fo-sans)",
              }}
            >
              {label}
            </button>
          );
        })}

        {/* Right — search + add */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: "var(--fo-soft)",
              border: "none",
              outline: "none",
              borderRadius: 7,
              padding: "7px 12px",
              fontSize: 12.5,
              color: "var(--fo-ink)",
              width: 200,
              fontFamily: "var(--font-fo-sans)",
            }}
          />
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              background: "var(--fo-accent)",
              color: "white",
              border: "none",
              borderRadius: 7,
              padding: "7px 14px",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "var(--font-fo-sans)",
            }}
          >
            + Add Transaction
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        {([
          { label: "Income",    value: totalIncome,    count: filtered.filter((t) => t.type === "income").length,   color: "var(--fo-good)" },
          { label: "Expenses",  value: totalExpenses,  count: filtered.filter((t) => t.type === "expense").length,  color: "var(--fo-bad)" },
          { label: "Transfers", value: totalTransfers, count: filtered.filter((t) => t.type === "transfer").length, color: "var(--fo-ink)" },
        ]).map(({ label, value, count, color }) => (
          <div
            key={label}
            style={{
              background: "var(--fo-card)",
              border: "1px solid var(--fo-hair)",
              borderRadius: 10,
              padding: "14px 18px",
              flex: 1,
            }}
          >
            <p style={{ fontSize: 10, color: "var(--fo-muted)", textTransform: "uppercase", letterSpacing: "1.3px", marginBottom: 4, fontFamily: "var(--font-fo-sans)" }}>
              {label}
            </p>
            <p className="num" style={{ fontFamily: "var(--font-fo-serif)", fontSize: 22, fontWeight: 500, color }}>
              {formatCurrency(value)}
            </p>
            <p style={{ fontSize: 11, color: "var(--fo-faint)", marginTop: 2 }}>
              {count} transaction{count !== 1 ? "s" : ""}
            </p>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div style={{ background: "var(--fo-card)", border: "1px solid var(--fo-hair)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--fo-soft)", borderBottom: "1px solid var(--fo-hair)" }}>
                {(["DATE", "DESCRIPTION", "CATEGORY", "ACCOUNT", "AMOUNT"] as const).map((h) => (
                  <th
                    key={h}
                    style={{
                      fontSize: 10,
                      color: "var(--fo-muted)",
                      letterSpacing: "1.3px",
                      textTransform: "uppercase",
                      padding: "10px 16px",
                      fontWeight: 600,
                      textAlign: h === "AMOUNT" ? "right" : "left",
                      fontFamily: "var(--font-fo-sans)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedTxns.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "48px 16px", textAlign: "center", fontSize: 13, color: "var(--fo-faint)" }}>
                    No transactions found.
                  </td>
                </tr>
              ) : (
                displayedTxns.map((t) => {
                  const acct = accounts.find((a) => a.id === t.account_id);
                  const meta = getCategoryMeta(t.category, categories);
                  const catLabel =
                    t.type === "transfer"
                      ? "Transfer"
                      : meta?.name ?? (t.type === "income" ? "Income" : t.category || "Uncategorized");
                  const catColors = CAT_COLORS[catLabel] ?? DEFAULT_CAT;
                  const isIncome = t.type === "income";
                  const isTransfer = t.type === "transfer";

                  return (
                    <tr
                      key={t.id}
                      style={{ borderBottom: "1px solid var(--fo-hair)", cursor: "pointer" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--fo-soft)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                      onClick={() => setEditingTx(t)}
                    >
                      {/* DATE */}
                      <td style={{ padding: "12px 16px", fontFamily: "var(--font-fo-mono)", fontSize: 12, color: "var(--fo-faint)", whiteSpace: "nowrap" }}>
                        {fmtTxDate(t.date)}
                      </td>

                      {/* DESCRIPTION */}
                      <td style={{ padding: "12px 16px", maxWidth: 260 }}>
                        <p style={{ fontSize: 13, color: "var(--fo-ink)", fontWeight: 450, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.description}
                        </p>
                        {t.subcategory && (
                          <p style={{ fontSize: 11, color: "var(--fo-faint)", marginTop: 1 }}>{t.subcategory}</p>
                        )}
                      </td>

                      {/* CATEGORY */}
                      <td style={{ padding: "12px 16px" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingTx(t); }}
                          style={{
                            background: catColors.bg,
                            color: catColors.ink,
                            display: "inline-flex",
                            alignItems: "center",
                            borderRadius: 5,
                            padding: "3px 10px",
                            fontSize: 11,
                            fontWeight: 500,
                            border: "none",
                            cursor: "pointer",
                            fontFamily: "var(--font-fo-sans)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {catLabel}
                        </button>
                      </td>

                      {/* ACCOUNT */}
                      <td style={{ padding: "12px 16px" }}>
                        <p style={{ fontSize: 12, color: "var(--fo-ink)" }}>{acct?.bank_name}</p>
                        <p style={{ fontSize: 11, color: "var(--fo-faint)", textTransform: "uppercase", marginTop: 1 }}>
                          {acct ? (acct.custom_name?.trim() || acct.name) : ""}
                        </p>
                      </td>

                      {/* AMOUNT */}
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                          fontFamily: "var(--font-fo-mono)",
                          fontSize: 13,
                          fontWeight: 500,
                          fontVariantNumeric: "tabular-nums",
                          color: isIncome ? "var(--fo-good)" : isTransfer ? "var(--fo-muted)" : "var(--fo-bad)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isIncome ? "+" : isTransfer ? "⇄ " : "−"}{formatCurrency(t.amount)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid var(--fo-hair)", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--fo-faint)" }}>
            Showing {displayedTxns.length} of {filtered.length} transactions
          </span>
          <button
            onClick={handleDownload}
            style={{
              border: "1px solid var(--fo-hair)",
              background: "var(--fo-card)",
              color: "var(--fo-ink)",
              borderRadius: 6,
              padding: "5px 12px",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "var(--font-fo-sans)",
            }}
          >
            ↓ Download Excel
          </button>
        </div>
      </div>

      {/* Edit/Recategorize Modal */}
      {editingTx && (
        <TransactionModal
          tx={editingTx}
          budgets={budgets}
          categories={categories}
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
