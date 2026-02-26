"use client";

import { useState, useEffect, useRef } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/data";
import type { DbAccount } from "@/lib/database.types";

// Banks that should appear first, in this order. Any Plaid-connected
// institutions not in this list appear below in alphabetical order.
const PREFERRED_ORDER = [
  "PNC Bank",
  "Chase",
  "Bank of America",
  "Capital One",
  "First National Bank",
];

type ConnectStatus = "idle" | "fetching-token" | "syncing" | "done";

type Props = {
  accounts: DbAccount[];
  selectedAccount: string | null;
  onSelect: (id: string | null) => void;
};

function typeLabel(type: DbAccount["type"]) {
  return type === "credit" ? "Credit" : type === "savings" ? "Savings" : "Checking";
}

/** Returns the display name: custom_name if set, otherwise the original name. */
function displayName(acct: DbAccount) {
  return acct.custom_name?.trim() || acct.name;
}

// ── Plaid connect button (inner component keeps usePlaidLink unconditional) ──

type ConnectButtonProps = {
  onStatusChange: (s: ConnectStatus, err?: string) => void;
};

function ConnectButton({ onStatusChange }: ConnectButtonProps) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus]       = useState<ConnectStatus>("idle");

  const updateStatus = (s: ConnectStatus, err?: string) => {
    setStatus(s);
    onStatusChange(s, err);
  };

  // usePlaidLink must be called unconditionally — token:null means not ready yet
  const { open, ready } = usePlaidLink({
    token: linkToken,

    onSuccess: async (publicToken, metadata) => {
      updateStatus("syncing");
      try {
        // Exchange public token → access token + upsert accounts
        const exchRes = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token: publicToken,
            institution_name: metadata.institution?.name ?? "Connected Bank",
          }),
        });
        if (!exchRes.ok) {
          const body = await exchRes.json().catch(() => ({}));
          const detail = body.detail;
          const msg =
            typeof detail === "string"
              ? detail
              : detail?.error_message
              ? `${detail.error_code}: ${detail.error_message}`
              : body.error ?? "Exchange failed";
          throw new Error(msg);
        }

        // Pull transactions from Plaid into Supabase
        const syncRes = await fetch("/api/plaid/sync", { method: "POST" });
        if (!syncRes.ok) {
          const body = await syncRes.json().catch(() => ({}));
          const detail = body.detail;
          const msg =
            typeof detail === "string"
              ? detail
              : detail?.error_message
              ? `${detail.error_code}: ${detail.error_message}`
              : body.error ?? "Sync failed";
          throw new Error(msg);
        }

        updateStatus("done");

        // Re-run server components so the new accounts + transactions appear
        router.refresh();

        // Reset after a brief success flash
        setTimeout(() => updateStatus("idle"), 2000);
      } catch (err: any) {
        updateStatus("idle", err.message ?? "Connection failed. Try again.");
      } finally {
        setLinkToken(null);
      }
    },

    onExit: () => {
      setLinkToken(null);
      updateStatus("idle");
    },
  });

  // Open the Link UI as soon as the SDK has loaded the token
  useEffect(() => {
    if (ready && linkToken) open();
  }, [ready, linkToken, open]);

  const handleClick = async () => {
    updateStatus("fetching-token");
    try {
      const res  = await fetch("/api/plaid/create-link-token", { method: "POST" });
      const data = await res.json();
      if (data.error || !data.link_token) throw new Error(data.error ?? "No link token");
      setLinkToken(data.link_token); // triggers useEffect → open()
    } catch (err: any) {
      updateStatus("idle", err.message ?? "Could not initialize Plaid. Check API keys.");
    }
  };

  const isWorking = status === "fetching-token" || status === "syncing";
  const isDone    = status === "done";

  return (
    <button
      onClick={handleClick}
      disabled={isWorking || isDone}
      className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
        isDone
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : isWorking
          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
          : "bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800"
      }`}
    >
      {isDone ? (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Connected!
        </>
      ) : isWorking ? (
        <>
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          {status === "fetching-token" ? "Loading…" : "Syncing…"}
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Connect Bank Account
        </>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AccountsPanel({ accounts, selectedAccount, onSelect }: Props) {
  const router = useRouter();
  const [connectError, setConnectError] = useState<string | null>(null);
  const [renamingId, setRenamingId]     = useState<string | null>(null);
  const [renameValue, setRenameValue]   = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus the input when rename mode opens
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  function startRename(acct: DbAccount, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingId(acct.id);
    setRenameValue(acct.custom_name?.trim() || acct.name);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
  }

  async function saveRename(acctId: string) {
    setRenameSaving(true);
    try {
      const res = await fetch(`/api/accounts/${acctId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_name: renameValue.trim() || null }),
      });
      if (!res.ok) throw new Error("Save failed");
      setRenamingId(null);
      setRenameValue("");
      router.refresh();
    } catch {
      // keep editing open on error
    } finally {
      setRenameSaving(false);
    }
  }

  // Group by bank: preferred order first, then any Plaid-connected institutions
  const allBankNames = [
    ...PREFERRED_ORDER.filter((b) => accounts.some((a) => a.bank_name === b)),
    ...Array.from(
      new Set(accounts.map((a) => a.bank_name).filter((b) => !PREFERRED_ORDER.includes(b)))
    ).sort(),
  ];

  const groups = allBankNames.map((bank) => ({
    bank,
    accounts: accounts.filter((a) => a.bank_name === bank),
  }));

  return (
    <aside className="hidden md:flex w-64 shrink-0 bg-white border-r border-gray-200 flex-col">
      {/* All accounts toggle */}
      <div className="px-3 pt-3 shrink-0">
        <button
          onClick={() => onSelect(null)}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            selectedAccount === null
              ? "bg-indigo-50 text-indigo-700"
              : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          All Accounts
        </button>
      </div>

      {/* Bank groups */}
      <div className="px-3 py-2 space-y-4 flex-1 overflow-y-auto">
        {groups.map(({ bank, accounts: bankAccounts }) => {
          const bankTotal = bankAccounts.reduce((s, a) => s + a.balance, 0);
          return (
            <div key={bank}>
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 truncate max-w-[120px]">
                  {bank}
                </span>
                <span className="text-xs text-gray-400 tabular-nums">{formatCurrency(bankTotal)}</span>
              </div>
              <div className="space-y-0.5">
                {bankAccounts.map((acct) => (
                  <div key={acct.id}>
                    {renamingId === acct.id ? (
                      /* ── Inline rename input ── */
                      <div className="px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200">
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename(acct.id);
                            if (e.key === "Escape") cancelRename();
                          }}
                          className="w-full text-sm text-gray-800 bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-1.5"
                          placeholder={acct.name}
                          disabled={renameSaving}
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => saveRename(acct.id)}
                            disabled={renameSaving}
                            className="flex-1 text-xs font-semibold bg-indigo-600 text-white rounded px-2 py-1 hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {renameSaving ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={cancelRename}
                            disabled={renameSaving}
                            className="flex-1 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded px-2 py-1 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Normal account row ── */
                      <button
                        onClick={() => onSelect(selectedAccount === acct.id ? null : acct.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors group ${
                          selectedAccount === acct.id ? "bg-indigo-50" : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 min-w-0">
                              <p className={`text-sm font-medium truncate ${selectedAccount === acct.id ? "text-indigo-700" : "text-gray-700"}`}>
                                {displayName(acct)}
                              </p>
                              {/* Pencil icon — only visible on hover */}
                              <button
                                onClick={(e) => startRename(acct, e)}
                                title="Rename account"
                                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-gray-400 hover:text-indigo-500 p-0.5 rounded"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                            </div>
                            <p className="text-xs text-gray-400">{typeLabel(acct.type)}</p>
                          </div>
                          <span className={`text-sm font-semibold tabular-nums shrink-0 ${
                            acct.balance < 0 ? "text-red-500" : selectedAccount === acct.id ? "text-indigo-700" : "text-gray-700"
                          }`}>
                            {formatCurrency(acct.balance)}
                          </span>
                        </div>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Connect Bank Account footer */}
      <div className="px-3 pb-3 pt-2 border-t border-gray-100 shrink-0 space-y-1.5">
        <ConnectButton
          onStatusChange={(_, err) => setConnectError(err ?? null)}
        />
        {connectError && (
          <p className="text-xs text-red-500 text-center px-1">{connectError}</p>
        )}
      </div>
    </aside>
  );
}
