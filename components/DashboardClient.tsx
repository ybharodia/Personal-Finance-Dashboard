"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import DateRangeFilter, { type DateRange, getPresetRange } from "@/components/DateRangeFilter";
import { formatCurrency } from "@/lib/data";
import type { CategoryMeta } from "@/lib/data";
import type { DbAccount, DbTransaction, DbBudget } from "@/lib/database.types";
import DownloadBalancesButton from "@/components/DownloadBalancesButton";
import AccountsBox from "@/components/AccountsBox";

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

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-400 mt-0.5">{formatRangeLabel(dateRange)}</p>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <DownloadBalancesButton accounts={accounts} />
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={handleSync}
                disabled={syncStatus === "syncing"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  syncStatus === "success"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : syncStatus === "error"
                    ? "bg-red-50 text-red-600 border-red-200"
                    : syncStatus === "syncing"
                    ? "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {syncStatus === "syncing" ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Syncing…
                  </>
                ) : syncStatus === "success" ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Synced!
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Sync
                  </>
                )}
              </button>
              {syncStatus === "error" && syncError && (
                <p className="text-xs text-red-500 max-w-[160px] text-right">{syncError}</p>
              )}
            </div>
          </div>
        </div>

        {/* Date range filter */}
        <DateRangeFilter value={dateRange} onChange={setDateRange} />

        {/* Row 1 — Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Total Income", value: totalIncome, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
            { label: "Total Expenses", value: totalExpenses, color: "text-red-500", bg: "bg-red-50", border: "border-red-100" },
            { label: "Cash Flow", value: cashFlow, color: cashFlow >= 0 ? "text-emerald-600" : "text-red-500", bg: cashFlow >= 0 ? "bg-emerald-50" : "bg-red-50", border: cashFlow >= 0 ? "border-emerald-100" : "border-red-100" },
          ].map(({ label, value, color, bg, border }) => (
            <div key={label} className={`${bg} border ${border} rounded-xl px-5 py-4`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
              <p className={`text-2xl font-bold tabular-nums ${color}`}>
                {label === "Total Expenses" ? `-${formatCurrency(value)}` : formatCurrency(value)}
              </p>
            </div>
          ))}
        </div>

        {/* Row 2 — Cash Position Chart + Accounts */}
        <div className="flex gap-4">
          <div className="flex-[3] min-h-[220px] bg-gray-100 rounded-xl flex items-center justify-center">
            <span className="text-sm text-gray-400 font-medium">Cash Position Chart — coming soon</span>
          </div>
          <div className="flex-[2] min-w-0">
            <AccountsBox accounts={accounts} />
          </div>
        </div>

        {/* Row 3 — 30-Day Forecast + Recent Transactions */}
        <div className="flex gap-4">
          <div className="flex-1 min-h-[220px] bg-gray-100 rounded-xl flex items-center justify-center">
            <span className="text-sm text-gray-400 font-medium">30-Day Forecast — coming soon</span>
          </div>
          <div className="flex-1 min-h-[220px] bg-gray-100 rounded-xl flex items-center justify-center">
            <span className="text-sm text-gray-400 font-medium">Recent Transactions — coming soon</span>
          </div>
        </div>
      </div>
    </div>
  );
}
