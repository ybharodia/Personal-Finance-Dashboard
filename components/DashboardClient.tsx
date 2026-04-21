"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import DateRangeFilter, { type DateRange, getPresetRange } from "@/components/DateRangeFilter";
import { formatCurrency } from "@/lib/data";
import type { CategoryMeta } from "@/lib/data";
import type { DbAccount, DbTransaction, DbBudget } from "@/lib/database.types";
import DownloadBalancesButton from "@/components/DownloadBalancesButton";
import AccountsBox from "@/components/AccountsBox";
import CashPositionChart from "@/components/CashPositionChart";
import RecentTransactions from "@/components/RecentTransactions";
import CashFlowForecast from "@/components/CashFlowForecast";

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

function formatRangeLabel(range: DateRange): string {
  const { from, to, preset } = range;
  if (preset === "this-month") {
    return from.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  if (preset === "this-year") {
    return `Jan 1 – Today, ${from.getFullYear()}`;
  }
  const lastDay = new Date(to.getTime() - 86400000);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (from.getFullYear() === lastDay.getFullYear()) {
    return `${fmt(from)} – ${fmt(lastDay)}, ${from.getFullYear()}`;
  }
  return `${fmt(from)}, ${from.getFullYear()} – ${fmt(lastDay)}, ${lastDay.getFullYear()}`;
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

export default function DashboardClient({ accounts, transactions, budgets, categories }: Props) {
  const router = useRouter();
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange("this-month"));
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [localTxns, setLocalTxns] = useState<DbTransaction[]>(transactions);

  const handleSync = async () => {
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
  };

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
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">

        {/* Header — date label + action buttons */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: 13, color: "var(--fo-faint)", fontFamily: "var(--font-fo-sans)" }}>
            {formatRangeLabel(dateRange)}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <DownloadBalancesButton accounts={accounts} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <button
                onClick={handleSync}
                disabled={syncStatus === "syncing"}
                style={syncBtnStyle}
              >
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
        </div>

        {/* Date range filter */}
        <DateRangeFilter value={dateRange} onChange={setDateRange} />

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: "Total Income",
              value: formatCurrency(totalIncome),
              valueColor: "var(--fo-good)",
            },
            {
              label: "Total Expenses",
              value: `-${formatCurrency(totalExpenses)}`,
              valueColor: "var(--fo-bad)",
            },
            {
              label: "Cash Flow",
              value: formatCurrency(cashFlow),
              valueColor: cashFlow >= 0 ? "var(--fo-ink)" : "var(--fo-bad)",
            },
          ].map(({ label, value, valueColor }) => (
            <div
              key={label}
              style={{
                background: "var(--fo-card)",
                border: "1px solid var(--fo-hair)",
                borderRadius: 10,
                padding: "18px 22px",
              }}
            >
              <p
                style={{
                  fontSize: 10,
                  color: "var(--fo-muted)",
                  letterSpacing: "1.3px",
                  textTransform: "uppercase",
                  fontFamily: "var(--font-fo-sans)",
                  marginBottom: 8,
                }}
              >
                {label}
              </p>
              <p
                className="num"
                style={{
                  fontFamily: "var(--font-fo-serif)",
                  fontSize: 30,
                  fontWeight: 500,
                  color: valueColor,
                }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Row 2 — Cash Position Chart + Accounts */}
        <div className="flex gap-4">
          <div className="flex-[3] min-h-[220px]">
            <CashPositionChart />
          </div>
          <div className="flex-[2] min-w-0">
            <AccountsBox accounts={accounts} />
          </div>
        </div>

        {/* Row 3 — 30-Day Forecast */}
        <div className="h-[320px]">
          <CashFlowForecast />
        </div>

        {/* Row 4 — Recent Transactions */}
        <div className="min-h-[220px]">
          <RecentTransactions
            transactions={localTxns}
            budgets={budgets}
            categories={categories}
          />
        </div>

      </div>
    </div>
  );
}
