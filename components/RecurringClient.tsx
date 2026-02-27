"use client";

import { useState, useMemo } from "react";
import type { RecurringTransaction, RecurringFrequency } from "@/lib/recurring";
import { formatCurrency, getCategoryMeta } from "@/lib/data";

type Props = {
  recurring: RecurringTransaction[];
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

export default function RecurringClient({ recurring }: Props) {
  const [filter, setFilter] = useState<FilterType>("all");

  const filtered = useMemo(
    () => (filter === "all" ? recurring : recurring.filter((r) => r.frequency === filter)),
    [recurring, filter]
  );

  const totalMonthly = useMemo(
    () => recurring.reduce((sum, r) => sum + r.monthlyAmount, 0),
    [recurring]
  );

  const counts = useMemo(
    () => ({
      monthly: recurring.filter((r) => r.frequency === "monthly").length,
      biweekly: recurring.filter((r) => r.frequency === "biweekly").length,
      weekly: recurring.filter((r) => r.frequency === "weekly").length,
    }),
    [recurring]
  );

  const byFrequencyMonthly = useMemo(
    () => ({
      monthly: recurring
        .filter((r) => r.frequency === "monthly")
        .reduce((s, r) => s + r.monthlyAmount, 0),
      biweekly: recurring
        .filter((r) => r.frequency === "biweekly")
        .reduce((s, r) => s + r.monthlyAmount, 0),
      weekly: recurring
        .filter((r) => r.frequency === "weekly")
        .reduce((s, r) => s + r.monthlyAmount, 0),
    }),
    [recurring]
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-8 pb-24 md:pb-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Recurring Transactions</h1>
          <p className="text-sm text-gray-400 mt-1">
            Subscriptions and bills detected from your transaction history
          </p>
        </div>

        {/* Summary cards */}
        {recurring.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {/* Total monthly committed — spans 2 cols on mobile */}
            <div className="col-span-2 md:col-span-1 bg-indigo-600/20 border border-indigo-500/30 rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                Monthly Committed
              </p>
              <p className="text-2xl font-bold text-white mt-1">
                {formatCurrency(totalMonthly)}
              </p>
              <p className="text-xs text-indigo-300/70 mt-0.5">
                {recurring.length} recurring detected
              </p>
            </div>

            {/* Monthly */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Monthly
              </p>
              <p className="text-xl font-bold text-white mt-1">{counts.monthly}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatCurrency(byFrequencyMonthly.monthly)}/mo
              </p>
            </div>

            {/* Biweekly */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Biweekly
              </p>
              <p className="text-xl font-bold text-white mt-1">{counts.biweekly}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatCurrency(byFrequencyMonthly.biweekly)}/mo
              </p>
            </div>

            {/* Weekly */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Weekly
              </p>
              <p className="text-xl font-bold text-white mt-1">{counts.weekly}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatCurrency(byFrequencyMonthly.weekly)}/mo
              </p>
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
                ? `All (${recurring.length})`
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
              Need at least 3 transactions with a consistent amount and schedule
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((r, i) => {
              const categoryMeta = r.category ? getCategoryMeta(r.category) : null;
              const nextDate = formatDateRelative(r.nextPredictedDate);

              return (
                <div
                  key={i}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3 hover:border-gray-700 transition-colors"
                >
                  {/* Merchant name + frequency badge */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2">
                      {r.merchant}
                    </h3>
                    <span
                      className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${FREQUENCY_BADGE[r.frequency]}`}
                    >
                      {FREQUENCY_LABELS[r.frequency]}
                    </span>
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
                    <span
                      className={
                        nextDate.urgent ? "text-amber-400 font-medium" : "text-gray-300"
                      }
                    >
                      {nextDate.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
