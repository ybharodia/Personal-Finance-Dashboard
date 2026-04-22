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

const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

function freqChipStyle(freq: RecurringFrequency): React.CSSProperties {
  if (freq === "monthly") return { background: "oklch(0.97 0.02 35)", color: "oklch(0.45 0.12 35)" };
  if (freq === "biweekly") return { background: "oklch(0.94 0.04 220)", color: "oklch(0.44 0.1 220)" };
  return { background: "oklch(0.95 0.04 150)", color: "oklch(0.52 0.09 150)" };
}

function typeChipStyle(type: "income" | "expense"): React.CSSProperties {
  if (type === "income") return { background: "oklch(0.95 0.04 150)", color: "oklch(0.52 0.09 150)" };
  return { background: "oklch(0.95 0.03 25)", color: "oklch(0.52 0.13 25)" };
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
    <div
      className="flex-1 min-h-0 overflow-y-auto"
      style={{ background: "#faf8f4", fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}
    >
      <div className="max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-8 pb-24 md:pb-8">

        {/* Page header */}
        <div className="mb-5">
          <h1 className="text-xl font-semibold" style={{ color: "#1a1715" }}>Recurring Transactions</h1>
          <p className="text-sm mt-1" style={{ color: "#6b635b" }}>
            Your saved recurring transactions and bills
          </p>
        </div>

        {/* Account type tabs + Manage button */}
        <div
          className="flex items-center justify-between mb-6"
          style={{ borderBottom: "1px solid #ebe5dc", background: "#faf8f4" }}
        >
          <div className="flex items-center gap-1">
            {(["checking_savings", "credit_card"] as RecurringAccountType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "10px 16px",
                  fontSize: 14,
                  fontWeight: activeTab === tab ? 600 : 500,
                  color: activeTab === tab ? "#1a1715" : "#6b635b",
                  borderBottom: activeTab === tab ? "2px solid oklch(0.45 0.12 35)" : "2px solid transparent",
                  marginBottom: -1,
                  background: "transparent",
                  border: "none",
                  borderBottomStyle: "solid",
                  cursor: "pointer",
                  transition: "color 0.15s",
                }}
              >
                {tab === "checking_savings" ? "Checking & Savings" : "Credit Cards"}
              </button>
            ))}
          </div>
          <div className="pb-2">
            <button
              onClick={() => setShowManageModal(true)}
              style={{
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
              Manage Recurring
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-20">
            <p className="text-sm" style={{ color: "#6b635b" }}>Loading…</p>
          </div>
        )}

        {!loading && (
          <>
            {/* Summary cards */}
            {list.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {/* Monthly Committed */}
                <div
                  className="col-span-2 md:col-span-1"
                  style={{
                    background: "oklch(0.97 0.02 35)",
                    border: "1px solid #ebe5dc",
                    borderRadius: 10,
                    padding: "14px 16px",
                  }}
                >
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "1.4px",
                      color: "oklch(0.45 0.12 35)",
                      margin: 0,
                    }}
                  >
                    Monthly Committed
                  </p>
                  <p
                    style={{
                      fontFamily: MONO,
                      fontSize: 22,
                      fontWeight: 600,
                      color: "oklch(0.45 0.12 35)",
                      margin: "4px 0 0",
                    }}
                  >
                    {formatCurrency(stats.monthlyCommitted)}
                  </p>
                  <p style={{ fontSize: 11, color: "oklch(0.45 0.12 35)", margin: "2px 0 0", opacity: 0.7 }}>
                    {list.length} rules saved
                  </p>
                </div>

                {/* Monthly count */}
                <div style={{ background: "#ffffff", border: "1px solid #ebe5dc", borderRadius: 10, padding: "14px 16px" }}>
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.4px", color: "#6b635b", margin: 0 }}>Monthly</p>
                  <p style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, color: "#1a1715", margin: "4px 0 0" }}>{stats.counts.monthly}</p>
                  <p style={{ fontSize: 11, color: "#a39a8f", margin: "2px 0 0" }}>{formatCurrency(stats.totals.monthly)}/mo</p>
                </div>

                {/* Biweekly count */}
                <div style={{ background: "#ffffff", border: "1px solid #ebe5dc", borderRadius: 10, padding: "14px 16px" }}>
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.4px", color: "#6b635b", margin: 0 }}>Biweekly</p>
                  <p style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, color: "#1a1715", margin: "4px 0 0" }}>{stats.counts.biweekly}</p>
                  <p style={{ fontSize: 11, color: "#a39a8f", margin: "2px 0 0" }}>{formatCurrency(stats.totals.biweekly)}/each</p>
                </div>

                {/* Weekly count */}
                <div style={{ background: "#ffffff", border: "1px solid #ebe5dc", borderRadius: 10, padding: "14px 16px" }}>
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.4px", color: "#6b635b", margin: 0 }}>Weekly</p>
                  <p style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, color: "#1a1715", margin: "4px 0 0" }}>{stats.counts.weekly}</p>
                  <p style={{ fontSize: 11, color: "#a39a8f", margin: "2px 0 0" }}>{formatCurrency(stats.totals.weekly)}/each</p>
                </div>
              </div>
            )}

            {/* Filter pills */}
            {list.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {(["all", "monthly", "biweekly", "weekly"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={
                      filter === f
                        ? {
                            background: "oklch(0.45 0.12 35)",
                            color: "#ffffff",
                            border: "none",
                            padding: "6px 12px",
                            borderRadius: 16,
                            fontSize: 11.5,
                            fontWeight: 500,
                            cursor: "pointer",
                          }
                        : {
                            background: "#ffffff",
                            color: "#1a1715",
                            border: "1px solid #ebe5dc",
                            padding: "6px 12px",
                            borderRadius: 16,
                            fontSize: 11.5,
                            fontWeight: 450,
                            cursor: "pointer",
                          }
                    }
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
                  className="w-12 h-12 mx-auto mb-4"
                  style={{ color: "#ebe5dc" }}
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
                <p className="font-medium" style={{ color: "#6b635b" }}>No recurring transactions saved</p>
                <p className="text-sm mt-1" style={{ color: "#a39a8f" }}>
                  Use{" "}
                  <button
                    onClick={() => setShowManageModal(true)}
                    style={{ color: "oklch(0.45 0.12 35)", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0 }}
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
                <p className="font-medium" style={{ color: "#6b635b" }}>No {filter} transactions saved</p>
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
                      style={{
                        background: "#ffffff",
                        border: "1px solid #ebe5dc",
                        borderRadius: 10,
                        padding: "14px 15px",
                        minHeight: 150,
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        opacity: isRemoving ? 0.5 : 1,
                        pointerEvents: isRemoving ? "none" : "auto",
                        transition: "opacity 0.15s",
                      }}
                    >
                      {/* Merchant name + frequency chip + remove */}
                      <div className="flex items-start justify-between gap-2">
                        <h3
                          className="line-clamp-2 flex-1"
                          style={{ fontSize: 12.5, color: "#1a1715", fontWeight: 600, letterSpacing: "-0.2px", lineHeight: 1.4, margin: 0 }}
                        >
                          {r.merchant_key}
                        </h3>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {r.frequency && (
                            <span
                              style={{
                                ...freqChipStyle(r.frequency),
                                padding: "2px 8px",
                                borderRadius: 10,
                                fontSize: 10,
                                fontWeight: 500,
                              }}
                            >
                              {FREQUENCY_LABELS[r.frequency]}
                            </span>
                          )}
                          <button
                            onClick={() => handleRemove(r.merchant_key)}
                            title="Remove from recurring"
                            className="w-5 h-5 flex items-center justify-center rounded transition-colors hover:bg-red-50"
                            style={{ color: "#a39a8f", background: "none", border: "none", cursor: "pointer" }}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Transaction type chip — checking & savings tab only */}
                      {activeTab === "checking_savings" && r.transaction_type && (
                        <div>
                          <span
                            style={{
                              ...typeChipStyle(r.transaction_type),
                              padding: "2px 8px",
                              borderRadius: 10,
                              fontSize: 10,
                              fontWeight: 500,
                            }}
                          >
                            {r.transaction_type === "income" ? "Income" : "Expense"}
                          </span>
                        </div>
                      )}

                      {/* Amount */}
                      <div>
                        <p style={{ margin: 0 }}>
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 18,
                              fontWeight: 600,
                              letterSpacing: "-0.3px",
                              color: r.transaction_type === "income" ? "oklch(0.52 0.09 150)" : "#1a1715",
                            }}
                          >
                            {formatCurrency(r.avg_amount)}
                          </span>
                          <span style={{ fontSize: 11, color: "#a39a8f" }}> / occurrence</span>
                        </p>
                      </div>

                      {/* Next predicted date */}
                      <div
                        style={{
                          borderTop: "1px solid #ebe5dc",
                          paddingTop: 8,
                          marginTop: "auto",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span style={{ fontSize: 10.5, color: "#6b635b" }}>Next predicted</span>
                        {nextDate ? (
                          <span style={{ fontFamily: MONO, fontSize: 11, color: "#1a1715", fontWeight: 500 }}>
                            {nextDate.label}
                          </span>
                        ) : (
                          <span style={{ fontFamily: MONO, fontSize: 11, color: "#a39a8f" }}>—</span>
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
