import { NextResponse } from "next/server";
import { getBudgets, getCategories } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [budgets, categories] = await Promise.all([getBudgets(), getCategories()]);

    const summary = {
      budgetCount: budgets.length,
      categoryCount: categories.length,
      categoryIds: categories.map((c) => c.id),
      budgetCategoryIds: [...new Set(budgets.map((b) => b.category))].sort(),
      sampleBudgets: budgets.slice(0, 5).map((b) => ({
        category: b.category,
        subcategory: b.subcategory,
        budgeted_amount: b.budgeted_amount,
        month: b.month,
        year: b.year,
      })),
      permanentRowCount: budgets.filter((b) => b.month === 1 && b.year === 1900).length,
      totalBudgeted: budgets.reduce((s, b) => s + b.budgeted_amount, 0),
    };

    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
