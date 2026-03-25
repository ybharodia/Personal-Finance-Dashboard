"use client";

import { useState, useEffect, useMemo } from "react";
import { formatCurrency } from "@/lib/data";
import type { RecurringAccountType } from "@/lib/database.types";
import ManageRecurringModal from "@/components/ManageRecurringModal";

type RecurringFrequency = "weekly" | "biweekly" | "monthly";

type DisplayItem = {
  merchant_key: string;
  frequency: RecurringFrequency | null;
  transaction_type: "income" | "expense" | null;
  avg_amount: number;
  last_date: string | null;
  next_date: string | null;
};

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
};

const FREQUENCY_BADGE: Record<RecurringFrequency, string> = {
  weekly: "bg-emerald-900/50 text-emerald-400 border border-emerald-800/50",
  biweekly: "bg-violet-900/50 text-violet-400 border border-violet-800/50",
  monthly: "bg-indigo-900/50 text-indigo-400 border border-indigo-800/50",
};

function formatDateRelative(dateStr: string): { label: string; urgent: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, urgent: true };
  if (diffDays === 0) return { label: "Today", urgent: true };
  if (diffDays === 1) return { label: "Tomorrow", urgent: false };
  if (diffDays <= 7) return { label: `In ${diffDays} days`, urgent: false };
  return {
    label: new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    urgent: false,
  };
}

