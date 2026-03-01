"use client";

import { useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import type { DbTransaction, DbBudget } from "@/lib/database.types";
import type { CategoryMeta } from "@/lib/data";

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const START_YEAR = 2023;

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

  // Expense amount map: catId → subName → [12 months of spending]
  const expenseAmtMap = useMemo(() => {
    const map = new Map<string, Map<string, number[]>>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      // Parse date as local date to avoid UTC offset shifting the month
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

  // Income section data (grouped by subcategory)
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

  // Expense sections ordered by category sort_order (from DB)
  const sections = useMemo((): Section[] => {
    return categories
      .map((cat) => {
        const expCatMap = expenseAmtMap.get(cat.id);
        const budCatMap = budgetMap.get(cat.id);

        // Collect subcategories from budgets AND transactions
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
  }, [categories, expenseAmtMap, budgetMap]);

  // Grand totals across all expense sections
  const grandMonthly = useMemo(
    () => Array.from({ length: 12 }, (_, i) => sections.reduce((s, sec) => s + sec.catMonthly[i], 0)),
    [sections]
  );
  const grandTotal = grandMonthly.reduce((a, b) => a + b, 0);
  const grandBudget = sections.reduce((s, sec) => s + sec.catBudget, 0);
  const grandAnnualBudget = grandBudget * 12;
  const grandVariance = grandAnnualBudget - grandTotal;

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

  // Standard expense data cell
  function ExpenseCell({ amount, monthIdx, bold = false }: { amount: number; monthIdx: number; bold?: boolean }) {
    const future = isFutureMonth(monthIdx);
    const current = isCurrentMonthCol(monthIdx);
    const base = `px-3 py-2 text-right tabular-nums${current ? " bg-blue-50" : ""}${bold ? " font-semibold" : ""}`;
    if (future && amount === 0) {
      return <td className={`${base} text-gray-300`}>—</td>;
    }
    return (
      <td className={`${base} text-gray-700`}>
        {amount > 0 ? fmtDollars(amount) : <span className="text-gray-300">—</span>}
      </td>
    );
  }

  // Income data cell (green text)
  function IncomeCell({ amount, monthIdx }: { amount: number; monthIdx: number }) {
    const future = isFutureMonth(monthIdx);
    const current = isCurrentMonthCol(monthIdx);
    const base = `px-3 py-2 text-right tabular-nums${current ? " bg-blue-50" : ""}`;
    if (future && amount === 0) {
      return <td className={`${base} text-gray-300`}>—</td>;
    }
    return (
      <td className={`${base} ${amount > 0 ? "text-green-600" : "text-gray-300"}`}>
        {amount > 0 ? fmtDollars(amount) : "—"}
      </td>
    );
  }

  // Section header row (dark band with sticky first cell)
  function SectionHeaderRow({ label }: { label: string }) {
    return (
      <tr>
        <td className="sticky left-0 z-10 bg-slate-800 text-white px-4 py-2.5 font-bold text-[11px] uppercase tracking-widest whitespace-nowrap">
          {label}
        </td>
        <td className="bg-slate-800" /> {/* Budget */}
        {MONTHS_SHORT.map((_, i) => (
          <td key={i} className={`${isCurrentMonthCol(i) ? "bg-slate-700" : "bg-slate-800"}`} />
        ))}
        <td className="bg-slate-800" /> {/* Annual Total */}
        <td className="bg-slate-800" /> {/* Annual Budget */}
        <td className="bg-slate-800" /> {/* Variance */}
      </tr>
    );
  }

  // Category subtotal row
  function CategoryTotalRow({ section }: { section: Section }) {
    return (
      <tr className="bg-gray-100">
        <td className="sticky left-0 z-10 bg-gray-100 px-4 py-2 pl-4 text-gray-800 font-semibold border-r border-gray-200 whitespace-nowrap text-[13px]">
          {section.name} Total
        </td>
        <td className="px-3 py-2 text-right tabular-nums font-semibold text-blue-600">
          {section.catBudget > 0 ? fmtDollars(section.catBudget) : <span className="text-gray-300">—</span>}
        </td>
        {section.catMonthly.map((amt, i) => (
          <ExpenseCell key={i} amount={amt} monthIdx={i} bold />
        ))}
        <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-800 border-l border-gray-200">
          {section.catAnnualTotal > 0 ? fmtDollars(section.catAnnualTotal) : <span className="text-gray-300">—</span>}
        </td>
        <td className="px-3 py-2 text-right tabular-nums font-semibold text-blue-600">
          {section.catAnnualBudget > 0 ? fmtDollars(section.catAnnualBudget) : <span className="text-gray-300">—</span>}
        </td>
        <td
          className={`px-3 py-2 text-right tabular-nums font-semibold ${
            section.catAnnualBudget === 0
              ? "text-gray-300"
              : section.catVariance >= 0
              ? "text-green-600"
              : "text-red-500"
          }`}
        >
          {section.catAnnualBudget === 0 ? "—" : fmtDollars(section.catVariance)}
        </td>
      </tr>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="px-6 py-5 bg-white border-b border-gray-200 shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">Income Statement</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Monthly actuals vs budget · {selectedYear}
        </p>
      </div>

      {/* Year selector */}
      <div className="px-6 py-3 bg-white border-b border-gray-100 shrink-0 flex items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Year</span>
        <div className="flex gap-1.5">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => router.push(`/table?year=${y}`)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                y === selectedYear
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable table area */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-sm" style={{ width: "max-content", minWidth: "100%" }}>
          {/* Sticky header row */}
          <thead>
            <tr className="sticky top-0 z-20">
              <th
                className="sticky left-0 z-30 bg-gray-900 text-white text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-widest whitespace-nowrap border-r border-gray-700"
                style={{ minWidth: 220 }}
              >
                Category / Subcategory
              </th>
              <th
                className="bg-gray-900 text-right px-3 py-3 font-semibold text-[11px] uppercase tracking-widest text-blue-300 whitespace-nowrap"
                style={{ minWidth: 90 }}
              >
                Budget
              </th>
              {MONTHS_SHORT.map((m, i) => (
                <th
                  key={m}
                  className={`text-right px-3 py-3 font-semibold text-[11px] uppercase tracking-widest text-white whitespace-nowrap ${
                    isCurrentMonthCol(i) ? "bg-blue-800" : "bg-gray-900"
                  }`}
                  style={{ minWidth: 80 }}
                >
                  {m}
                </th>
              ))}
              <th
                className="bg-gray-900 text-right px-3 py-3 font-semibold text-[11px] uppercase tracking-widest text-white whitespace-nowrap border-l border-gray-700"
                style={{ minWidth: 100 }}
              >
                Annual Total
              </th>
              <th
                className="bg-gray-900 text-right px-3 py-3 font-semibold text-[11px] uppercase tracking-widest text-blue-300 whitespace-nowrap"
                style={{ minWidth: 105 }}
              >
                Annual Budget
              </th>
              <th
                className="bg-gray-900 text-right px-3 py-3 font-semibold text-[11px] uppercase tracking-widest text-white whitespace-nowrap"
                style={{ minWidth: 100 }}
              >
                Variance
              </th>
            </tr>
          </thead>

          <tbody>
            {/* ── Income section ──────────────────────────────────────────────── */}
            {incomeSection && (
              <>
                <SectionHeaderRow label="Income" />

                {incomeSection.rows.map((row, ri) => (
                  <tr key={row.subName} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td
                      className={`sticky left-0 z-10 ${ri % 2 === 0 ? "bg-white" : "bg-gray-50"} px-4 py-2 pl-9 text-gray-700 border-r border-gray-100 whitespace-nowrap text-[13px]`}
                    >
                      {row.subName}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300 text-[13px]">—</td>
                    {row.monthly.map((amt, i) => (
                      <IncomeCell key={i} amount={amt} monthIdx={i} />
                    ))}
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium border-l border-gray-100 text-[13px] ${
                        row.annualTotal > 0 ? "text-green-600" : "text-gray-300"
                      }`}
                    >
                      {row.annualTotal > 0 ? fmtDollars(row.annualTotal) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300 text-[13px]">—</td>
                    <td className="px-3 py-2 text-right text-gray-300 text-[13px]">—</td>
                  </tr>
                ))}

                {/* Income total row */}
                <tr className="bg-gray-100">
                  <td className="sticky left-0 z-10 bg-gray-100 px-4 py-2 pl-4 text-gray-800 font-semibold border-r border-gray-200 whitespace-nowrap text-[13px]">
                    Income Total
                  </td>
                  <td className="px-3 py-2 text-right text-gray-300">—</td>
                  {incomeSection.sectionMonthly.map((amt, i) => (
                    <IncomeCell key={i} amount={amt} monthIdx={i} />
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-green-600 border-l border-gray-200">
                    {incomeSection.sectionTotal > 0 ? fmtDollars(incomeSection.sectionTotal) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-300">—</td>
                  <td className="px-3 py-2 text-right text-gray-300">—</td>
                </tr>
              </>
            )}

            {/* ── Expense sections ────────────────────────────────────────────── */}
            {sections.map((section) => (
              <Fragment key={section.id}>
                <SectionHeaderRow label={section.name} />

                {section.subRows.map((row, ri) => (
                  <tr key={row.subName} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td
                      className={`sticky left-0 z-10 ${
                        ri % 2 === 0 ? "bg-white" : "bg-gray-50"
                      } px-4 py-2 pl-9 text-gray-700 border-r border-gray-100 whitespace-nowrap text-[13px]`}
                    >
                      {row.subName}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-blue-600 text-[13px]">
                      {row.budget > 0 ? fmtDollars(row.budget) : <span className="text-gray-300">—</span>}
                    </td>
                    {row.monthly.map((amt, i) => (
                      <ExpenseCell key={i} amount={amt} monthIdx={i} />
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800 border-l border-gray-100 text-[13px]">
                      {row.annualTotal > 0 ? fmtDollars(row.annualTotal) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-blue-600 text-[13px]">
                      {row.annualBudget > 0 ? fmtDollars(row.annualBudget) : <span className="text-gray-300">—</span>}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium text-[13px] ${
                        row.annualBudget === 0
                          ? "text-gray-300"
                          : row.variance >= 0
                          ? "text-green-600"
                          : "text-red-500"
                      }`}
                    >
                      {row.annualBudget === 0 ? "—" : fmtDollars(row.variance)}
                    </td>
                  </tr>
                ))}

                <CategoryTotalRow section={section} />
              </Fragment>
            ))}

            {/* ── Grand total row ─────────────────────────────────────────────── */}
            <tr className="bg-gray-900 text-white">
              <td className="sticky left-0 z-10 bg-gray-900 px-4 py-3 text-white font-bold border-r border-gray-700 whitespace-nowrap">
                Grand Total
              </td>
              <td className="px-3 py-3 text-right tabular-nums font-bold text-blue-300">
                {fmtDollars(grandBudget)}
              </td>
              {grandMonthly.map((amt, i) => {
                const future = isFutureMonth(i);
                const current = isCurrentMonthCol(i);
                return (
                  <td
                    key={i}
                    className={`px-3 py-3 text-right tabular-nums font-bold ${
                      current ? "bg-blue-900" : ""
                    } ${future && amt === 0 ? "text-gray-500" : "text-white"}`}
                  >
                    {future && amt === 0 ? "—" : fmtDollars(amt)}
                  </td>
                );
              })}
              <td className="px-3 py-3 text-right tabular-nums font-bold text-white border-l border-gray-700">
                {fmtDollars(grandTotal)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums font-bold text-blue-300">
                {fmtDollars(grandAnnualBudget)}
              </td>
              <td
                className={`px-3 py-3 text-right tabular-nums font-bold ${
                  grandVariance >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {fmtDollars(grandVariance)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
