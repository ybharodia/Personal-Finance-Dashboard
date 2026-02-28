/**
 * One-time migration: copy February 2026 budget rows to permanent sentinel rows
 * (month=0, year=0), which getBudgets() now prefers over month-specific rows.
 *
 * The original February rows are left untouched as a backup.
 *
 * Usage:
 *   npx tsx scripts/migrate-budgets-permanent.ts
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env.local lives in the main repo root. When running from a git worktree
// (.claude/worktrees/<name>/scripts/), we need to walk up four levels instead of one.
const envCandidates = [
  path.resolve(__dirname, "../.env.local"),           // normal: scripts/ → root
  path.resolve(__dirname, "../../../../.env.local"),  // worktree: scripts/ → worktree root → .claude/worktrees/<name> → .claude → main repo
];
const envPath = envCandidates.find((p) => {
  try { require("fs").accessSync(p); return true; } catch { return false; }
});
if (envPath) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config(); // fallback: let dotenv search cwd
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const activeKey = serviceRoleKey || anonKey;
const db = createClient(supabaseUrl, activeKey, {
  auth: { persistSession: false },
});

async function main() {
  console.log("🚀  Migrating February 2026 budgets → permanent (month=0, year=0)…\n");

  // 1. Fetch all February 2026 budget rows
  const { data: febRows, error: fetchErr } = await db
    .from("budgets")
    .select("*")
    .eq("month", 2)
    .eq("year", 2026);

  if (fetchErr) {
    console.error("❌  Failed to fetch February budgets:", fetchErr.message);
    process.exit(1);
  }

  if (!febRows || febRows.length === 0) {
    console.warn("⚠️   No February 2026 budget rows found. Nothing to migrate.");
    process.exit(0);
  }

  console.log(`📋  Found ${febRows.length} February 2026 budget rows to migrate.\n`);

  // 2. Check which permanent rows already exist (sentinel: month=1, year=1900)
  const { data: existingPermanent, error: existingErr } = await db
    .from("budgets")
    .select("category, subcategory")
    .eq("month", 1)
    .eq("year", 1900);

  if (existingErr) {
    console.error("❌  Failed to check existing permanent rows:", existingErr.message);
    process.exit(1);
  }

  const alreadyPermanent = new Set(
    (existingPermanent ?? []).map((r: { category: string; subcategory: string }) => `${r.category}::${r.subcategory}`)
  );

  let inserted = 0;
  let skipped = 0;

  for (const row of febRows) {
    const key = `${row.category}::${row.subcategory}`;

    if (alreadyPermanent.has(key)) {
      console.log(`  ✓ [already exists]  [${row.category}] ${row.subcategory}`);
      skipped++;
      continue;
    }

    const newId = crypto.randomUUID();
    const { error: insertErr } = await db
      .from("budgets")
      .insert({
        id: newId,
        category: row.category,
        subcategory: row.subcategory,
        budgeted_amount: row.budgeted_amount,
        month: 1,
        year: 1900,
      });

    if (insertErr) {
      console.error(`  ❌  Failed to insert permanent row for [${row.category}] ${row.subcategory}:`, insertErr.message);
    } else {
      console.log(`  ✅  Migrated  [${row.category}] ${row.subcategory}: $${row.budgeted_amount}`);
      inserted++;
    }
  }

  console.log(`\n✅  Done. Inserted: ${inserted}, Already existed: ${skipped}`);

  // 3. Verify — print all permanent rows
  console.log("\n📋  Current permanent budget rows (month=1, year=1900):");
  const { data: final, error: finalErr } = await db
    .from("budgets")
    .select("category, subcategory, budgeted_amount")
    .eq("month", 1)
    .eq("year", 1900)
    .order("category")
    .order("subcategory");

  if (finalErr) {
    console.error("❌  Failed to fetch final state:", finalErr.message);
  } else {
    for (const row of final ?? []) {
      console.log(`     [${row.category}] ${row.subcategory}: $${row.budgeted_amount}`);
    }
    console.log(`\n   Total permanent rows: ${final?.length ?? 0}`);
  }
}

main().catch((err) => {
  console.error("❌ ", err.message);
  process.exit(1);
});
