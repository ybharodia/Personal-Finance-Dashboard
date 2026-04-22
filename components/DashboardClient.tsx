"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, getCategoryMeta } from "@/lib/data";
import type { CategoryMeta } from "@/lib/data";
import type { DbAccount, DbTransaction, DbBudget } from "@/lib/database.types";
import { useDateFilter } from "@/lib/date-filter-context";
import DownloadBalancesButton from "@/components/DownloadBalancesButton";
import AccountsBox from "@/components/AccountsBox";
import CashPositionChart from "@/components/CashPositionChart";
import RecentTransactions from "@/components/RecentTransactions";
import CashFlowForecast from "@/components/CashFlowForecast";
import UpcomingCard from "@/components/UpcomingCard";

type SyncStatus = "idle" | "syncing" | "success" | "error";

type Props = {
  accounts: DbAccount[];
  transactions: DbTransaction[];
  budgets: DbBudget[];
  categories: CategoryMeta[];
};

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const ghostBtn: React.CSSProperties = {
  border: "1px solid var(--fo-hair)",
  background: "var(--fo-card)",
  color: "var(--fo-ink)",
  borderRadius: 7,
  padding: "7px 13px",
  fontSize: 12,
  fontFamily: "var(--font-fo-sans)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const CARD_LABEL: React.CSSProperties = {
  fontSize: 10,
  color: "var(--fo-muted)",
  letterSpacing: "1.3px",
  textTransform: "uppercase",
  fontFamily: "var(--font-fo-sans)",
  marginBottom: 8,
};

const CARD_VALUE: React.CSSProperties = {
  fontFamily: "var(--font-fo-serif)",
  fontSize: 28,
  fontWeight: 500,
  fontVariantNumeric: "tabular-nums",
};

const CARD_WRAP: React.CSSProperties = {
  background: "var(--fo-card)",
  border: "1px solid var(--fo-hair)",
  borderRadius: 10,
  padding: "18px 22px",
  flex: 1,
};

