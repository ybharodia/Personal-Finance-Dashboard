import { getAccounts, getTransactionsByDateRange, getBudgets } from "./db";
import type { DbAccount, DbTransaction, DbBudget } from "./database.types";

const INCOME_CATEGORIES = new Set([
  "CAHEC Salary",
  "Consulting Income",
  "EB5 Interest Income",
  "Other Income",
]);

// ── Types ────────────────────────────────────────────────────────────────────

export interface AccountSummary {
  id: string;
  name: string;
  bankName: string;
  type: "checking" | "savings" | "credit";
  balance: number;
}

export interface BudgetSummary {
  category: string;
  subcategory: string;
  budgetedAmount: number;
  spent: number;
}

export interface MonthlySummary {
  month: string; // "YYYY-MM"
  totalIncome: number;
  totalExpenses: number;
  savingsRate: number; // 0–1; 0 when income is 0
  topSpendingCategories: { category: string; amount: number }[];
}

export interface RecentTransaction {
  date: string;
  merchant: string;
  category: string;
  amount: number;
  type: "income" | "expense" | "transfer";
}

export interface AdvisorBriefing {
  accounts: AccountSummary[];
  budgets: BudgetSummary[];
  monthlySummary: MonthlySummary[];
  recentTransactions: RecentTransaction[];
}

export interface AdvisorMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toYYYYMM(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Returns the ISO date string for the first day of a month offset from today. */
function monthStart(offsetMonths: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

// ── Core function ────────────────────────────────────────────────────────────

export async function buildAdvisorBriefing(): Promise<AdvisorBriefing> {
  // Fetch everything in parallel
  const from = monthStart(-6); // 6 months ago, 1st of that month
  const to = monthStart(1);    // 1st of next month (exclusive upper bound)

  const [rawAccounts, rawTransactions, rawBudgets] = await Promise.all([
    getAccounts(),
    getTransactionsByDateRange(from, to),
    getBudgets(),
  ]);

  // ── Accounts ──────────────────────────────────────────────────────────────
  const accounts: AccountSummary[] = rawAccounts.map((a: DbAccount) => ({
    id: a.id,
    name: a.custom_name ?? a.name,
    bankName: a.bank_name,
    type: a.type,
    balance: a.balance,
  }));

  // ── Budgets with actual spend ──────────────────────────────────────────────
  // Sum expenses for the current month to populate "spent"
  const now = new Date();
  const currentMonthKey = toYYYYMM(now);

  const spendBySubcategory = new Map<string, number>();
  for (const t of rawTransactions) {
    if (toYYYYMM(new Date(t.date)) !== currentMonthKey) continue;
    if (t.type !== "expense") continue;
    const key = `${t.category}::${t.subcategory}`;
    spendBySubcategory.set(key, (spendBySubcategory.get(key) ?? 0) + t.amount);
  }

  const budgets: BudgetSummary[] = rawBudgets.map((b: DbBudget) => ({
    category: b.category,
    subcategory: b.subcategory,
    budgetedAmount: b.budgeted_amount,
    spent: spendBySubcategory.get(`${b.category}::${b.subcategory}`) ?? 0,
  }));

  // ── Monthly summary ───────────────────────────────────────────────────────
  // Build a map of monthKey → transactions
  const byMonth = new Map<string, DbTransaction[]>();
  for (const t of rawTransactions) {
    const key = toYYYYMM(new Date(t.date));
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(t);
  }

  // Generate the last 6 full month keys (oldest → newest)
  const monthKeys: string[] = [];
  for (let i = -5; i <= 0; i++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + i);
    monthKeys.push(toYYYYMM(d));
  }

  const monthlySummary: MonthlySummary[] = monthKeys.map((monthKey) => {
    const txns = byMonth.get(monthKey) ?? [];

    let totalIncome = 0;
    let totalExpenses = 0;
    const categorySpend = new Map<string, number>();

    for (const t of txns) {
      if (t.type === "transfer") continue;
      if (INCOME_CATEGORIES.has(t.category)) {
        totalIncome += t.amount;
      } else {
        totalExpenses += t.amount;
        categorySpend.set(t.category, (categorySpend.get(t.category) ?? 0) + t.amount);
      }
    }

    const savingsRate = totalIncome > 0 ? (totalIncome - totalExpenses) / totalIncome : 0;

    const topSpendingCategories = Array.from(categorySpend.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    return { month: monthKey, totalIncome, totalExpenses, savingsRate, topSpendingCategories };
  });

  // ── Recent transactions ───────────────────────────────────────────────────
  const recentTransactions: RecentTransaction[] = rawTransactions
    .slice(0, 20)
    .map((t: DbTransaction) => ({
      date: t.date,
      merchant: t.description,
      category: t.subcategory || t.category,
      amount: t.amount,
      type: t.type,
    }));

  return { accounts, budgets, monthlySummary, recentTransactions };
}
