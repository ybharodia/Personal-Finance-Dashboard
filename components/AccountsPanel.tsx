"use client";

import { formatCurrency } from "@/lib/data";
import type { DbAccount } from "@/lib/database.types";

type Props = {
  accounts: DbAccount[];
  selectedAccount: string | null;
  onSelect: (id: string | null) => void;
};

const BANK_ORDER = [
  "PNC Bank",
  "Chase",
  "Bank of America",
  "Capital One",
  "First National Bank",
];

function typeLabel(type: DbAccount["type"]) {
  return type === "credit" ? "Credit" : type === "savings" ? "Savings" : "Checking";
}

export default function AccountsPanel({ accounts, selectedAccount, onSelect }: Props) {
  const totalNet = accounts.reduce((sum, a) => sum + a.balance, 0);

  // Group accounts by bank in a stable order
  const groups = BANK_ORDER.map((bank) => ({
    bank,
    accounts: accounts.filter((a) => a.bank_name === bank),
  })).filter((g) => g.accounts.length > 0);

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
      {/* Net worth */}
      <div className="px-4 py-4 border-b border-gray-100">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Net Worth</p>
        <p className="text-xl font-bold text-gray-900">{formatCurrency(totalNet)}</p>
      </div>

      {/* All accounts toggle */}
      <div className="px-3 pt-3">
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
      <div className="px-3 py-2 space-y-4 flex-1">
        {groups.map(({ bank, accounts: bankAccounts }) => {
          const bankTotal = bankAccounts.reduce((s, a) => s + a.balance, 0);
          return (
            <div key={bank}>
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{bank}</span>
                <span className="text-xs text-gray-400">{formatCurrency(bankTotal)}</span>
              </div>
              <div className="space-y-0.5">
                {bankAccounts.map((acct) => (
                  <button
                    key={acct.id}
                    onClick={() => onSelect(selectedAccount === acct.id ? null : acct.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                      selectedAccount === acct.id ? "bg-indigo-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-sm font-medium ${selectedAccount === acct.id ? "text-indigo-700" : "text-gray-700"}`}>
                          {acct.name}
                        </p>
                        <p className="text-xs text-gray-400">{typeLabel(acct.type)}</p>
                      </div>
                      <span className={`text-sm font-semibold tabular-nums ${
                        acct.balance < 0 ? "text-red-500" : selectedAccount === acct.id ? "text-indigo-700" : "text-gray-700"
                      }`}>
                        {formatCurrency(acct.balance)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
