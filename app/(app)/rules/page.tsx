import { getBudgets, getCategories } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase";
import MerchantRulesClient from "@/components/MerchantRulesClient";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const db = createAdminClient();
  const [budgets, categories, { data: rules }] = await Promise.all([
    getBudgets(),
    getCategories(),
    db.from("merchant_rules").select("*").order("display_name"),
  ]);

  return (
    <MerchantRulesClient
      initialRules={rules ?? []}
      budgets={budgets}
      categories={categories}
    />
  );
}
