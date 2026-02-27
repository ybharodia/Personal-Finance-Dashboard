// Static category metadata — not stored in the database.
// Budget amounts, spent amounts, and transactions all come from Supabase.

export type CategoryMeta = {
  id: string;
  name: string;
  color: string;
  type: "income" | "expense";
};

export const BUDGET_CATEGORIES: CategoryMeta[] = [
  { id: "housing", name: "Housing", color: "#6366f1", type: "expense" },
  { id: "transportation", name: "Transportation", color: "#f59e0b", type: "expense" },
  { id: "food", name: "Food & Groceries", color: "#10b981", type: "expense" },
  { id: "insurance", name: "Insurance", color: "#3b82f6", type: "expense" },
  { id: "personal", name: "Personal & Lifestyle", color: "#ec4899", type: "expense" },
  { id: "discretionary", name: "Discretionary / Variable", color: "#8b5cf6", type: "expense" },
  { id: "jash", name: "Jash Support", color: "#f97316", type: "expense" },
  { id: "business", name: "Business Expense", color: "#06b6d4", type: "expense" },
  { id: "savings", name: "Savings & Investments", color: "#84cc16", type: "expense" },
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
