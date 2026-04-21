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
      style={{
        border: "1px solid var(--fo-hair)",
        background: "var(--fo-card)",
        color: "var(--fo-ink)",
        borderRadius: 7,
        padding: "7px 13px",
        fontSize: 12,
        fontFamily: "var(--font-fo-sans)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Download Balances
    </button>
  );
}
