"use client";

import { useState } from "react";
import type { DbAccount } from "@/lib/database.types";
import { formatCurrency, accountDisplayName } from "@/lib/data";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isUntagged(a: DbAccount): boolean {
  return !a.owner || !a.account_group;
}

function typeLabel(group: string | null): string {
  if (group === "checking") return "Checking";
  if (group === "savings") return "Savings";
  if (group === "credit") return "Credit Card";
  return "";
}


function ownerLabel(owner: string | null): string {
  if (owner === "yash") return "Yash";
  if (owner === "nancy") return "Nancy";
  if (owner === "joint") return "Joint";
  if (owner === "business") return "Business";
  return "";
}

// ── TagModal ──────────────────────────────────────────────────────────────────

type TagModalProps = {
  account: DbAccount;
  onClose: () => void;
  onSaved: (updated: DbAccount) => void;
};

function TagModal({ account, onClose, onSaved }: TagModalProps) {
  const [owner, setOwner] = useState<string>(account.owner ?? "");
  const [accountGroup, setAccountGroup] = useState<string>(account.account_group ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = owner !== "" && accountGroup !== "";

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, account_group: accountGroup }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Save failed");
      }
      onSaved({ ...account, owner, account_group: accountGroup });
    } catch (err: any) {
      setError(err.message ?? "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">{accountDisplayName(account)}</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Owner</label>
            <select
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="">Select…</option>
              <option value="yash">Yash</option>
              <option value="nancy">Nancy</option>
              <option value="joint">Joint</option>
              <option value="business">Business</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select
              value={accountGroup}
              onChange={(e) => setAccountGroup(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="">Select…</option>
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit">Credit Card</option>
              <option value="business_checking">Business Checking</option>
              <option value="business_credit">Business Credit Card</option>
              <option value="investment">Investment</option>
            </select>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="flex-1 text-xs font-semibold bg-indigo-600 text-white rounded-lg py-2 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg py-2 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AccountsBox ───────────────────────────────────────────────────────────────

type Section = {
  key: string;
  label: string;
  accounts: DbAccount[];
};

type Props = { accounts: DbAccount[] };

export default function AccountsBox({ accounts: initialAccounts }: Props) {
  const [localAccounts, setLocalAccounts] = useState<DbAccount[]>(initialAccounts);
  const [tagging, setTagging] = useState<DbAccount | null>(null);

  function handleSaved(updated: DbAccount) {
    setLocalAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setTagging(null);
  }

  const isCreditCard = (a: DbAccount) =>
    a.account_group === "credit" || a.account_group === "business_credit";

  const sections: Section[] = [
    {
      key: "untagged",
      label: "Untagged",
      accounts: localAccounts.filter(isUntagged),
    },
    {
      key: "yash",
      label: "Yash",
      accounts: localAccounts.filter(
        (a) => !isUntagged(a) && a.owner === "yash" && !isCreditCard(a)
      ),
    },
    {
      key: "nancy",
      label: "Nancy",
      accounts: localAccounts.filter(
        (a) => !isUntagged(a) && a.owner === "nancy" && !isCreditCard(a)
      ),
    },
    {
      key: "joint",
      label: "Joint",
      accounts: localAccounts.filter(
        (a) => !isUntagged(a) && a.owner === "joint" && !isCreditCard(a)
      ),
    },
    {
      key: "business",
      label: "Business",
      accounts: localAccounts.filter(
        (a) => !isUntagged(a) && a.owner === "business" && !isCreditCard(a)
      ),
    },
    {
      key: "credit",
      label: "Credit Cards",
      accounts: localAccounts.filter((a) => !isUntagged(a) && isCreditCard(a)),
    },
  ].filter((s) => s.accounts.length > 0);

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-y-auto max-h-[420px]">
        {sections.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-sm text-gray-400">No accounts found.</span>
          </div>
        ) : (
          sections.map((section, si) => (
            <div key={section.key}>
              <div className={`px-4 pt-3 pb-1 ${si > 0 ? "border-t border-gray-100" : ""}`}>
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {section.label}
                </span>
                {section.key === "untagged" && (
                  <p className="mt-1 text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
                    These accounts need to be tagged.
                  </p>
                )}
              </div>
              {section.accounts.map((acct) => {
                const label = typeLabel(acct.account_group);
                const subtitle =
                  section.key === "credit"
                    ? ownerLabel(acct.owner)
                      ? `${ownerLabel(acct.owner)} · ${acct.bank_name}`
                      : acct.bank_name
                    : label
                    ? `${label} · ${acct.bank_name}`
                    : acct.bank_name;

                return (
                  <div
                    key={acct.id}
                    className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-50 group hover:bg-gray-50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {accountDisplayName(acct)}
                        </span>
                        <button
                          onClick={() => setTagging(acct)}
                          title="Tag account"
                          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-gray-400 hover:text-indigo-500 p-0.5 rounded"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      </div>
                      <span className="text-xs text-gray-400">{subtitle}</span>
                    </div>
                    <span className={`text-sm font-semibold tabular-nums shrink-0 ${acct.balance < 0 ? "text-red-500" : "text-gray-700"}`}>
                      {formatCurrency(acct.balance)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {tagging && (
        <TagModal account={tagging} onClose={() => setTagging(null)} onSaved={handleSaved} />
      )}
    </>
  );
}
