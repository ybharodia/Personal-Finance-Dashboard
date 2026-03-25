// Static category metadata — not stored in the database.
// Budget amounts, spent amounts, and transactions all come from Supabase.

export type CategoryMeta = {
  id: string;
  name: string;
  color: string;
};

export const BUDGET_CATEGORIES: CategoryMeta[] = [
  { id: "housing", name: "Housing", color: "#6366f1" },
  { id: "transportation", name: "Transportation", color: "#f59e0b" },
  { id: "food", name: "Food & Groceries", color: "#10b981" },
  { id: "insurance", name: "Insurance", color: "#3b82f6" },
  { id: "personal", name: "Personal & Lifestyle", color: "#ec4899" },
  { id: "discretionary", name: "Discretionary / Variable", color: "#8b5cf6" },
  { id: "jash", name: "Jash Support", color: "#f97316" },
  { id: "business", name: "Business Expense", color: "#06b6d4" },
  { id: "savings", name: "Savings & Investments", color: "#84cc16" },
];

export function getCategoryMeta(id: string, from?: CategoryMeta[]): CategoryMeta | undefined {
  return (from ?? BUDGET_CATEGORIES).find((c) => c.id === id);
}

export function accountDisplayName(acct: { custom_name: string | null; name: string }): string {
  return acct.custom_name?.trim() || acct.name;
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

/** Format "YYYY-MM-DD" → "Jan 15" */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Pick 5 evenly-spaced indices from an array of length n */
export function fiveIndices(n: number): number[] {
  if (n <= 5) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / 4;
  return [0, 1, 2, 3, 4].map((i) => Math.round(i * step));
}
