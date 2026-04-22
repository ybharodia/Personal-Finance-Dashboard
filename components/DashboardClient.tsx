"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, getCategoryMeta } from "@/lib/data";
import type { CategoryMeta } from "@/lib/data";
import type { DbAccount, DbTransaction, DbBudget } from "@/lib/database.types";
import { useDateFilter } from "@/lib/date-filter-context";
import { exportToExcel } from "@/lib/exportToExcel";
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

export default function DashboardClient({ accounts, transactions, budgets, categories }: Props) {
  const router = useRouter();
  const { dateRange, setDashboardActions } = useDateFilter();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [localTxns, setLocalTxns] = useState<DbTransaction[]>(transactions);
  const [forecastBalance, setForecastBalance] = useState<number | null>(null);

  const handleDownload = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = accounts.map((a) => ({
      "Account Name": a.custom_name ?? a.name,
      "Account Type": a.type,
      "Current Balance": a.balance,
      "Last Updated": today,
    }));
    exportToExcel(rows, `FinanceOS_Balances_${today}`, "Balances");
  }, [accounts]);

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

  // Register toolbar actions into AppShell topbar via context
  useEffect(() => {
    setDashboardActions({ onDownload: handleDownload, onSync: handleSync, syncStatus, syncError });
    return () => setDashboardActions(null);
  }, [handleDownload, handleSync, syncStatus, syncError, setDashboardActions]);

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

  return (
    <div className="flex-1 overflow-y-auto bg-fo-bg">
      <div className="p-4 md:p-6 space-y-4 md:space-y-5">

        {/* Row 1 — stat cards + budget pills in one unified card */}
        <div
          style={{
            background: "var(--fo-card)",
            border: "1px solid var(--fo-hair)",
            borderRadius: 10,
            padding: "18px 22px",
          }}
        >
          {/* 4 stat columns separated by vertical hairlines */}
          <div style={{ display: "flex" }}>
            <div style={{ flex: 1, paddingRight: 22 }}>
              <p style={CARD_LABEL}>Income</p>
              <p className="num" style={{ ...CARD_VALUE, color: "var(--fo-good)" }}>
                {formatCurrency(totalIncome)}
              </p>
            </div>

            <div style={{ flex: 1, padding: "0 22px", borderLeft: "1px solid var(--fo-hair)" }}>
              <p style={CARD_LABEL}>Expenses</p>
              <p className="num" style={{ ...CARD_VALUE, color: "var(--fo-bad)" }}>
                -{formatCurrency(totalExpenses)}
              </p>
            </div>

            <div style={{ flex: 1, padding: "0 22px", borderLeft: "1px solid var(--fo-hair)" }}>
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

            <div style={{ flex: 1, paddingLeft: 22, borderLeft: "1px solid var(--fo-hair)" }}>
              <p style={CARD_LABEL}>30-Day Forecast</p>
              <p className="num" style={{ ...CARD_VALUE, color: "var(--fo-ink)" }}>
                {forecastBalance !== null ? formatCurrency(forecastBalance) : "—"}
              </p>
            </div>
          </div>

          {/* Budget pills — below hairline divider */}
          {budgetPills.length > 0 && (
            <div
              style={{
                borderTop: "1px solid var(--fo-hair)",
                paddingTop: 14,
                marginTop: 14,
              }}
            >
              <p style={{ ...CARD_LABEL, marginBottom: 10 }}>Budget — % Used</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {budgetPills.map(({ cat, pct, color, name }) => {
                  const pctColor =
                    pct > 100
                      ? "var(--fo-bad)"
                      : pct >= 80
                      ? "var(--fo-warn)"
                      : "var(--fo-muted)";
                  return (
                    <div
                      key={cat}
                      style={{
                        background: "var(--fo-soft)",
                        borderRadius: 99,
                        padding: "6px 12px 6px 10px",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          background: color,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--fo-ink)",
                          fontFamily: "var(--font-fo-sans)",
                        }}
                      >
                        {name}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontFamily: "var(--font-fo-mono)",
                          fontWeight: 500,
                          color: pctColor,
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
        </div>

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
          <CashFlowForecast onForecastLoad={setForecastBalance} />
        </div>

      </div>
    </div>
  );
}
