"use client";

import { useState } from "react";
import type { DbAccount } from "@/lib/database.types";
import { formatCurrency, accountDisplayName } from "@/lib/data";

// ── Sparkline ─────────────────────────────────────────────────────────────────

function sparklinePath(seed: number): string {
  const W = 48, H = 20;
  const points: number[] = [];
  let val = 10;
  for (let i = 0; i < 8; i++) {
    val += Math.sin(seed * 0.37 + i * 1.1) * 3.5;
    points.push(Math.max(2, Math.min(18, val)));
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  return points
    .map((y, i) => {
      const x = (i / (points.length - 1)) * W;
      const py = H - ((y - min) / range) * (H - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");
}

function accountSeed(acct: DbAccount): number {
  return acct.id.split("").reduce((s, c) => s + c.charCodeAt(0), 0) % 100;
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

// ── AccountMiniCard ───────────────────────────────────────────────────────────

type MiniCardProps = {
  acct: DbAccount;
  onTag: () => void;
};

function AccountMiniCard({ acct, onTag }: MiniCardProps) {
  const [hovered, setHovered] = useState(false);
  const seed = accountSeed(acct);
  const path = sparklinePath(seed);
  const isCredit = acct.account_group === "credit" || acct.account_group === "business_credit";
  // For credit cards, displayed balance sign: negative means debt
  const displayBal = isCredit && acct.balance > 0 ? -acct.balance : acct.balance;
  const lineColor = displayBal >= 0 ? "var(--fo-good)" : "var(--fo-bad)";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--fo-soft)",
        borderRadius: 8,
        padding: "12px 14px",
        position: "relative",
        cursor: "default",
      }}
    >
      {/* Edit pencil on hover */}
      {hovered && (
        <button
          onClick={onTag}
          title="Tag account"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--fo-faint)",
            padding: 2,
            display: "flex",
          }}
        >
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      )}

      {/* Top row: name + sparkline */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <span
          style={{
            fontSize: 13,
            color: "var(--fo-ink)",
            fontWeight: 500,
            fontFamily: "var(--font-fo-sans)",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {accountDisplayName(acct)}
        </span>
        <svg width="48" height="20" viewBox="0 0 48 20" fill="none" style={{ flexShrink: 0 }}>
          <path d={path} stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Bank name */}
      <p
        style={{
          fontSize: 10,
          color: "var(--fo-muted)",
          textTransform: "uppercase",
          letterSpacing: "1px",
          marginTop: 2,
          fontFamily: "var(--font-fo-sans)",
        }}
      >
        {acct.bank_name}
      </p>

      {/* Bottom row: balance */}
      <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span
          className="num"
          style={{
            fontFamily: "var(--font-fo-mono)",
            fontSize: 15,
            fontWeight: 500,
            color: displayBal < 0 ? "var(--fo-bad)" : "var(--fo-ink)",
          }}
        >
          {formatCurrency(Math.abs(displayBal))}
          {displayBal < 0 ? " owed" : ""}
        </span>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isUntagged(a: DbAccount): boolean {
  return !a.owner || !a.account_group;
}

function isCreditCard(a: DbAccount): boolean {
  return a.account_group === "credit" || a.account_group === "business_credit";
}

// ── AccountsBox ───────────────────────────────────────────────────────────────

type Props = { accounts: DbAccount[] };

export default function AccountsBox({ accounts: initialAccounts }: Props) {
  const [localAccounts, setLocalAccounts] = useState<DbAccount[]>(initialAccounts);
  const [tagging, setTagging] = useState<DbAccount | null>(null);

  function handleSaved(updated: DbAccount) {
    setLocalAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setTagging(null);
  }

  // Total net balance: assets minus credit debt
  const totalBalance = localAccounts.reduce((sum, a) => {
    return sum + (isCreditCard(a) ? -Math.abs(a.balance) : a.balance);
  }, 0);

  const sections = [
    {
      key: "untagged",
      label: "Untagged",
      accounts: localAccounts.filter(isUntagged),
    },
    {
      key: "yash",
      label: "Yash",
      accounts: localAccounts.filter((a) => !isUntagged(a) && a.owner === "yash" && !isCreditCard(a)),
    },
    {
      key: "nancy",
      label: "Nancy",
      accounts: localAccounts.filter((a) => !isUntagged(a) && a.owner === "nancy" && !isCreditCard(a)),
    },
    {
      key: "joint",
      label: "Joint",
      accounts: localAccounts.filter((a) => !isUntagged(a) && a.owner === "joint" && !isCreditCard(a)),
    },
    {
      key: "business",
      label: "Business",
      accounts: localAccounts.filter((a) => !isUntagged(a) && a.owner === "business" && !isCreditCard(a)),
    },
    {
      key: "credit",
      label: "Credit Cards",
      accounts: localAccounts.filter((a) => !isUntagged(a) && isCreditCard(a)),
    },
  ].filter((s) => s.accounts.length > 0);

  const GROUP_LABEL: React.CSSProperties = {
    fontSize: 9,
    color: "var(--fo-faint)",
    letterSpacing: "1.6px",
    textTransform: "uppercase",
    padding: "8px 0 4px",
    fontFamily: "var(--font-fo-sans)",
  };

  return (
    <>
      <div
        style={{
          background: "var(--fo-card)",
          border: "1px solid var(--fo-hair)",
          borderRadius: 10,
          padding: "20px 22px",
          height: "100%",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <p
              style={{
                fontSize: 10,
                color: "var(--fo-muted)",
                textTransform: "uppercase",
                letterSpacing: "1.3px",
                fontFamily: "var(--font-fo-sans)",
                marginBottom: 4,
              }}
            >
              Accounts
            </p>
            <p
              className="num"
              style={{
                fontFamily: "var(--font-fo-serif)",
                fontSize: 24,
                fontWeight: 500,
                color: totalBalance < 0 ? "var(--fo-bad)" : "var(--fo-ink)",
              }}
            >
              {formatCurrency(totalBalance)}
            </p>
          </div>
          <span
            style={{
              fontSize: 12,
              color: "var(--fo-faint)",
              fontFamily: "var(--font-fo-sans)",
              marginTop: 2,
            }}
          >
            {localAccounts.length} linked
          </span>
        </div>

        {/* Grouped account grids — capped height with scroll */}
        <div
          style={{
            marginTop: 14,
            overflowY: "auto",
            maxHeight: 480,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {sections.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--fo-muted)", textAlign: "center", padding: "24px 0" }}>
              No accounts found.
            </p>
          ) : (
            sections.map((section) => (
              <div key={section.key}>
                <p style={GROUP_LABEL}>{section.label}</p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  {section.accounts.map((acct) => (
                    <AccountMiniCard key={acct.id} acct={acct} onTag={() => setTagging(acct)} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {tagging && (
        <TagModal account={tagging} onClose={() => setTagging(null)} onSaved={handleSaved} />
      )}
    </>
  );
}
