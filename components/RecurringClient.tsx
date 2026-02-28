"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { RecurringTransaction, RecurringFrequency } from "@/lib/recurring";
import { buildManualRecurring, toMerchantKey } from "@/lib/recurring";
import { formatCurrency, getCategoryMeta } from "@/lib/data";
import type { DbTransaction } from "@/lib/database.types";

type Props = {
  recurring: RecurringTransaction[];
  allTransactions: DbTransaction[];
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

type FilterType = "all" | RecurringFrequency;

export default function RecurringClient({ recurring, allTransactions }: Props) {
  const router = useRouter();
  const [list, setList] = useState<RecurringTransaction[]>(recurring);
  const [filter, setFilter] = useState<FilterType>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  // ── Derived state ────────────────────────────────────────────────────────────

  const filtered = useMemo(
    () => (filter === "all" ? list : list.filter((r) => r.frequency === filter)),
    [list, filter]
  );

  const totalMonthly = useMemo(
    () => list.reduce((sum, r) => sum + r.monthlyAmount, 0),
    [list]
  );

  const counts = useMemo(
    () => ({
      monthly: list.filter((r) => r.frequency === "monthly").length,
      biweekly: list.filter((r) => r.frequency === "biweekly").length,
      weekly: list.filter((r) => r.frequency === "weekly").length,
    }),
    [list]
  );

  const byFrequencyMonthly = useMemo(
    () => ({
      monthly: list.filter((r) => r.frequency === "monthly").reduce((s, r) => s + r.monthlyAmount, 0),
      biweekly: list.filter((r) => r.frequency === "biweekly").reduce((s, r) => s + r.monthlyAmount, 0),
      weekly: list.filter((r) => r.frequency === "weekly").reduce((s, r) => s + r.monthlyAmount, 0),
    }),
    [list]
  );

  // Unique merchants from all transactions that are NOT already in the list.
  // Deduplicated by normalized key, shown most-recent first.
  const addableMerchants = useMemo(() => {
    const existingKeys = new Set(list.map((r) => r.merchantKey));
    const seen = new Set<string>();
    const result: DbTransaction[] = [];
    // Sort descending by date so we show the most recent occurrence for each merchant
    const sorted = [...allTransactions].sort((a, b) => b.date.localeCompare(a.date));
    for (const tx of sorted) {
      if (tx.type === "income") continue;
      const key = toMerchantKey(tx.description);
      if (!key || seen.has(key) || existingKeys.has(key)) continue;
      seen.add(key);
      result.push(tx);
    }
    return result.sort((a, b) => a.description.localeCompare(b.description));
  }, [allTransactions, list]);

  const filteredAddable = useMemo(() => {
    if (!addSearch.trim()) return addableMerchants.slice(0, 60);
    const q = addSearch.toLowerCase();
    return addableMerchants.filter((tx) =>
      tx.description.toLowerCase().includes(q)
    ).slice(0, 60);
  }, [addableMerchants, addSearch]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleRemove(merchantKey: string) {
    const snapshot = list; // capture current state for accurate rollback
    setList((prev) => prev.filter((r) => r.merchantKey !== merchantKey));
    setPendingKey(merchantKey);
    try {
      const res = await fetch("/api/recurring/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_key: merchantKey, is_recurring: false }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Request failed");
      }
      router.refresh(); // invalidate Next.js router cache so navigating back reflects the change
    } catch (err) {
      console.error("[RecurringClient] handleRemove failed:", err);
      setList(snapshot); // restore only this operation's state, not all previous removals
    } finally {
      setPendingKey(null);
    }
  }

  async function handleAdd(tx: DbTransaction) {
    const key = toMerchantKey(tx.description);
    if (!key) return;
    setPendingKey(key);
    try {
      const res = await fetch("/api/recurring/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_key: key, is_recurring: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Request failed");
      }

      // Build synthetic entry from matching transactions
      const matching = allTransactions.filter(
        (t) => t.type !== "income" && toMerchantKey(t.description) === key
      );
      const newEntry = buildManualRecurring(matching, key);
      setList((prev) =>
        [...prev, newEntry].sort((a, b) => b.monthlyAmount - a.monthlyAmount)
      );
      setShowAddModal(false);
      setAddSearch("");
      router.refresh(); // invalidate Next.js router cache so navigating back reflects the addition
    } catch (err) {
      console.error("[RecurringClient] handleAdd failed:", err);
      // noop — data wasn't saved
    } finally {
      setPendingKey(null);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-8 pb-24 md:pb-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">Recurring Transactions</h1>
            <p className="text-sm text-gray-400 mt-1">
              Subscriptions and bills detected from your transaction history
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        </div>

        {/* Summary cards */}
        {list.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="col-span-2 md:col-span-1 bg-indigo-600/20 border border-indigo-500/30 rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                Monthly Committed
              </p>
              <p className="text-2xl font-bold text-white mt-1">
                {formatCurrency(totalMonthly)}
              </p>
              <p className="text-xs text-indigo-300/70 mt-0.5">
                {list.length} recurring detected
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Monthly</p>
              <p className="text-xl font-bold text-white mt-1">{counts.monthly}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatCurrency(byFrequencyMonthly.monthly)}/mo</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Biweekly</p>
              <p className="text-xl font-bold text-white mt-1">{counts.biweekly}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatCurrency(byFrequencyMonthly.biweekly)}/mo</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Weekly</p>
              <p className="text-xl font-bold text-white mt-1">{counts.weekly}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatCurrency(byFrequencyMonthly.weekly)}/mo</p>
            </div>
          </div>
        )}

        {/* Filter tabs */}
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
                : `${FREQUENCY_LABELS[f]} (${counts[f]})`}
            </button>
          ))}
        </div>

        {/* Cards grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <svg
              className="w-12 h-12 mx-auto text-gray-700 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            <p className="text-gray-400 font-medium">No recurring transactions detected</p>
            <p className="text-gray-600 text-sm mt-1">
              Use the Add button to manually mark a transaction as recurring
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((r) => {
              const categoryMeta = r.category ? getCategoryMeta(r.category) : null;
              const nextDate = formatDateRelative(r.nextPredictedDate);
              const isRemoving = pendingKey === r.merchantKey;

              return (
                <div
                  key={r.merchantKey}
                  className={`bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3 transition-all ${
                    isRemoving ? "opacity-50 pointer-events-none" : "hover:border-gray-700"
                  }`}
                >
                  {/* Merchant name + badges */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2 flex-1">
                      {r.merchant}
                    </h3>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${FREQUENCY_BADGE[r.frequency]}`}
                      >
                        {FREQUENCY_LABELS[r.frequency]}
                      </span>
                      {/* Remove button */}
                      <button
                        onClick={() => handleRemove(r.merchantKey)}
                        title="Remove from recurring"
                        className="w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-red-400 hover:bg-red-950/50 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Category */}
                  {categoryMeta && (
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: categoryMeta.color }}
                      />
                      <span className="text-xs text-gray-400">{categoryMeta.name}</span>
                      {r.subcategory && (
                        <span className="text-xs text-gray-600">· {r.subcategory}</span>
                      )}
                    </div>
                  )}

                  {/* Monthly amount */}
                  <div>
                    <p className="text-2xl font-bold text-white">
                      {formatCurrency(r.monthlyAmount)}
                      <span className="text-sm font-normal text-gray-400">/mo</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatCurrency(r.averageAmount)} per charge &middot;{" "}
                      {r.occurrences} occurrences found
                    </p>
                  </div>

                  {/* Next predicted date */}
                  <div className="flex items-center justify-between text-xs border-t border-gray-800 pt-3">
                    <span className="text-gray-500">Next predicted</span>
                    <span className={nextDate.urgent ? "text-amber-400 font-medium" : "text-gray-300"}>
                      {nextDate.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add Recurring Modal ───────────────────────────────────────────────── */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4 pb-4 sm:pb-0"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddModal(false);
              setAddSearch("");
            }
          }}
        >
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">Add Recurring Transaction</h2>
              <button
                onClick={() => { setShowAddModal(false); setAddSearch(""); }}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-3 border-b border-gray-800">
              <input
                type="text"
                autoFocus
                placeholder="Search merchants…"
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 outline-none focus:border-indigo-500 placeholder:text-gray-500"
              />
            </div>

            {/* Merchant list */}
            <div className="overflow-y-auto flex-1">
              {filteredAddable.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-10">
                  {addSearch ? "No merchants match your search" : "All merchants are already recurring"}
                </p>
              ) : (
                filteredAddable.map((tx) => {
                  const key = toMerchantKey(tx.description);
                  const isAdding = pendingKey === key;
                  return (
                    <button
                      key={key}
                      onClick={() => handleAdd(tx)}
                      disabled={isAdding}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800 transition-colors text-left border-b border-gray-800/50 last:border-0 disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{tx.description}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatCurrency(Math.abs(tx.amount))} &middot; {tx.date}
                        </p>
                      </div>
                      {isAdding ? (
                        <svg className="w-4 h-4 text-gray-500 animate-spin shrink-0 ml-2" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-gray-500 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-3 border-t border-gray-800">
              <p className="text-xs text-gray-600">
                Selecting a merchant manually marks it as recurring and persists across sessions.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
