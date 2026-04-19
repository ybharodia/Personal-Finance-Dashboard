"""
Import Missing February 2026 Transactions
Inserts exactly 13 hardcoded rows into Supabase (11 expenses + 2 income).
Skips any row that already exists on (date, amount, description).
Read-verify — does NOT auto-push to git.
"""

import sys
import requests
import hashlib
from pathlib import Path

import warnings
warnings.filterwarnings("ignore")

ROOT     = Path(__file__).parent.parent
ENV_PATH = ROOT / ".env.local"

# ─── Supabase credentials ─────────────────────────────────────────────────────
env = {}
with open(ENV_PATH) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()

SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]

HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
}

DIV = "─" * 72

def supabase_get(params: dict) -> list:
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/transactions",
        headers=HEADERS,
        params=params,
    )
    resp.raise_for_status()
    return resp.json()

def supabase_insert(rows: list[dict]) -> list:
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/transactions",
        headers=HEADERS,
        json=rows,
    )
    if resp.status_code not in (200, 201):
        print(f"  ERROR {resp.status_code}: {resp.text}")
        resp.raise_for_status()
    return resp.json()

# ─── Hardcoded rows to import ─────────────────────────────────────────────────
# Format: (date, amount, category, description, type, subcategory)
ROWS_TO_IMPORT = [
    # ── EXPENSES (11) ──────────────────────────────────────────────────────────
    ("2026-02-02",   425.00, "jash_support",  "J&J INVESTMENT P FUNDING",          "expense", "Jash Living Expenses/Rent"),
    ("2026-02-02",   500.00, "jash_support",  "J&J INVESTMENT P FUNDING",          "expense", "Jash Living Expenses/Rent"),
    ("2026-02-03",   750.00, "savings",        "PERSHING BROKERAGE",                "expense", "Northwestern Investment/Capital Call"),
    ("2026-02-09",   100.00, "jash_support",  "Zelle to JASH 27989981296",         "expense", "Jash Living Expenses/Rent"),
    ("2026-02-09",   150.00, "jash_support",  "Zelle to JASH 28014596083",         "expense", "Jash Living Expenses/Rent"),
    ("2026-02-10",  1030.71, "personal",       "Zelle to Harsh Patel",              "expense", "T-Mobile Bill"),
    ("2026-02-11",   493.62, "transportation", "VW CREDIT AUTO DEBIT",              "expense", "Tiguan Car Payment"),
    ("2026-02-13",    50.00, "business",       "LEARN TEST PASS, LLC",              "expense", "Licensing & Business Expenses"),
    ("2026-02-13",    50.00, "jash_support",  "Zelle payment to JASH 28063889861", "expense", "Jash Living Expenses/Rent"),
    ("2026-02-18",   500.00, "jash_support",  "Zelle to JASH 28123236169",         "expense", "Jash Living Expenses/Rent"),
    ("2026-02-23",    62.50, "personal",       "NON-CHASE ATM WITHDRAW",            "expense", "Personal Care"),
    # ── INCOME (2) ─────────────────────────────────────────────────────────────
    ("2026-02-24",    14.34, "income",         "NORTHWESTERN MU ISA WITHDL",        "income",  "Other Income"),
    ("2026-02-26",  9300.00, "income",         "REMOTE ONLINE DEPOSIT # 1",         "income",  "EB5 Interest Income"),
]

EXPENSE_TOTAL = sum(r[1] for r in ROWS_TO_IMPORT if r[4] == "expense")
INCOME_TOTAL  = sum(r[1] for r in ROWS_TO_IMPORT if r[4] == "income")

print("═" * 72)
print("STEP 1 — Rows staged for import")
print("═" * 72)
print(f"  Expenses: {sum(1 for r in ROWS_TO_IMPORT if r[4] == 'expense')} rows   ${EXPENSE_TOTAL:>10.2f}")
print(f"  Income:   {sum(1 for r in ROWS_TO_IMPORT if r[4] == 'income')} rows   ${INCOME_TOTAL:>10.2f}")
print(f"  Total:    {len(ROWS_TO_IMPORT)} rows")
print()