export default function RecurringClient() {
  const [activeTab, setActiveTab] = useState<RecurringAccountType>("checking_savings");
  const [showManageModal, setShowManageModal] = useState(false);
  const [filter, setFilter] = useState<"all" | RecurringFrequency>("all");
  const [checkingList, setCheckingList] = useState<DisplayItem[]>([]);
  const [creditList, setCreditList] = useState<DisplayItem[]>([]);
  const [checkingLoading, setCheckingLoading] = useState(true);
  const [creditLoading, setCreditLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch both tabs on mount and whenever the modal saves changes
  useEffect(() => {
    setCheckingLoading(true);
    fetch("/api/recurring-display?account_type=checking_savings")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setCheckingList(data); })
      .catch(console.error)
      .finally(() => setCheckingLoading(false));
  }, [refreshKey]);

  useEffect(() => {
    setCreditLoading(true);
    fetch("/api/recurring-display?account_type=credit_card")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setCreditList(data); })
      .catch(console.error)
      .finally(() => setCreditLoading(false));
  }, [refreshKey]);

  const list = activeTab === "checking_savings" ? checkingList : creditList;
  const loading = activeTab === "checking_savings" ? checkingLoading : creditLoading;

  const filtered = useMemo(
    () => (filter === "all" ? list : list.filter((r) => r.frequency === filter)),
    [list, filter]
  );

  // Summary stats: Monthly Committed = sum of monthly expense avg_amounts
  const stats = useMemo(() => {
    const counts = { monthly: 0, biweekly: 0, weekly: 0 };
    const totals = { monthly: 0, biweekly: 0, weekly: 0 };
    let monthlyCommitted = 0;
    for (const r of list) {
      const freq = r.frequency;
      if (!freq) continue;
      counts[freq]++;
      totals[freq] += r.avg_amount;
      if (freq === "monthly" && r.transaction_type !== "income") {
        monthlyCommitted += r.avg_amount;
      }
    }
    return { counts, totals, monthlyCommitted };
  }, [list]);

  async function handleRemove(merchantKey: string) {
    const snapshot = activeTab === "checking_savings" ? [...checkingList] : [...creditList];
    // Optimistic remove
    if (activeTab === "checking_savings") {
      setCheckingList((prev) => prev.filter((r) => r.merchant_key !== merchantKey));
    } else {
      setCreditList((prev) => prev.filter((r) => r.merchant_key !== merchantKey));
    }
    setPendingKey(merchantKey);
    try {
      const res = await fetch("/api/recurring-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_key: merchantKey,
          account_type: activeTab,
          is_recurring: false,
          frequency: null,
          transaction_type: null,
        }),
      });
      if (!res.ok) throw new Error("Request failed");
    } catch (err) {
      console.error("[RecurringClient] handleRemove failed:", err);
      if (activeTab === "checking_savings") setCheckingList(snapshot);
      else setCreditList(snapshot);
    } finally {
      setPendingKey(null);
    }
  }

  function handleManageClose() {
    setShowManageModal(false);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-8 pb-24 md:pb-8">

        {/* Page header */}
        <div className="mb-5">
          <h1 className="text-xl font-semibold text-white">Recurring Transactions</h1>
          <p className="text-sm text-gray-400 mt-1">
            Your saved recurring transactions and bills
          </p>
        </div>

        {/* Account type tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-gray-800">
          {(["checking_savings", "credit_card"] as RecurringAccountType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? "border-indigo-500 text-white"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              {tab === "checking_savings" ? "Checking & Savings" : "Credit Cards"}
            </button>
          ))}
        </div>

        {/* Sub-header with Manage button */}
        <div className="flex items-center justify-end mb-6">
          <button
            onClick={() => setShowManageModal(true)}
            className="px-3 py-2 rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 text-sm font-medium transition-colors"
          >
            Manage Recurring
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-20">
            <p className="text-gray-500 text-sm">Loading…</p>
          </div>
        )}

        {!loading && (
          <>
            {/* Summary cards */}
            {list.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="col-span-2 md:col-span-1 bg-indigo-600/20 border border-indigo-500/30 rounded-xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                    Monthly Committed
                  </p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {formatCurrency(stats.monthlyCommitted)}
                  </p>
                  <p className="text-xs text-indigo-300/70 mt-0.5">
                    {list.length} rules saved
                  </p>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Monthly</p>
                  <p className="text-xl font-bold text-white mt-1">{stats.counts.monthly}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatCurrency(stats.totals.monthly)}/mo</p>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Biweekly</p>
                  <p className="text-xl font-bold text-white mt-1">{stats.counts.biweekly}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatCurrency(stats.totals.biweekly)}/each</p>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Weekly</p>
                  <p className="text-xl font-bold text-white mt-1">{stats.counts.weekly}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatCurrency(stats.totals.weekly)}/each</p>
                </div>
              </div>
            )}

            {/* Filter tabs */}
            {list.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {(["all", "monthly", "biweekly", "weekly"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      filter === f
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white border border-gray-800"
                    }`}
                  >
                    {f === "all"
                      ? `All (${list.length})`
                      : `${FREQUENCY_LABELS[f]} (${stats.counts[f]})`}
                  </button>
                ))}
              </div>
            )}

            {/* Empty state — no rules saved */}
            {list.length === 0 && (
              <div className="text-center py-20">
                <svg
                  className="w-12 h-12 mx-auto text-gray-700 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  {activeTab === "credit_card" ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  )}
                </svg>
                <p className="text-gray-400 font-medium">No recurring transactions saved</p>
                <p className="text-gray-600 text-sm mt-1">
                  Use{" "}
                  <button
                    onClick={() => setShowManageModal(true)}
                    className="text-indigo-400 hover:text-indigo-300 underline"
                  >
                    Manage Recurring
                  </button>{" "}
                  to mark transactions as recurring
                </p>
              </div>
            )}

            {/* Empty state — filter has no matches */}
            {list.length > 0 && filtered.length === 0 && (
              <div className="text-center py-20">
                <p className="text-gray-400 font-medium">No {filter} transactions saved</p>
              </div>
            )}

            {/* Card grid */}
            {filtered.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((r) => {
                  const nextDate = r.next_date ? formatDateRelative(r.next_date) : null;
                  const isRemoving = pendingKey === r.merchant_key;

                  return (
                    <div
                      key={r.merchant_key}
                      className={`bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3 transition-all ${
                        isRemoving ? "opacity-50 pointer-events-none" : "hover:border-gray-700"
                      }`}
                    >
                      {/* Merchant name + frequency badge + remove */}
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2 flex-1">
                          {r.merchant_key}
                        </h3>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {r.frequency && (
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${FREQUENCY_BADGE[r.frequency]}`}
                            >
                              {FREQUENCY_LABELS[r.frequency]}
                            </span>
                          )}
                          <button
                            onClick={() => handleRemove(r.merchant_key)}
                            title="Remove from recurring"
                            className="w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-red-400 hover:bg-red-950/50 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Transaction type badge — checking & savings tab only */}
                      {activeTab === "checking_savings" && r.transaction_type && (
                        <div>
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              r.transaction_type === "income"
                                ? "bg-emerald-900/50 text-emerald-400 border border-emerald-800/50"
                                : "bg-rose-900/50 text-rose-400 border border-rose-800/50"
                            }`}
                          >
                            {r.transaction_type === "income" ? "Income" : "Expense"}
                          </span>
                        </div>
                      )}

                      {/* Amount */}
                      <div>
                        <p className="text-2xl font-bold text-white">
                          {formatCurrency(r.avg_amount)}
                          <span className="text-sm font-normal text-gray-400"> / occurrence</span>
                        </p>
                      </div>

                      {/* Next predicted date */}
                      <div className="flex items-center justify-between text-xs border-t border-gray-800 pt-3">
                        <span className="text-gray-500">Next predicted</span>
                        {nextDate ? (
                          <span className={nextDate.urgent ? "text-amber-400 font-medium" : "text-gray-300"}>
                            {nextDate.label}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Manage Recurring Modal */}
      {showManageModal && (
        <ManageRecurringModal
          accountType={activeTab}
          onClose={handleManageClose}
        />
      )}
    </div>
  );
}
