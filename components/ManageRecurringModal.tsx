"use client";

import { useEffect, useRef, useState } from "react";
import { formatCurrency } from "@/lib/data";
import type { RecurringAccountType } from "@/lib/database.types";

type AccountType = RecurringAccountType;

type Merchant = {
  merchant_key: string;
  average_amount: number;
};

type RecurringRule = {
  merchant_key: string;
  is_recurring: boolean;
  frequency: "weekly" | "biweekly" | "monthly" | null;
  transaction_type: "income" | "expense" | null;
};

type RowState = {
  is_recurring: boolean;
  frequency: "weekly" | "biweekly" | "monthly" | null;
  transaction_type: "income" | "expense" | null;
};

type Props = {
  accountType: AccountType;
  onClose: () => void;
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
        checked ? "bg-indigo-600" : "bg-gray-700"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function ManageRecurringModal({ accountType, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(false);
  const [rows, setRows] = useState<Map<string, RowState>>(new Map());
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const initialRows = useRef<Map<string, RowState>>(new Map());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const title =
    accountType === "checking_savings"
      ? "Manage Recurring — Checking & Savings"
      : "Manage Recurring — Credit Cards";

  const showTypeToggle = accountType === "checking_savings";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [merchantsRes, rulesRes] = await Promise.all([
        fetch(`/api/recurring-merchants?account_type=${accountType}`).then((r) => r.json()),
        fetch(`/api/recurring-rules?account_type=${accountType}`).then((r) => r.json()),
      ]);
      if (cancelled) return;

      const merchantList: Merchant[] = Array.isArray(merchantsRes) ? merchantsRes : [];
      const ruleList: RecurringRule[] = Array.isArray(rulesRes) ? rulesRes : [];

      const ruleMap = new Map(ruleList.map((r) => [r.merchant_key, r]));
      const freshRows = new Map<string, RowState>();
      for (const m of merchantList) {
        const existing = ruleMap.get(m.merchant_key);
        freshRows.set(m.merchant_key, {
          is_recurring: existing?.is_recurring ?? false,
          frequency: existing?.frequency ?? null,
          transaction_type: existing?.transaction_type ?? (showTypeToggle ? null : "expense"),
        });
      }
      setMerchants(merchantList);
      setRows(freshRows);
      initialRows.current = new Map(freshRows); // snapshot for change detection
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [accountType, showTypeToggle]);

  function updateRow(key: string, patch: Partial<RowState>) {
    setRows((prev) => {
      const next = new Map(prev);
      next.set(key, { ...prev.get(key)!, ...patch });
      return next;
    });
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      // Only POST rows that differ from the initial loaded state
      const changed = merchants.filter((m) => {
        const current = rows.get(m.merchant_key)!;
        const original = initialRows.current.get(m.merchant_key);
        if (!original) return current.is_recurring; // new merchant with toggle on
        return (
          current.is_recurring !== original.is_recurring ||
          current.frequency !== original.frequency ||
          current.transaction_type !== original.transaction_type
        );
      });
      await Promise.all(
        changed.map((m) => {
          const row = rows.get(m.merchant_key)!;
          return fetch("/api/recurring-rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              merchant_key: m.merchant_key,
              account_type: accountType,
              is_recurring: row.is_recurring,
              frequency: row.is_recurring ? (row.frequency ?? "monthly") : null,
              transaction_type: showTypeToggle
                ? (row.is_recurring ? (row.transaction_type ?? "expense") : null)
                : "expense",
            }),
          });
        })
      );
      setToast(true);
      toastTimer.current = setTimeout(() => {
        setToast(false);
        onClose();
      }, 1500);
    } finally {
      setSaving(false);
    }
  }

  // Cleanup timer on unmount
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950/95">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white transition-colors p-1 rounded"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <svg className="w-6 h-6 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
        ) : merchants.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-gray-500 text-sm">No merchants found for this account type.</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-4 py-4">
            {/* Column headers */}
            <div
              className={`grid items-center gap-4 px-3 py-2 mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500 ${
                showTypeToggle ? "grid-cols-[1fr_130px_120px_80px]" : "grid-cols-[1fr_130px_80px]"
              }`}
            >
              <span>Merchant</span>
              <span>Frequency</span>
              {showTypeToggle && <span>Type</span>}
              <span>Recurring</span>
            </div>

            {merchants.map((m) => {
              const row = rows.get(m.merchant_key)!;
              return (
                <div
                  key={m.merchant_key}
                  className={`grid items-center gap-4 px-3 py-3 rounded-lg border-b border-gray-800/50 last:border-0 hover:bg-gray-900/60 transition-colors ${
                    showTypeToggle ? "grid-cols-[1fr_130px_120px_80px]" : "grid-cols-[1fr_130px_80px]"
                  }`}
                >
                  {/* Merchant name */}
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate" title={m.merchant_key}>
                      {m.merchant_key}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      avg {formatCurrency(m.average_amount)}
                    </p>
                  </div>

                  {/* Frequency dropdown */}
                  <select
                    disabled={!row.is_recurring}
                    value={row.frequency ?? "monthly"}
                    onChange={(e) =>
                      updateRow(m.merchant_key, {
                        frequency: e.target.value as RowState["frequency"],
                      })
                    }
                    className="bg-gray-800 text-white text-xs rounded-lg px-2 py-1.5 border border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:border-indigo-500"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                  </select>

                  {/* Type toggle — only for checking_savings */}
                  {showTypeToggle && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!row.is_recurring}
                        onClick={() =>
                          updateRow(m.merchant_key, {
                            transaction_type:
                              row.transaction_type === "income" ? "expense" : "income",
                          })
                        }
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          row.transaction_type === "income"
                            ? "bg-emerald-900/50 text-emerald-400 border border-emerald-800/50"
                            : "bg-gray-800 text-gray-400 border border-gray-700"
                        }`}
                      >
                        Income
                      </button>
                      <button
                        type="button"
                        disabled={!row.is_recurring}
                        onClick={() =>
                          updateRow(m.merchant_key, { transaction_type: "expense" })
                        }
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          row.transaction_type !== "income"
                            ? "bg-red-900/50 text-red-400 border border-red-800/50"
                            : "bg-gray-800 text-gray-400 border border-gray-700"
                        }`}
                      >
                        Expense
                      </button>
                    </div>
                  )}

                  {/* Recurring toggle */}
                  <div className="flex justify-start">
                    <Toggle
                      checked={row.is_recurring}
                      onChange={(v) => updateRow(m.merchant_key, { is_recurring: v })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-800 shrink-0 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {merchants.length} merchants · toggle on to mark as recurring
        </p>
        <button
          onClick={handleSaveAll}
          disabled={saving || loading}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {saving ? "Saving…" : "Save All"}
        </button>
      </div>

      {/* Success toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-60 bg-gray-800 border border-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-xl">
          Recurring rules saved
        </div>
      )}
    </div>
  );
}