export default function DashboardClient({ accounts, transactions, budgets, categories }: Props) {
  const router = useRouter();
  const { dateRange } = useDateFilter();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [localTxns, setLocalTxns] = useState<DbTransaction[]>(transactions);

  const handleSync = useCallback(async () => {
    setSyncStatus("syncing");
    setSyncError(null);
    try {
      const res = await fetch("/api/plaid/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail;
        const msg =
          typeof detail === "string"
            ? detail
            : detail?.error_message
            ? `${detail.error_code}: ${detail.error_message}`
            : data.error ?? "Sync failed";
        throw new Error(msg);
      }
      setSyncStatus("success");
      router.refresh();
      setTimeout(() => setSyncStatus("idle"), 2500);
    } catch (err: any) {
      setSyncStatus("error");
      setSyncError(err.message ?? "Sync failed");
      setTimeout(() => { setSyncStatus("idle"); setSyncError(null); }, 4000);
    }
  }, [router]);

  const filtered = useMemo(() => {
    const fromStr = toIsoDate(dateRange.from);
    const toStr = toIsoDate(dateRange.to);
    return localTxns.filter((t) => t.date >= fromStr && t.date < toStr);
  }, [dateRange, localTxns]);

  const totalIncome = useMemo(
    () => filtered.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
    [filtered]
  );
  const totalExpenses = useMemo(
    () => filtered.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    [filtered]
  );
  const cashFlow = totalIncome - totalExpenses;

  // Budget % used per top-level category
  const budgetPills = useMemo(() => {
    if (!budgets.length) return [];
    const budgetTotals: Record<string, number> = {};
    for (const b of budgets) {
      budgetTotals[b.category] = (budgetTotals[b.category] ?? 0) + b.budgeted_amount;
    }
    const spentTotals: Record<string, number> = {};
    for (const t of filtered) {
      if (t.type === "expense") {
        spentTotals[t.category] = (spentTotals[t.category] ?? 0) + t.amount;
      }
    }
    return Object.entries(budgetTotals)
      .filter(([, amt]) => amt > 0)
      .map(([cat, budget]) => {
        const spent = spentTotals[cat] ?? 0;
        const pct = Math.round((spent / budget) * 100);
        const meta = getCategoryMeta(cat, categories);
        return { cat, pct, color: meta?.color ?? "#d1d5db", name: meta?.name ?? cat };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [budgets, filtered, categories]);

  const syncBtnStyle: React.CSSProperties =
    syncStatus === "success"
      ? { ...ghostBtn, background: "var(--fo-good-soft)", color: "var(--fo-good)", border: "1px solid var(--fo-good-soft)" }
      : syncStatus === "error"
      ? { ...ghostBtn, background: "var(--fo-bad-soft)", color: "var(--fo-bad)", border: "1px solid var(--fo-bad-soft)" }
      : syncStatus === "syncing"
      ? { ...ghostBtn, opacity: 0.5, cursor: "not-allowed" }
      : ghostBtn;

  return (
    <div className="flex-1 overflow-y-auto bg-fo-bg">
      <div className="p-4 md:p-6 space-y-4 md:space-y-5">

        {/* Tool row — download + sync (right-aligned) */}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          <DownloadBalancesButton accounts={accounts} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <button onClick={handleSync} disabled={syncStatus === "syncing"} style={syncBtnStyle}>
              {syncStatus === "syncing" ? (
                <>
                  <svg width="14" height="14" className="animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Syncing…
                </>
              ) : syncStatus === "success" ? (
                <>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Synced!
                </>
              ) : (
                <>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync
                </>
              )}
            </button>
            {syncStatus === "error" && syncError && (
              <p style={{ fontSize: 11, color: "var(--fo-bad)", maxWidth: 160, textAlign: "right" }}>{syncError}</p>
            )}
          </div>
        </div>

        {/* Row 1 — 4 stat cards */}
        <div style={{ display: "flex", gap: 12 }}>
          <div style={CARD_WRAP}>
            <p style={CARD_LABEL}>Income</p>
            <p className="num" style={{ ...CARD_VALUE, color: "var(--fo-good)" }}>
              {formatCurrency(totalIncome)}
            </p>
          </div>

          <div style={CARD_WRAP}>
            <p style={CARD_LABEL}>Expenses</p>
            <p className="num" style={{ ...CARD_VALUE, color: "var(--fo-bad)" }}>
              -{formatCurrency(totalExpenses)}
            </p>
          </div>

          <div style={CARD_WRAP}>
            <p style={CARD_LABEL}>Net Cash Flow</p>
            <p
              className="num"
              style={{
                ...CARD_VALUE,
                color: cashFlow >= 0 ? "var(--fo-good)" : "var(--fo-bad)",
              }}
            >
              {cashFlow >= 0 ? "+" : ""}{formatCurrency(cashFlow)}
            </p>
          </div>

          <div style={CARD_WRAP}>
            <p style={CARD_LABEL}>30-Day Forecast</p>
            <p className="num" style={{ ...CARD_VALUE, color: "var(--fo-ink)" }}>
              {/* Placeholder — will wire to CashFlowForecast data in a future chunk */}
              —
            </p>
          </div>
        </div>

        {/* Budget pills row */}
        {budgetPills.length > 0 && (
          <div
            style={{
              background: "var(--fo-card)",
              border: "1px solid var(--fo-hair)",
              borderRadius: 10,
              padding: "14px 22px",
            }}
          >
            <p style={{ ...CARD_LABEL, marginBottom: 10 }}>Budget — % Used</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {budgetPills.map(({ cat, pct, color, name }) => {
                const valueColor =
                  pct > 100
                    ? "var(--fo-bad)"
                    : pct >= 80
                    ? "var(--fo-warn)"
                    : "var(--fo-muted)";
                return (
                  <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 12, color: "var(--fo-ink)", fontFamily: "var(--font-fo-sans)" }}>
                      {name}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: valueColor,
                        fontWeight: pct > 100 ? 600 : 400,
                        fontFamily: "var(--font-fo-sans)",
                      }}
                    >
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Row 2 — Cash Position Chart + Accounts */}
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 3, minHeight: 220 }}>
            <CashPositionChart />
          </div>
          <div style={{ flex: 2, minWidth: 0 }}>
            <AccountsBox accounts={accounts} />
          </div>
        </div>

        {/* Row 3 — Upcoming + Recent Transactions */}
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 3, minWidth: 0 }}>
            <UpcomingCard />
          </div>
          <div style={{ flex: 2, minWidth: 0, minHeight: 220 }}>
            <RecentTransactions
              transactions={localTxns}
              budgets={budgets}
              categories={categories}
            />
          </div>
        </div>

        {/* Row 4 — 30-Day Forecast (full width) */}
        <div style={{ height: 320 }}>
          <CashFlowForecast />
        </div>

      </div>
    </div>
  );
}
