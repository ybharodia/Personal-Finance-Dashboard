import { supabase } from "./supabase";
import { merchantRuleKey } from "./recurring";

/**
 * Fetch all non-user-categorized transactions matching merchantKey, then bulk-update
 * them with the given payload.
 * SACRED RULE: transactions with user_categorized = true are NEVER touched.
 * Returns the IDs of updated transactions.
 */
async function bulkUpdateMatchingTransactions(
  merchantKey: string,
  payload: { category: string; subcategory: string }
): Promise<string[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, description, user_categorized")
    .eq("user_categorized", false);

  if (error || !data) return [];

  const matchingIds = data
    .filter((t) => !t.user_categorized && merchantRuleKey(t.description) === merchantKey)
    .map((t) => t.id);

  if (matchingIds.length === 0) return [];

  await supabase
    .from("transactions")
    .update(payload)
    .in("id", matchingIds)
    .eq("user_categorized", false); // belt-and-suspenders guard

  return matchingIds;
}

/** Apply a rule: set category + subcategory on all matching non-user-categorized transactions. */
export function applyRuleToDb(
  merchantKey: string,
  category: string,
  subcategory: string
): Promise<string[]> {
  return bulkUpdateMatchingTransactions(merchantKey, { category, subcategory });
}

/** Revert a rule: clear category + subcategory on all matching non-user-categorized transactions. */
export function revertRuleFromDb(merchantKey: string): Promise<string[]> {
  return bulkUpdateMatchingTransactions(merchantKey, { category: "", subcategory: "" });
}
