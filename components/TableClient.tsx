"use client";

import { useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import type { DbTransaction, DbBudget } from "@/lib/database.types";
import type { CategoryMeta } from "@/lib/data";
import { exportToExcel } from "@/lib/exportToExcel";

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const START_YEAR = 2023;

const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const SANS = "'Inter', -apple-system, system-ui, sans-serif";

// ── Types ──────────────────────────────────────────────────────────────────────

type Props = {
  transactions: DbTransaction[];
  budgets: DbBudget[];
  categories: CategoryMeta[];
  selectedYear: number;
  currentYear: number;
};

type SubRow = {
  subName: string;
  budget: number;
  monthly: number[];
  annualTotal: number;
  annualBudget: number;
  variance: number;
};

type Section = {
  id: string;
  name: string;
  subRows: SubRow[];
  catBudget: number;
  catMonthly: number[];
  catAnnualTotal: number;
  catAnnualBudget: number;
  catVariance: number;
};

type IncomeSection = {
  rows: Array<{ subName: string; monthly: number[]; annualTotal: number }>;
  sectionMonthly: number[];
  sectionTotal: number;
};

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtDollars(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

// Accountant-style: negatives shown as ($1,234) in red, positives as $1,234 in green
function fmtAccounting(n: number): string {
  const abs = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(n));
  return n < 0 ? `(${abs})` : abs;
}

// Percentage with 1 decimal, parentheses for negatives
function fmtPct(n: number): string {
  const abs = Math.abs(n).toFixed(1) + "%";
  return n < 0 ? `(${abs})` : abs;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TableClient({
  transactions,
  budgets,
  categories,
  selectedYear,
  currentYear,
}: Props) {
  const router = useRouter();
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-based

  // ── Data processing ──────────────────────────────────────────────────────────

  // Collect category IDs that are exclusively income — no expense transactions.
  // A category with mixed types (e.g. refunds alongside expenses) stays in the
  // expense section; only pure income categories are excluded from it.
  const incomeCategoryIds = useMemo(() => {
    const typesByCat = new Map<string, Set<string>>();
    for (const t of transactions) {
      if (!typesByCat.has(t.category)) typesByCat.set(t.category, new Set());
      typesByCat.get(t.category)!.add(t.type);
    }
    const ids = new Set<string>();
    for (const [cat, types] of typesByCat) {
      if (types.has("income") && !types.has("expense")) ids.add(cat);
    }
    return ids;
  }, [transactions]);

  // Expense amount map: catId → subName → [12 months of spending]
  const expenseAmtMap = useMemo(() => {
    const map = new Map<string, Map<string, number[]>>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      const parts = t.date.split("-");
      const month = parseInt(parts[1], 10) - 1; // 0-indexed
      if (!map.has(t.category)) map.set(t.category, new Map());
      const catMap = map.get(t.category)!;
      if (!catMap.has(t.subcategory)) catMap.set(t.subcategory, Array(12).fill(0));
      catMap.get(t.subcategory)![month] += t.amount;
    }
    return map;
  }, [transactions]);

  // Budget map: catId → subName → monthly budgeted amount
  const budgetMap = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const b of budgets) {
      if (!map.has(b.category)) map.set(b.category, new Map());
      map.get(b.category)!.set(b.subcategory, b.budgeted_amount);
    }
    return map;
  }, [budgets]);

  // Income section data (grouped by subcategory label)
  const incomeSection = useMemo((): IncomeSection | null => {
    const incTxns = transactions.filter((t) => t.type === "income");
    if (incTxns.length === 0) return null;

    const subMap = new Map<string, number[]>();
    for (const t of incTxns) {
      const parts = t.date.split("-");
      const month = parseInt(parts[1], 10) - 1; // 0-indexed
      const key = t.subcategory || t.category;
      if (!subMap.has(key)) subMap.set(key, Array(12).fill(0));
      subMap.get(key)![month] += t.amount;
    }

    const rows = Array.from(subMap.entries()).map(([subName, monthly]) => ({
      subName,
      monthly,
      annualTotal: monthly.reduce((a, b) => a + b, 0),
    }));

    const sectionMonthly = Array.from({ length: 12 }, (_, i) =>
      rows.reduce((s, r) => s + r.monthly[i], 0)
    );

    return { rows, sectionMonthly, sectionTotal: sectionMonthly.reduce((a, b) => a + b, 0) };
  }, [transactions]);

  // Expense sections — skip any category whose ID is used for income transactions
  const sections = useMemo((): Section[] => {
    return categories
      .map((cat) => {
        // Skip income-only categories so they don't appear under expense sections
        if (incomeCategoryIds.has(cat.id)) return null;

        const expCatMap = expenseAmtMap.get(cat.id);
        const budCatMap = budgetMap.get(cat.id);

        const subNames = new Set<string>([
          ...Array.from(budCatMap?.keys() ?? []),
          ...Array.from(expCatMap?.keys() ?? []),
        ]);

        if (subNames.size === 0) return null;

        const subRows: SubRow[] = Array.from(subNames)
          .sort()
          .map((subName) => {
            const monthly = expCatMap?.get(subName) ?? Array(12).fill(0);
            const annualTotal = monthly.reduce((a: number, b: number) => a + b, 0);
            const budget = budCatMap?.get(subName) ?? 0;
            const annualBudget = budget * 12;
            const variance = annualBudget - annualTotal;
            return { subName, budget, monthly, annualTotal, annualBudget, variance };
          });

        const catMonthly = Array.from({ length: 12 }, (_, i) =>
          subRows.reduce((s, r) => s + r.monthly[i], 0)
        );
        const catAnnualTotal = catMonthly.reduce((a, b) => a + b, 0);
        const catBudget = subRows.reduce((s, r) => s + r.budget, 0);
        const catAnnualBudget = catBudget * 12;
        const catVariance = catAnnualBudget - catAnnualTotal;

        return {
          id: cat.id,
          name: cat.name,
          subRows,
          catBudget,
          catMonthly,
          catAnnualTotal,
          catAnnualBudget,
          catVariance,
        };
      })
      .filter(Boolean) as Section[];
  }, [categories, incomeCategoryIds, expenseAmtMap, budgetMap]);

  // Grand totals across all expense sections
  const grandMonthly = useMemo(
    () => Array.from({ length: 12 }, (_, i) => sections.reduce((s, sec) => s + sec.catMonthly[i], 0)),
    [sections]
  );
  const grandTotal = grandMonthly.reduce((a, b) => a + b, 0);
  const grandBudget = sections.reduce((s, sec) => s + sec.catBudget, 0);
  const grandAnnualBudget = grandBudget * 12;
  const grandVariance = grandAnnualBudget - grandTotal;

  // Net Position: income minus expenses per month
  const netMonthly = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) =>
        (incomeSection?.sectionMonthly[i] ?? 0) - grandMonthly[i]
      ),
    [incomeSection, grandMonthly]
  );
  const annualNet = netMonthly.reduce((a, b) => a + b, 0);

  // Savings rate per month: net / income × 100 (null when no income)
  const savingsRateMonthly = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const income = incomeSection?.sectionMonthly[i] ?? 0;
        if (income === 0) return null;
        return (netMonthly[i] / income) * 100;
      }),
    [incomeSection, netMonthly]
  );
  const annualSavingsRate = useMemo(() => {
    const totalIncome = incomeSection?.sectionTotal ?? 0;
    if (totalIncome === 0) return null;
    return (annualNet / totalIncome) * 100;
  }, [incomeSection, annualNet]);

  // ── Column helpers ──────────────────────────────────────────────────────────

  function isFutureMonth(monthIdx: number): boolean {
    if (selectedYear < currentYear) return false;
    if (selectedYear > currentYear) return true;
    return monthIdx + 1 > currentMonth;
  }

  function isCurrentMonthCol(monthIdx: number): boolean {
    return selectedYear === currentYear && monthIdx + 1 === currentMonth;
  }

  // ── Year selector ────────────────────────────────────────────────────────────

  const years = Array.from({ length: currentYear - START_YEAR + 1 }, (_, i) => START_YEAR + i);

  // ── Cell renderers ───────────────────────────────────────────────────────────

  function ExpenseCell({
    amount,
    monthIdx,
    bold = false,
    rowBg = "transparent",
  }: {
    amount: number;
    monthIdx: number;
    bold?: boolean;
    rowBg?: string;
  }) {
    const future = isFutureMonth(monthIdx);
    const current = isCurrentMonthCol(monthIdx);
    const cellStyle: React.CSSProperties = {
      background: current ? "oklch(0.97 0.02 35)" : rowBg,
      textAlign: "right",
      fontFamily: MONO,
      fontVariantNumeric: "tabular-nums",
      fontSize: 11.5,
      padding: bold ? "10px 8px" : "8px 8px",
      fontWeight: bold ? 700 : 400,
      borderBottom: "1px solid #ebe5dc",
      ...(bold ? { borderTop: "1px solid #ebe5dc" } : {}),
    };
    if (future && amount === 0) {
      return <td style={{ ...cellStyle, color: "#a39a8f" }}>—</td>;
    }
    return (
      <td style={{ ...cellStyle, color: amount > 0 ? "#1a1715" : "#a39a8f" }}>
        {amount > 0 ? fmtDollars(amount) : "—"}
      </td>
    );
  }

  function IncomeCell({
    amount,
    monthIdx,
    bold = false,
    rowBg = "transparent",
  }: {
    amount: number;
    monthIdx: number;
    bold?: boolean;
    rowBg?: string;
  }) {
    const future = isFutureMonth(monthIdx);
    const current = isCurrentMonthCol(monthIdx);
    const cellStyle: React.CSSProperties = {
      background: current ? "oklch(0.97 0.02 35)" : rowBg,
      textAlign: "right",
      fontFamily: MONO,
      fontVariantNumeric: "tabular-nums",
      fontSize: 11.5,
      padding: bold ? "10px 8px" : "8px 8px",
      fontWeight: bold ? 700 : 400,
      borderBottom: "1px solid #ebe5dc",
      ...(bold ? { borderTop: "1px solid #ebe5dc" } : {}),
    };
    if (future && amount === 0) {
      return <td style={{ ...cellStyle, color: "#a39a8f" }}>—</td>;
    }
    return (
      <td style={{ ...cellStyle, color: amount > 0 ? "oklch(0.52 0.09 150)" : "#a39a8f" }}>
        {amount > 0 ? fmtDollars(amount) : "—"}
      </td>
    );
  }

  // Section header row — first cell is sticky so the label stays pinned when scrolling right.
  function SectionHeaderRow({ label, isIncome = false }: { label: string; isIncome?: boolean }) {
    const bgColor = isIncome ? "oklch(0.95 0.04 150)" : "#f3efe7";
    const textColor = isIncome ? "oklch(0.52 0.09 150)" : "#1a1715";
    const borderStyle = "1px solid #ebe5dc";
    return (
      <tr>
        <td
          className="sticky left-0 z-10 whitespace-nowrap"
          style={{
            background: bgColor,
            color: textColor,
            fontSize: 11,
            letterSpacing: "1.4px",
            textTransform: "uppercase",
            fontWeight: 700,
            padding: "10px 12px",
            borderTop: borderStyle,
            borderBottom: borderStyle,
            fontFamily: SANS,
          }}
        >
          {label}
        </td>
        <td style={{ background: bgColor, borderTop: borderStyle, borderBottom: borderStyle }} />
        {MONTHS_SHORT.map((_, i) => (
          <td
            key={i}
            style={{
              background: isCurrentMonthCol(i) ? "oklch(0.97 0.02 35)" : bgColor,
              borderTop: borderStyle,
              borderBottom: borderStyle,
            }}
          />
        ))}
        <td style={{ background: bgColor, borderTop: borderStyle, borderBottom: borderStyle }} />
        <td style={{ background: bgColor, borderTop: borderStyle, borderBottom: borderStyle }} />
        <td style={{ background: bgColor, borderTop: borderStyle, borderBottom: borderStyle }} />
      </tr>
    );
  }

  function CategoryTotalRow({ section }: { section: Section }) {
    const borderStyle = "1px solid #ebe5dc";
    return (
      <tr>
        <td
          className="sticky left-0 z-10 whitespace-nowrap"
          style={{
            background: "#ffffff",
            color: "#1a1715",
            fontSize: 11.5,
            padding: "10px 12px",
            fontFamily: SANS,
            fontWeight: 700,
            borderTop: borderStyle,
            borderBottom: borderStyle,
          }}
        >
          {section.name} Total
        </td>
        <td
          style={{
            color: section.catBudget > 0 ? "#6b635b" : "#a39a8f",
            textAlign: "right",
            fontFamily: MONO,
            fontVariantNumeric: "tabular-nums",
            fontSize: 11.5,
            padding: "10px 8px",
            fontWeight: 700,
            background: "#ffffff",
            borderTop: borderStyle,
            borderBottom: borderStyle,
          }}
        >
          {section.catBudget > 0 ? fmtDollars(section.catBudget) : "—"}
        </td>
        {section.catMonthly.map((amt, i) => (
          <ExpenseCell key={i} amount={amt} monthIdx={i} bold rowBg="#ffffff" />
        ))}
        <td
          style={{
            textAlign: "right",
            fontFamily: MONO,
            fontVariantNumeric: "tabular-nums",
            fontSize: 11.5,
            padding: "10px 8px",
            fontWeight: 700,
            color: section.catAnnualTotal > 0 ? "#1a1715" : "#a39a8f",
            background: "#ffffff",
            borderTop: borderStyle,
            borderBottom: borderStyle,
            borderLeft: borderStyle,
          }}
        >
          {section.catAnnualTotal > 0 ? fmtDollars(section.catAnnualTotal) : "—"}
        </td>
        <td
          style={{
            color: section.catAnnualBudget > 0 ? "#6b635b" : "#a39a8f",
            textAlign: "right",
            fontFamily: MONO,
            fontVariantNumeric: "tabular-nums",
            fontSize: 11.5,
            padding: "10px 8px",
            fontWeight: 700,
            background: "#ffffff",
            borderTop: borderStyle,
            borderBottom: borderStyle,
          }}
        >
          {section.catAnnualBudget > 0 ? fmtDollars(section.catAnnualBudget) : "—"}
        </td>
        <td
          style={{
            textAlign: "right",
            fontFamily: MONO,
            fontVariantNumeric: "tabular-nums",
            fontSize: 11.5,
            padding: "10px 8px",
            fontWeight: 700,
            color:
              section.catAnnualBudget === 0
                ? "#a39a8f"
                : section.catVariance >= 0
                ? "oklch(0.52 0.09 150)"
                : "oklch(0.52 0.13 25)",
            background: "#ffffff",
            borderTop: borderStyle,
            borderBottom: borderStyle,
          }}
        >
          {section.catAnnualBudget === 0 ? "—" : fmtDollars(section.catVariance)}
        </td>
      </tr>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: "#faf8f4", fontFamily: SANS }}
    >
      {/* Page header */}
      <div
        className="px-6 py-5 shrink-0 flex items-center justify-between"
        style={{ background: "#ffffff", borderBottom: "1px solid #ebe5dc" }}
      >
        <div>
          <h1
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: 26,
              fontWeight: 500,
              letterSpacing: "-0.5px",
              color: "#1a1715",
              margin: 0,
            }}
          >
            Income Statement
          </h1>
          <p style={{ fontSize: 11.5, color: "#6b635b", marginTop: 4, marginBottom: 0 }}>
            Monthly actuals vs budget · {selectedYear}
          </p>
        </div>
        <button
          onClick={() => {
            const rows: Record<string, unknown>[] = [];
            if (incomeSection) {
              for (const r of incomeSection.rows) {
                const row: Record<string, unknown> = { Category: "Income", Subcategory: r.subName };
                MONTHS_SHORT.forEach((m, i) => { row[m] = r.monthly[i] ?? 0; });
                row["Annual Total"] = r.annualTotal;
                rows.push(row);
              }
            }
            for (const sec of sections) {
              for (const sub of sec.subRows) {
                const row: Record<string, unknown> = { Category: sec.name, Subcategory: sub.subName };
                MONTHS_SHORT.forEach((m, i) => { row[m] = sub.monthly[i] ?? 0; });
                row["Annual Total"] = sub.annualTotal;
                rows.push(row);
              }
            }
            exportToExcel(rows, "income-statement", "Income Statement");
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid #ebe5dc",
            background: "#ffffff",
            color: "#1a1715",
            padding: "8px 13px",
            borderRadius: 7,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          </svg>
          Download Excel
        </button>
      </div>

      {/* Year selector */}
      <div
        className="px-6 py-3 shrink-0 flex items-center gap-3"
        style={{ background: "#faf8f4", borderBottom: "1px solid #ebe5dc" }}
      >
        <span
          style={{
            fontSize: 10,
            letterSpacing: "1.4px",
            textTransform: "uppercase",
            color: "#6b635b",
            fontWeight: 600,
          }}
        >
          Year
        </span>
        <div
          style={{
            background: "#f3efe7",
            padding: 3,
            borderRadius: 16,
            display: "inline-flex",
            gap: 4,
          }}
        >
          {years.map((y) => (
            <button
              key={y}
              onClick={() => router.push(`/table?year=${y}`)}
              style={
                y === selectedYear
                  ? {
                      background: "oklch(0.45 0.12 35)",
                      color: "#ffffff",
                      border: "none",
                      padding: "4px 12px",
                      borderRadius: 12,
                      fontFamily: MONO,
                      fontWeight: 600,
                      fontSize: 11.5,
                      cursor: "pointer",
                    }
                  : {
                      background: "transparent",
                      color: "#6b635b",
                      border: "none",
                      padding: "4px 12px",
                      borderRadius: 12,
                      fontFamily: MONO,
                      fontWeight: 450,
                      fontSize: 11.5,
                      cursor: "pointer",
                    }
              }
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable table */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-sm" style={{ width: "max-content", minWidth: "100%" }}>
          {/* Sticky column-width hints */}
          <colgroup>
            <col style={{ minWidth: 220 }} />
            <col style={{ minWidth: 90 }} />
            {MONTHS_SHORT.map((m) => <col key={m} style={{ minWidth: 80 }} />)}
            <col style={{ minWidth: 100 }} />
            <col style={{ minWidth: 105 }} />
            <col style={{ minWidth: 100 }} />
          </colgroup>

          {/* Sticky header */}
          <thead>
            <tr className="sticky top-0 z-20">
              <th
                className="sticky left-0 z-30 whitespace-nowrap"
                style={{
                  background: "#1a1715",
                  color: "#6b635b",
                  textAlign: "left",
                  padding: "12px 16px",
                  fontFamily: SANS,
                  fontWeight: 600,
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "1.4px",
                  borderRight: "1px solid #2d2925",
                }}
              >
                Category / Subcategory
              </th>
              <th
                style={{
                  background: "#1a1715",
                  color: "oklch(0.45 0.12 35)",
                  textAlign: "right",
                  padding: "12px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "1.4px",
                  whiteSpace: "nowrap",
                }}
              >
                Budget
              </th>
              {MONTHS_SHORT.map((m, i) => (
                <th
                  key={m}
                  style={{
                    background: isCurrentMonthCol(i) ? "oklch(0.97 0.02 35)" : "#1a1715",
                    color: isCurrentMonthCol(i) ? "oklch(0.45 0.12 35)" : "#a39a8f",
                    textAlign: "right",
                    padding: "12px 8px",
                    fontSize: 10,
                    fontWeight: isCurrentMonthCol(i) ? 700 : 600,
                    textTransform: "uppercase",
                    letterSpacing: "1.4px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m}
                </th>
              ))}
              <th
                style={{
                  background: "#1a1715",
                  color: "#a39a8f",
                  textAlign: "right",
                  padding: "12px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "1.4px",
                  whiteSpace: "nowrap",
                  borderLeft: "1px solid #2d2925",
                }}
              >
                Annual Total
              </th>
              <th
                style={{
                  background: "#1a1715",
                  color: "oklch(0.45 0.12 35)",
                  textAlign: "right",
                  padding: "12px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "1.4px",
                  whiteSpace: "nowrap",
                }}
              >
                Annual Budget
              </th>
              <th
                style={{
                  background: "#1a1715",
                  color: "oklch(0.45 0.12 35)",
                  textAlign: "right",
                  padding: "12px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "1.4px",
                  whiteSpace: "nowrap",
                }}
              >
                Variance
              </th>
            </tr>
          </thead>

          <tbody>
            {/* ── 1. INCOME ─────────────────────────────────────────────────── */}
            {incomeSection && (
              <>
                <SectionHeaderRow label="Income" isIncome />

                {incomeSection.rows.map((row, ri) => {
                  const evenRow = ri % 2 === 0;
                  const rowBg = evenRow ? "transparent" : "#f3efe7";
                  const stickyBg = evenRow ? "#faf8f4" : "#f3efe7";
                  return (
                    <tr key={row.subName}>
                      <td
                        className="sticky left-0 z-10 whitespace-nowrap"
                        style={{
                          background: stickyBg,
                          color: "#1a1715",
                          fontSize: 11.5,
                          padding: "8px 12px 8px 36px",
                          fontFamily: SANS,
                          borderBottom: "1px solid #ebe5dc",
                        }}
                      >
                        {row.subName}
                      </td>
                      <td
                        style={{
                          color: "#a39a8f",
                          textAlign: "right",
                          padding: "8px 8px",
                          fontSize: 11.5,
                          borderBottom: "1px solid #ebe5dc",
                          background: rowBg,
                        }}
                      >
                        —
                      </td>
                      {row.monthly.map((amt, i) => (
                        <IncomeCell key={i} amount={amt} monthIdx={i} rowBg={rowBg} />
                      ))}
                      <td
                        style={{
                          textAlign: "right",
                          fontFamily: MONO,
                          fontVariantNumeric: "tabular-nums",
                          fontSize: 11.5,
                          padding: "8px 8px",
                          fontWeight: 600,
                          color: row.annualTotal > 0 ? "oklch(0.52 0.09 150)" : "#a39a8f",
                          borderBottom: "1px solid #ebe5dc",
                          borderLeft: "1px solid #ebe5dc",
                          background: rowBg,
                        }}
                      >
                        {row.annualTotal > 0 ? fmtDollars(row.annualTotal) : "—"}
                      </td>
                      <td
                        style={{
                          color: "#a39a8f",
                          textAlign: "right",
                          padding: "8px 8px",
                          fontSize: 11.5,
                          borderBottom: "1px solid #ebe5dc",
                          background: rowBg,
                        }}
                      >
                        —
                      </td>
                      <td
                        style={{
                          color: "#a39a8f",
                          textAlign: "right",
                          padding: "8px 8px",
                          fontSize: 11.5,
                          borderBottom: "1px solid #ebe5dc",
                          background: rowBg,
                        }}
                      >
                        —
                      </td>
                    </tr>
                  );
                })}

                {/* Income Total */}
                <tr>
                  <td
                    className="sticky left-0 z-10 whitespace-nowrap"
                    style={{
                      background: "#ffffff",
                      color: "#1a1715",
                      fontSize: 11.5,
                      padding: "10px 12px",
                      fontFamily: SANS,
                      fontWeight: 700,
                      borderTop: "1px solid #ebe5dc",
                      borderBottom: "1px solid #ebe5dc",
                    }}
                  >
                    Income Total
                  </td>
                  <td
                    style={{
                      color: "#a39a8f",
                      textAlign: "right",
                      padding: "10px 8px",
                      fontSize: 11.5,
                      fontFamily: MONO,
                      background: "#ffffff",
                      borderTop: "1px solid #ebe5dc",
                      borderBottom: "1px solid #ebe5dc",
                    }}
                  >
                    —
                  </td>
                  {incomeSection.sectionMonthly.map((amt, i) => (
                    <IncomeCell key={i} amount={amt} monthIdx={i} bold rowBg="#ffffff" />
                  ))}
                  <td
                    style={{
                      textAlign: "right",
                      fontFamily: MONO,
                      fontVariantNumeric: "tabular-nums",
                      fontSize: 11.5,
                      padding: "10px 8px",
                      fontWeight: 700,
                      color: "oklch(0.52 0.09 150)",
                      background: "#ffffff",
                      borderTop: "1px solid #ebe5dc",
                      borderBottom: "1px solid #ebe5dc",
                      borderLeft: "1px solid #ebe5dc",
                    }}
                  >
                    {incomeSection.sectionTotal > 0 ? fmtDollars(incomeSection.sectionTotal) : "—"}
                  </td>
                  <td
                    style={{
                      color: "#a39a8f",
                      textAlign: "right",
                      padding: "10px 8px",
                      fontSize: 11.5,
                      fontFamily: MONO,
                      background: "#ffffff",
                      borderTop: "1px solid #ebe5dc",
                      borderBottom: "1px solid #ebe5dc",
                    }}
                  >
                    —
                  </td>
                  <td
                    style={{
                      color: "#a39a8f",
                      textAlign: "right",
                      padding: "10px 8px",
                      fontSize: 11.5,
                      fontFamily: MONO,
                      background: "#ffffff",
                      borderTop: "1px solid #ebe5dc",
                      borderBottom: "1px solid #ebe5dc",
                    }}
                  >
                    —
                  </td>
                </tr>
              </>
            )}

            {/* ── 2–10. EXPENSE CATEGORIES ──────────────────────────────────── */}
            {sections.map((section) => (
              <Fragment key={section.id}>
                <SectionHeaderRow label={section.name} />

                {section.subRows.map((row, ri) => {
                  const evenRow = ri % 2 === 0;
                  const rowBg = evenRow ? "transparent" : "#f3efe7";
                  const stickyBg = evenRow ? "#faf8f4" : "#f3efe7";
                  return (
                    <tr key={row.subName}>
                      <td
                        className="sticky left-0 z-10 whitespace-nowrap"
                        style={{
                          background: stickyBg,
                          color: "#1a1715",
                          fontSize: 11.5,
                          padding: "8px 12px 8px 36px",
                          fontFamily: SANS,
                          borderBottom: "1px solid #ebe5dc",
                        }}
                      >
                        {row.subName}
                      </td>
                      <td
                        style={{
                          color: row.budget > 0 ? "#6b635b" : "#a39a8f",
                          textAlign: "right",
                          fontFamily: MONO,
                          fontVariantNumeric: "tabular-nums",
                          fontSize: 11.5,
                          padding: "8px 8px",
                          borderBottom: "1px solid #ebe5dc",
                          background: rowBg,
                        }}
                      >
                        {row.budget > 0 ? fmtDollars(row.budget) : "—"}
                      </td>
                      {row.monthly.map((amt, i) => (
                        <ExpenseCell key={i} amount={amt} monthIdx={i} rowBg={rowBg} />
                      ))}
                      <td
                        style={{
                          textAlign: "right",
                          fontFamily: MONO,
                          fontVariantNumeric: "tabular-nums",
                          fontSize: 11.5,
                          padding: "8px 8px",
                          fontWeight: 600,
                          color: row.annualTotal > 0 ? "#1a1715" : "#a39a8f",
                          borderBottom: "1px solid #ebe5dc",
                          borderLeft: "1px solid #ebe5dc",
                          background: rowBg,
                        }}
                      >
                        {row.annualTotal > 0 ? fmtDollars(row.annualTotal) : "—"}
                      </td>
                      <td
                        style={{
                          color: row.annualBudget > 0 ? "#6b635b" : "#a39a8f",
                          textAlign: "right",
                          fontFamily: MONO,
                          fontVariantNumeric: "tabular-nums",
                          fontSize: 11.5,
                          padding: "8px 8px",
                          borderBottom: "1px solid #ebe5dc",
                          background: rowBg,
                        }}
                      >
                        {row.annualBudget > 0 ? fmtDollars(row.annualBudget) : "—"}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontFamily: MONO,
                          fontVariantNumeric: "tabular-nums",
                          fontSize: 11.5,
                          padding: "8px 8px",
                          fontWeight: 600,
                          color:
                            row.annualBudget === 0
                              ? "#a39a8f"
                              : row.variance >= 0
                              ? "oklch(0.52 0.09 150)"
                              : "oklch(0.52 0.13 25)",
                          borderBottom: "1px solid #ebe5dc",
                          background: rowBg,
                        }}
                      >
                        {row.annualBudget === 0 ? "—" : fmtDollars(row.variance)}
                      </td>
                    </tr>
                  );
                })}

                <CategoryTotalRow section={section} />
              </Fragment>
            ))}

            {/* ── 11. GRAND TOTAL ───────────────────────────────────────────── */}
            <tr>
              <td
                className="sticky left-0 z-10 whitespace-nowrap"
                style={{
                  background: "#1a1715",
                  color: "#ffffff",
                  fontSize: 12,
                  fontFamily: SANS,
                  fontWeight: 700,
                  padding: "12px 16px",
                  borderRight: "1px solid #2d2925",
                }}
              >
                Grand Total
              </td>
              <td
                style={{
                  background: "#1a1715",
                  color: "oklch(0.93 0.04 35)",
                  textAlign: "right",
                  fontFamily: MONO,
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 11.5,
                  padding: "12px 8px",
                  fontWeight: 700,
                }}
              >
                {fmtDollars(grandBudget)}
              </td>
              {grandMonthly.map((amt, i) => {
                const future = isFutureMonth(i);
                const current = isCurrentMonthCol(i);
                return (
                  <td
                    key={i}
                    style={{
                      background: current ? "oklch(0.45 0.12 35)" : "#1a1715",
                      color: future && amt === 0 ? "#6b635b" : "#ffffff",
                      textAlign: "right",
                      fontFamily: MONO,
                      fontVariantNumeric: "tabular-nums",
                      fontSize: 11.5,
                      padding: "12px 8px",
                      fontWeight: 700,
                    }}
                  >
                    {future && amt === 0 ? "—" : fmtDollars(amt)}
                  </td>
                );
              })}
              <td
                style={{
                  background: "#1a1715",
                  color: "#ffffff",
                  textAlign: "right",
                  fontFamily: MONO,
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 11.5,
                  padding: "12px 8px",
                  fontWeight: 700,
                  borderLeft: "1px solid #2d2925",
                }}
              >
                {fmtDollars(grandTotal)}
              </td>
              <td
                style={{
                  background: "#1a1715",
                  color: "oklch(0.93 0.04 35)",
                  textAlign: "right",
                  fontFamily: MONO,
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 11.5,
                  padding: "12px 8px",
                  fontWeight: 700,
                }}
              >
                {fmtDollars(grandAnnualBudget)}
              </td>
              <td
                style={{
                  background: "#1a1715",
                  color: grandVariance >= 0 ? "oklch(0.52 0.09 150)" : "oklch(0.52 0.13 25)",
                  textAlign: "right",
                  fontFamily: MONO,
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 11.5,
                  padding: "12px 8px",
                  fontWeight: 700,
                }}
              >
                {fmtDollars(grandVariance)}
              </td>
            </tr>

            {/* ── 12. NET POSITION ──────────────────────────────────────────── */}
            <SectionHeaderRow label="Net Position" />

            {/* Row 1: Net Surplus / (Deficit) */}
            <tr>
              <td
                className="sticky left-0 z-10 whitespace-nowrap"
                style={{
                  background: "#ffffff",
                  color: "#1a1715",
                  fontSize: 11.5,
                  fontFamily: SANS,
                  fontWeight: 700,
                  padding: "10px 12px",
                  borderTop: "1px solid #ebe5dc",
                  borderBottom: "1px solid #ebe5dc",
                }}
              >
                Net Surplus / (Deficit)
              </td>
              <td
                style={{
                  color: "#a39a8f",
                  textAlign: "right",
                  padding: "10px 8px",
                  fontSize: 11.5,
                  fontFamily: MONO,
                  background: "#ffffff",
                  borderTop: "1px solid #ebe5dc",
                  borderBottom: "1px solid #ebe5dc",
                }}
              >
                —
              </td>
              {netMonthly.map((net, i) => {
                const incomeAmt = incomeSection?.sectionMonthly[i] ?? 0;
                const expenseAmt = grandMonthly[i];
                const blank = isFutureMonth(i) && incomeAmt === 0 && expenseAmt === 0;
                const current = isCurrentMonthCol(i);
                return (
                  <td
                    key={i}
                    style={{
                      background: current ? "oklch(0.97 0.02 35)" : "#ffffff",
                      color: blank ? "#a39a8f" : net >= 0 ? "oklch(0.52 0.09 150)" : "oklch(0.52 0.13 25)",
                      textAlign: "right",
                      fontFamily: MONO,
                      fontVariantNumeric: "tabular-nums",
                      fontSize: 11.5,
                      padding: "10px 8px",
                      fontWeight: 700,
                      borderTop: "1px solid #ebe5dc",
                      borderBottom: "1px solid #ebe5dc",
                    }}
                  >
                    {blank ? "—" : fmtAccounting(net)}
                  </td>
                );
              })}
              <td
                style={{
                  textAlign: "right",
                  fontFamily: MONO,
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 11.5,
                  padding: "10px 8px",
                  fontWeight: 700,
                  color: annualNet >= 0 ? "oklch(0.52 0.09 150)" : "oklch(0.52 0.13 25)",
                  background: "#ffffff",
                  borderTop: "1px solid #ebe5dc",
                  borderBottom: "1px solid #ebe5dc",
                  borderLeft: "1px solid #ebe5dc",
                }}
              >
                {fmtAccounting(annualNet)}
              </td>
              <td
                style={{
                  color: "#a39a8f",
                  textAlign: "right",
                  padding: "10px 8px",
                  fontSize: 11.5,
                  fontFamily: MONO,
                  background: "#ffffff",
                  borderTop: "1px solid #ebe5dc",
                  borderBottom: "1px solid #ebe5dc",
                }}
              >
                —
              </td>
              <td
                style={{
                  textAlign: "right",
                  fontFamily: MONO,
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 11.5,
                  padding: "10px 8px",
                  fontWeight: 700,
                  color: annualNet >= 0 ? "oklch(0.52 0.09 150)" : "oklch(0.52 0.13 25)",
                  background: "#ffffff",
                  borderTop: "1px solid #ebe5dc",
                  borderBottom: "1px solid #ebe5dc",
                }}
              >
                {fmtAccounting(annualNet)}
              </td>
            </tr>

            {/* Row 2: Savings Rate */}
            <tr>
              <td
                className="sticky left-0 z-10 whitespace-nowrap"
                style={{
                  background: "#ffffff",
                  color: "#1a1715",
                  fontSize: 11.5,
                  fontFamily: SANS,
                  fontWeight: 700,
                  padding: "10px 12px",
                  borderTop: "1px solid #ebe5dc",
                  borderBottom: "1px solid #ebe5dc",
                }}
              >
                Savings Rate
              </td>
              <td
                style={{
                  color: "#a39a8f",
                  textAlign: "right",
                  padding: "10px 8px",
                  fontSize: 11.5,
                  fontFamily: MONO,
                  background: "#ffffff",
                  borderTop: "1px solid #ebe5dc",
                  borderBottom: "1px solid #ebe5dc",
                }}
              >
                —
              </td>
              {savingsRateMonthly.map((rate, i) => {
                const current = isCurrentMonthCol(i);
                return (
                  <td
                    key={i}
                    style={{
                      background: current ? "oklch(0.97 0.02 35)" : "#ffffff",
                      color:
                        rate === null
                          ? "#a39a8f"
                          : rate >= 0
                          ? "oklch(0.52 0.09 150)"
                          : "oklch(0.52 0.13 25)",
                      textAlign: "right",
                      fontFamily: MONO,
                      fontVariantNumeric: "tabular-nums",
                      fontSize: 11.5,
                      padding: "10px 8px",
                      fontWeight: 700,
                      borderTop: "1px solid #ebe5dc",
                      borderBottom: "1px solid #ebe5dc",
                    }}
                  >
                    {rate === null ? "—" : fmtPct(rate)}
                  </td>
                );
              })}
              <td
                style={{
                  textAlign: "right",
                  fontFamily: MONO,
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 11.5,
                  padding: "10px 8px",
                  fontWeight: 700,
                  color:
                    annualSavingsRate === null
                      ? "#a39a8f"
                      : annualSavingsRate >= 0
                      ? "oklch(0.52 0.09 150)"
                      : "oklch(0.52 0.13 25)",
                  background: "#ffffff",
                  borderTop: "1px solid #ebe5dc",
                  borderBottom: "1px solid #ebe5dc",
                  borderLeft: "1px solid #ebe5dc",
                }}
              >
                {annualSavingsRate === null ? "—" : fmtPct(annualSavingsRate)}
              </td>
              <td
                style={{
                  color: "#a39a8f",
                  textAlign: "right",
                  padding: "10px 8px",
                  fontSize: 11.5,
                  fontFamily: MONO,
                  background: "#ffffff",
                  borderTop: "1px solid #ebe5dc",
                  borderBottom: "1px solid #ebe5dc",
                }}
              >
                —
              </td>
              <td
                style={{
                  textAlign: "right",
                  fontFamily: MONO,
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 11.5,
                  padding: "10px 8px",
                  fontWeight: 700,
                  color:
                    annualSavingsRate === null
                      ? "#a39a8f"
                      : annualSavingsRate >= 0
                      ? "oklch(0.52 0.09 150)"
                      : "oklch(0.52 0.13 25)",
                  background: "#ffffff",
                  borderTop: "1px solid #ebe5dc",
                  borderBottom: "1px solid #ebe5dc",
                }}
              >
                {annualSavingsRate === null ? "—" : fmtPct(annualSavingsRate)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
