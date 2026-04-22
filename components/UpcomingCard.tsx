"use client";

import { useEffect, useMemo, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type RecurringItem = {
  merchant_key: string;
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "annually" | null;
  transaction_type: "income" | "expense" | null;
  avg_amount: number;
  last_date: string | null;
  next_date: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function displayMerchant(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function cadenceLabel(freq: RecurringItem["frequency"]): string {
  switch (freq) {
    case "weekly":    return "Weekly";
    case "biweekly":  return "Bi-weekly";
    case "monthly":   return "Monthly";
    case "quarterly": return "Quarterly";
    case "annually":  return "Annually";
    default:          return "Recurring";
  }
}

function parseBadge(dateStr: string): { day: string; mon: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return {
    day: String(d),
    mon: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
  };
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UpcomingCard() {
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const [r1, r2] = await Promise.all([
          fetch("/api/recurring-display?account_type=checking_savings", { signal: controller.signal }),
          fetch("/api/recurring-display?account_type=credit_card", { signal: controller.signal }),
        ]);
        const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
        if (!r1.ok) throw new Error(d1.error ?? "Failed to load");
        if (!r2.ok) throw new Error(d2.error ?? "Failed to load");
        setItems([...(Array.isArray(d1) ? d1 : []), ...(Array.isArray(d2) ? d2 : [])]);
      } catch (err: any) {
        if (err.name !== "AbortError") setError(err.message ?? "Failed to load");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, []);

  const upcoming = useMemo(() => {
    const today = startOfDay(new Date());
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 14);

    return items
      .filter((item) => {
        if (!item.next_date) return false;
        const [y, m, d] = item.next_date.split("-").map(Number);
        const dt = new Date(y, m - 1, d);
        return dt >= today && dt <= cutoff;
      })
      .sort((a, b) => (a.next_date ?? "").localeCompare(b.next_date ?? ""))
      .slice(0, 5);
  }, [items]);

  const netAmount = useMemo(
    () =>
      upcoming.reduce((sum, item) => {
        const signed = item.transaction_type === "income" ? item.avg_amount : -item.avg_amount;
        return sum + signed;
      }, 0),
    [upcoming]
  );

  const LABEL_STYLE: React.CSSProperties = {
    fontSize: 10,
    color: "var(--fo-muted)",
    textTransform: "uppercase",
    letterSpacing: "1.3px",
    fontFamily: "var(--font-fo-sans)",
  };

  return (
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <p style={LABEL_STYLE}>Upcoming · Next 14 days</p>
        {!loading && (
          <span style={{ fontSize: 12, color: "var(--fo-faint)", fontFamily: "var(--font-fo-sans)" }}>
            {upcoming.length} scheduled
          </span>
        )}
      </div>

      {/* Net amount */}
      {!loading && !error && (
        <p
          className="num"
          style={{
            fontFamily: "var(--font-fo-serif)",
            fontSize: 26,
            fontWeight: 500,
            color: netAmount >= 0 ? "var(--fo-good)" : "var(--fo-bad)",
            marginBottom: 14,
          }}
        >
          {netAmount >= 0 ? "+" : ""}
          {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(netAmount)}
        </p>
      )}

      {/* States */}
      {loading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: "100%", height: 80, background: "var(--fo-soft)", borderRadius: 6 }} className="animate-pulse" />
        </div>
      )}

      {error && (
        <p style={{ fontSize: 12, color: "var(--fo-bad)" }}>{error}</p>
      )}

      {!loading && !error && upcoming.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--fo-muted)", fontFamily: "var(--font-fo-sans)" }}>
          Nothing scheduled in the next 14 days.
        </p>
      )}

      {/* Items list */}
      {!loading && !error && upcoming.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflowY: "auto" }}>
          {upcoming.map((item, idx) => {
            const badge = parseBadge(item.next_date!);
            const isIncome = item.transaction_type === "income";
            const signed = isIncome ? item.avg_amount : -item.avg_amount;
            return (
              <div
                key={`${item.merchant_key}-${idx}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 0",
                  borderTop: idx === 0 ? "none" : "1px solid var(--fo-hair)",
                }}
              >
                {/* Date badge */}
                <div
                  style={{
                    background: "var(--fo-soft)",
                    borderRadius: 6,
                    padding: "4px 8px",
                    textAlign: "center",
                    flexShrink: 0,
                    minWidth: 36,
                  }}
                >
                  <p
                    className="num"
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--fo-ink)",
                      fontFamily: "var(--font-fo-mono)",
                      lineHeight: 1,
                    }}
                  >
                    {badge.day}
                  </p>
                  <p
                    style={{
                      fontSize: 9,
                      color: "var(--fo-muted)",
                      textTransform: "uppercase",
                      fontFamily: "var(--font-fo-sans)",
                      marginTop: 2,
                    }}
                  >
                    {badge.mon}
                  </p>
                </div>

                {/* Merchant + cadence */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--fo-ink)",
                      fontWeight: 500,
                      fontFamily: "var(--font-fo-sans)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {displayMerchant(item.merchant_key)}
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--fo-faint)",
                      fontFamily: "var(--font-fo-sans)",
                      marginTop: 1,
                    }}
                  >
                    {cadenceLabel(item.frequency)}
                  </p>
                </div>

                {/* Type chip + amount */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span
                    style={{
                      background: "var(--fo-soft)",
                      borderRadius: 5,
                      padding: "3px 8px",
                      fontSize: 10,
                      color: "var(--fo-muted)",
                      fontFamily: "var(--font-fo-sans)",
                    }}
                  >
                    {isIncome ? "income" : "bill"}
                  </span>
                  <span
                    className="num"
                    style={{
                      fontFamily: "var(--font-fo-mono)",
                      fontSize: 13,
                      fontWeight: 500,
                      color: signed >= 0 ? "var(--fo-good)" : "var(--fo-bad)",
                    }}
                  >
                    {signed >= 0 ? "+" : ""}
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(signed)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
