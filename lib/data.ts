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

export function getCategoryMeta(id: string): CategoryMeta | undefined {
  return BUDGET_CATEGORIES.find((c) => c.id === id);
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}
