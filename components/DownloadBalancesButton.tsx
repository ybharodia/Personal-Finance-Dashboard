"use client";

import { exportToExcel } from "@/lib/exportToExcel";
import type { DbAccount } from "@/lib/database.types";

type Props = { accounts: DbAccount[] };

export default function DownloadBalancesButton({ accounts }: Props) {
  function handleClick() {
    const today = new Date().toISOString().slice(0, 10);
    const rows = accounts.map((a) => ({
      "Account Name": a.custom_name ?? a.name,
      "Account Type": a.type,
      "Current Balance": a.balance,
      "Last Updated": today,
    }));
    exportToExcel(rows, `FinanceOS_Balances_${today}`, "Balances");
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Download Balances
    </button>
  );
}
