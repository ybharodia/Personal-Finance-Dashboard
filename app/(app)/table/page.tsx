import { getTransactionsByDateRange, getBudgets, getCategories } from "@/lib/db";
import TableClient from "@/components/TableClient";

export const dynamic = "force-dynamic";

export default async function TablePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const currentYear = now.getFullYear();
  const selectedYear = Number(params.year) || currentYear;

  const from = `${selectedYear}-01-01`;
  const to = `${selectedYear + 1}-01-01`;

  const [transactions, budgets, categories] = await Promise.all([
    getTransactionsByDateRange(from, to),
    getBudgets(),
    getCategories(),
  ]);

  return (
    <TableClient
      transactions={transactions}
      budgets={budgets}
      categories={categories}
      selectedYear={selectedYear}
      currentYear={currentYear}
    />
  );
}