# ─── STEP 2: Fetch existing Feb 2026 rows for duplicate detection ──────────────
print("═" * 72)
print("STEP 2 — Fetching existing February 2026 rows from Supabase")
print("═" * 72)

all_rows = supabase_get({
    "select": "date,amount,description",
    "order":  "date.asc",
})
existing_feb = [
    r for r in all_rows
    if r.get("date") and "2026-02-01" <= str(r["date"])[:10] <= "2026-02-28"
]

existing_keys = set()
for r in existing_feb:
    key = (str(r["date"])[:10], round(float(r["amount"]), 2), str(r["description"]).strip())
    existing_keys.add(key)

print(f"  Existing Feb 2026 rows in DB: {len(existing_feb)}")
print(f"  Unique (date, amount, description) keys: {len(existing_keys)}")
print()

# ─── STEP 3: Insert rows ──────────────────────────────────────────────────────
print("═" * 72)
print("STEP 3 — Inserting rows")
print("═" * 72)

inserted      = 0
skipped       = 0
failed        = 0

for (date_str, amount, category, description, tx_type, subcategory) in ROWS_TO_IMPORT:
    key = (date_str, round(amount, 2), description)

    if key in existing_keys:
        print(f"  SKIP (exists): {date_str}  ${amount:>8.2f}  {description[:50]}")
        skipped += 1
        continue

    id_src = f"imp-feb26-{date_str}-{amount}-{description}"
    row_id = "imp-" + hashlib.md5(id_src.encode()).hexdigest()[:12]

    payload = {
        "id":          row_id,
        "date":        date_str,
        "description": description,
        "amount":      round(amount, 2),
        "type":        tx_type,
        "category":    category,
        "subcategory": subcategory,
        "account_id":  None,
    }

    try:
        supabase_insert([payload])
        inserted += 1
        existing_keys.add(key)
        print(f"  ✓ {tx_type:<8} {date_str}  ${amount:>8.2f}  [{category:<16}]  {description[:42]}")
    except Exception as e:
        failed += 1
        print(f"  ✗ FAILED: {date_str}  ${amount:>8.2f}  {description[:42]}  — {e}")

print()
print(DIV)
print(f"  Inserted: {inserted}  |  Skipped (already existed): {skipped}  |  Failed: {failed}")
print()

if failed > 0:
    print("  Aborting — some inserts failed. Fix errors above before continuing.")
    sys.exit(1)

# ─── STEP 4: Verification ─────────────────────────────────────────────────────
print("═" * 72)
print("STEP 4 — Verification")
print("═" * 72)

all_feb = supabase_get({
    "select": "type,amount,date",
    "order":  "date.asc",
})
all_feb = [
    r for r in all_feb
    if r.get("date") and "2026-02-01" <= str(r["date"])[:10] <= "2026-02-28"
]

by_type: dict[str, dict] = {}
for r in all_feb:
    t = r["type"]
    by_type.setdefault(t, {"count": 0, "total": 0.0})
    by_type[t]["count"] += 1
    by_type[t]["total"] += float(r["amount"])

EXPENSE_TARGET = 9572.88

print(f"  {'type':<12} {'rows':>6}  {'total_amount':>14}")
print(DIV)
for tx_type in sorted(by_type.keys()):
    rows  = by_type[tx_type]["count"]
    total = round(by_type[tx_type]["total"], 2)
    print(f"  {tx_type:<12} {rows:>6}  ${total:>13.2f}")
print(DIV)

expense_total = round(by_type.get("expense", {}).get("total", 0.0), 2)
diff = abs(expense_total - EXPENSE_TARGET)

print()
print(f"  Expense total in DB:  ${expense_total:.2f}")
print(f"  Target:               ${EXPENSE_TARGET:.2f}")
print(f"  Difference:           ${diff:.2f}")
print()

if diff <= 1.00:
    print("  ✅ February verified — ready to push")
else:
    print(f"  ❌ Mismatch — do not push  (off by ${diff:.2f})")
    sys.exit(1)
