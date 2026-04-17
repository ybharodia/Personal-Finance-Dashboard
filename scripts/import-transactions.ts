/**
 * One-time data recovery script — imports transactions from a CSV/Excel file into Supabase.
 *
 * Columns expected: Date, Description, Category, Subcategory, Amount, Type
 * IDs are deterministic (sha256 of Date|Description|Amount) so re-running never creates duplicates.
 *
 * Usage:
 *   npx tsx scripts/import-transactions.ts <path-to-file>
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
if (!supabaseUrl || !supabaseKey) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL or anon/service-role key in .env.local");
  process.exit(1);
}

const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

function makeId(date: string, description: string, amount: number): string {
  return createHash("sha256")
    .update(`${date}|${description}|${amount}`)
    .digest("hex")
    .slice(0, 16);
}

/** Excel date serial (days since 1900-01-00) → YYYY-MM-DD */
function excelSerialToISO(serial: number): string {
  const date = new Date((serial - 25569) * 86400 * 1000);
  return date.toISOString().slice(0, 10);
}

function normalizeDate(val: unknown): string {
  if (typeof val === "number") return excelSerialToISO(val);
  const s = String(val ?? "").trim();
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

const BATCH_SIZE = 500;

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx scripts/import-transactions.ts <path-to-file>");
    process.exit(1);
  }

  const workbook = XLSX.readFile(path.resolve(filePath));
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const rows     = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  console.log(`📂  Read ${rows.length} row(s) from ${path.basename(filePath)}\n`);

  const records = rows.map((row) => {
    const date   = normalizeDate(row["Date"]);
    const desc   = String(row["Description"] ?? "").trim();
    const amount = Number(row["Amount"] ?? 0);
    return {
      id:              makeId(date, desc, amount),
      date,
      description:     desc,
      category:        String(row["Category"]    ?? "").trim(),
      subcategory:     String(row["Subcategory"] ?? "").trim(),
      amount,
      type:            String(row["Type"] ?? "expense").trim() as "income" | "expense" | "transfer",
      account_id:      null as unknown as string,
      user_categorized: false,
    };
  });

  // Pre-check which IDs already exist (batched to stay within Supabase limits)
  const allIds = records.map((r) => r.id);
  const existingIds = new Set<string>();
  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const chunk = allIds.slice(i, i + BATCH_SIZE);
    const { data, error } = await db.from("transactions").select("id").in("id", chunk);
    if (error) throw new Error(`Pre-check failed: ${error.message}`);
    (data ?? []).forEach((r) => existingIds.add(r.id));
  }

  const toInsert = records.filter((r) => !existingIds.has(r.id));
  const skipped  = records.length - toInsert.length;

  if (toInsert.length === 0) {
    console.log(`✅  Nothing to insert — all ${records.length} row(s) already exist.`);
    return;
  }

  // Insert new rows in batches
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { error } = await db
      .from("transactions")
      .upsert(batch, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`Insert batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error.message}`);
    inserted += batch.length;
    if (toInsert.length > BATCH_SIZE) {
      process.stdout.write(`  …inserted ${inserted} / ${toInsert.length}\r`);
    }
  }

  console.log(`\n✅  Done.`);
  console.log(`   Inserted : ${inserted}`);
  console.log(`   Skipped  : ${skipped} (already existed)`);
}

main().catch((err) => { console.error("❌", err.message); process.exit(1); });
