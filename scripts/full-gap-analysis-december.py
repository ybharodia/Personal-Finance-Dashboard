"""
Full Gap Analysis — December 2025 (2025-12-01 through 2025-12-31)
Compares ALL transaction types (expense, income, transfer) in the Excel export
against Plaid rows in Supabase for the same period.
Read-only — no inserts or modifications.
"""

import requests
import pandas as pd
from datetime import date
from pathlib import Path

import warnings
warnings.filterwarnings("ignore")

ROOT        = Path(__file__).parent.parent
EXCEL_PATH  = ROOT / "data" / "November_to_march_21_transactions.xlsx"
OUTPUT_PATH = ROOT / "data" / "full_gap_analysis_december.csv"
ENV_PATH    = ROOT / ".env.local"

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
}

# ─── STEP 1: Load Excel ───────────────────────────────────────────────────────
print("═" * 72)
print("STEP 1 — Loading Excel file")
print("═" * 72)

raw = pd.read_excel(EXCEL_PATH)
raw["Date"]        = pd.to_datetime(raw["Date"]).dt.date
raw["Amount"]      = raw["Amount"].astype(float).round(2)
raw["Description"] = raw["Description"].fillna("").str.strip()
raw["Type"]        = raw["Type"].str.strip().str.lower()

DEC_START = date(2025, 12, 1)
DEC_END   = date(2025, 12, 31)
excel_df = raw[(raw["Date"] >= DEC_START) & (raw["Date"] <= DEC_END)].copy()

print(f"  File: {EXCEL_PATH.name}")
print(f"  Total December rows: {len(excel_df)}")
print()
print("  Breakdown by type:")
for tx_type, count in excel_df["Type"].value_counts().items():
    total = excel_df.loc[excel_df["Type"] == tx_type, "Amount"].sum()
    print(f"    {tx_type:<12} {count:>4} rows   ${total:>10.2f}")
print()

# ─── STEP 2: Load ALL transactions from Supabase (Plaid + manual) ────────────
print("═" * 72)
print("STEP 2 — Loading ALL transactions from Supabase (Plaid + manual)")
print("═" * 72)

resp = requests.get(
    f"{SUPABASE_URL}/rest/v1/transactions",
    headers={**HEADERS, "Prefer": "count=exact"},
    params={
        "select": "id,date,description,amount,category,type",
        "order":  "date.asc",
    },
)
resp.raise_for_status()

all_plaid = pd.DataFrame(resp.json())
all_plaid["date"]        = pd.to_datetime(all_plaid["date"]).dt.date
all_plaid["amount"]      = all_plaid["amount"].astype(float).round(2)
all_plaid["description"] = all_plaid["description"].fillna("").str.strip()
all_plaid["type"]        = all_plaid["type"].str.strip().str.lower()

plaid_df = all_plaid[
    (all_plaid["date"] >= DEC_START) & (all_plaid["date"] <= DEC_END)
].copy()

print(f"  All rows fetched (Dec 2025): {len(plaid_df)}")
print()
print("  Breakdown by type:")
for tx_type, count in plaid_df["type"].value_counts().items():
    total = plaid_df.loc[plaid_df["type"] == tx_type, "amount"].sum()
    print(f"    {tx_type:<12} {count:>4} rows   ${total:>10.2f}")
print()

# ─── STEP 3: Three-tier matching per type ─────────────────────────────────────
STATUSES = [
    "MATCHED",
    "PROBABLE - review",
    "AMOUNT ONLY - review",
    "MISSING - import needed",
]

def match_rows(excel_rows: pd.DataFrame, plaid_rows: pd.DataFrame) -> list[dict]:
    pool           = plaid_rows.copy()
    pool_available = set(pool.index)
    results        = []

    for _, ex in excel_rows.iterrows():
        ex_amount  = ex["Amount"]
        ex_date    = ex["Date"]
        ex_desc_15 = ex["Description"][:15].lower()

        status          = None
        matched_idx     = None
        matched_pl_desc = None
        matched_pl_date = None
        matched_pl_id   = None

        candidates = pool.loc[list(pool_available)]

        # Tier 1 — exact amount + exact date + desc prefix
        for idx, pl in candidates.iterrows():
            if (
                pl["amount"] == ex_amount
                and pl["date"] == ex_date
                and pl["description"][:15].lower() == ex_desc_15
            ):
                status          = "MATCHED"
                matched_idx     = idx
                matched_pl_desc = pl["description"]
                matched_pl_date = pl["date"]
                matched_pl_id   = pl["id"]
                break

        # Tier 2 — exact amount + ±1 day
        if status is None:
            for idx, pl in candidates.iterrows():
                date_delta = abs((pl["date"] - ex_date).days)
                if pl["amount"] == ex_amount and date_delta <= 1:
                    status          = "PROBABLE - review"
                    matched_idx     = idx
                    matched_pl_desc = pl["description"]
                    matched_pl_date = pl["date"]
                    matched_pl_id   = pl["id"]
                    break

        # Tier 3 — exact amount only, date off > 1 day
        if status is None:
            for idx, pl in candidates.iterrows():
                if pl["amount"] == ex_amount:
                    status          = "AMOUNT ONLY - review"
                    matched_idx     = idx
                    matched_pl_desc = pl["description"]
                    matched_pl_date = pl["date"]
                    matched_pl_id   = pl["id"]
                    break

        if status is None:
            status = "MISSING - import needed"
        else:
            pool_available.discard(matched_idx)

        results.append({
            "type":              ex["Type"],
            "excel_date":        ex["Date"],
            "excel_description": ex["Description"],
            "excel_amount":      ex_amount,
            "excel_category":    ex.get("Category", ""),
            "excel_subcategory": ex.get("Subcategory", ""),
            "status":            status,
            "plaid_id":          matched_pl_id or "",
            "plaid_date":        matched_pl_date or "",
            "plaid_description": matched_pl_desc or "",
        })

    return results

print("═" * 72)
print("STEP 3 — Running three-tier matching (per type)")
print("═" * 72)

all_results = []
for tx_type in ["expense", "income", "transfer"]:
    ex_subset = excel_df[excel_df["Type"] == tx_type]
    pl_subset  = plaid_df[plaid_df["type"] == tx_type]
    rows = match_rows(ex_subset, pl_subset)
    all_results.extend(rows)
    print(f"  {tx_type}: {len(ex_subset)} Excel vs {len(pl_subset)} Plaid rows")

results_df = pd.DataFrame(all_results)
print()

# ─── STEP 4: Print results ────────────────────────────────────────────────────
DIV = "─" * 72
EXPENSE_TARGET = 12705.98

def print_section_header(title: str):
    print()
    print("━" * 72)
    print(f"  {title}")
    print("━" * 72)

def print_missing(df: pd.DataFrame):
    missing = df[df["status"] == "MISSING - import needed"].sort_values("excel_date")
    if missing.empty:
        print("  ✓ None — all rows accounted for.")
        return
    print(f"  {'Date':<12} {'Amount':>8}  {'Category':<26} {'Description'}")
    print(DIV)
    for _, r in missing.iterrows():
        desc = str(r["excel_description"])[:44]
        cat  = str(r["excel_category"])[:25]
        print(f"  {str(r['excel_date']):<12} ${r['excel_amount']:>7.2f}  {cat:<26} {desc}")

def print_probable(df: pd.DataFrame):
    prob = df[df["status"] == "PROBABLE - review"].sort_values("excel_date")
    if prob.empty:
        print("  (none)")
        return
    print(f"  {'Ex Date':<12} {'Amount':>8}  {'Excel Description':<34} {'Plaid Description'}")
    print(DIV)
    for _, r in prob.iterrows():
        ex_d = str(r["excel_description"])[:33]
        pl_d = str(r["plaid_description"])[:33]
        print(f"  {str(r['excel_date']):<12} ${r['excel_amount']:>7.2f}  {ex_d:<34} {pl_d}")

def print_amount_only(df: pd.DataFrame):
    ao = df[df["status"] == "AMOUNT ONLY - review"].sort_values("excel_date")
    if ao.empty:
        print("  (none)")
        return
    print(f"  {'Ex Date':<12} {'Pl Date':<12} {'Amount':>8}  {'Excel Description':<34} {'Plaid Description'}")
    print(DIV)
    for _, r in ao.iterrows():
        ex_d = str(r["excel_description"])[:33]
        pl_d = str(r["plaid_description"])[:33]
        print(f"  {str(r['excel_date']):<12} {str(r['plaid_date']):<12} ${r['excel_amount']:>7.2f}  {ex_d:<34} {pl_d}")

for tx_type in ["expense", "income", "transfer"]:
    type_df = results_df[results_df["type"] == tx_type]

    print_section_header(f"TYPE: {tx_type.upper()}")

    print(f"  {'Status':<40} {'Rows':>5}  {'Amount':>12}")
    print(DIV)
    grand_rows = grand_total = 0
    for status in STATUSES:
        sub   = type_df[type_df["status"] == status]
        cnt   = len(sub)
        total = sub["excel_amount"].sum()
        grand_rows  += cnt
        grand_total += total
        marker = "→ " if (status == "MISSING - import needed" and cnt > 0) else "  "
        print(f"  {marker}{status:<38} {cnt:>5}  ${total:>11.2f}")
    print(DIV)
    print(f"  {'TOTAL':<40} {grand_rows:>5}  ${grand_total:>11.2f}")

    excel_total   = type_df["excel_amount"].sum()
    matched_total = type_df.loc[type_df["status"] != "MISSING - import needed", "excel_amount"].sum()
    missing_total = type_df.loc[type_df["status"] == "MISSING - import needed", "excel_amount"].sum()
    check = abs((matched_total + missing_total) - excel_total) < 0.01
    print(f"\n  Sanity check: {'✓ PASS' if check else '✗ FAIL'}")
    print(f"    Excel total: ${excel_total:.2f}  |  Matched: ${matched_total:.2f}  |  Missing: ${missing_total:.2f}")

    print(f"\n  MISSING rows ({(type_df['status'] == 'MISSING - import needed').sum()}):")
    print_missing(type_df)

    print(f"\n  PROBABLE matches ({(type_df['status'] == 'PROBABLE - review').sum()}):")
    print_probable(type_df)

    print(f"\n  AMOUNT-ONLY matches ({(type_df['status'] == 'AMOUNT ONLY - review').sum()}):")
    print_amount_only(type_df)

# ─── Overall summary ──────────────────────────────────────────────────────────
print_section_header("OVERALL SUMMARY — ALL TYPES")
print(f"  {'Type':<12} {'Total':>5}  {'Matched':>8}  {'Probable':>9}  {'Amt Only':>9}  {'Missing':>8}  {'Missing $':>11}")
print(DIV)
for tx_type in ["expense", "income", "transfer"]:
    tdf      = results_df[results_df["type"] == tx_type]
    tot      = len(tdf)
    m        = (tdf["status"] == "MATCHED").sum()
    p        = (tdf["status"] == "PROBABLE - review").sum()
    ao       = (tdf["status"] == "AMOUNT ONLY - review").sum()
    miss     = (tdf["status"] == "MISSING - import needed").sum()
    miss_amt = tdf.loc[tdf["status"] == "MISSING - import needed", "excel_amount"].sum()
    print(f"  {tx_type:<12} {tot:>5}  {m:>8}  {p:>9}  {ao:>9}  {miss:>8}  ${miss_amt:>10.2f}")
print(DIV)
tot      = len(results_df)
m        = (results_df["status"] == "MATCHED").sum()
p        = (results_df["status"] == "PROBABLE - review").sum()
ao       = (results_df["status"] == "AMOUNT ONLY - review").sum()
miss     = (results_df["status"] == "MISSING - import needed").sum()
miss_amt = results_df.loc[results_df["status"] == "MISSING - import needed", "excel_amount"].sum()
print(f"  {'ALL':<12} {tot:>5}  {m:>8}  {p:>9}  {ao:>9}  {miss:>8}  ${miss_amt:>10.2f}")

# ─── Expense verification vs target ───────────────────────────────────────────
print_section_header("EXPENSE VERIFICATION vs TARGET")
exp_df      = results_df[results_df["type"] == "expense"]
plaid_exp   = plaid_df[plaid_df["type"] == "expense"]["amount"].sum()
missing_exp = exp_df.loc[exp_df["status"] == "MISSING - import needed", "excel_amount"].sum()

print(f"  Supabase expense total (Dec 2025):  ${plaid_exp:>10.2f}")
print(f"  Excel expense target:               ${EXPENSE_TARGET:>10.2f}")
print(f"  Gap (MISSING rows total):           ${missing_exp:>10.2f}")
print(f"  Difference from target:             ${EXPENSE_TARGET - plaid_exp:>10.2f}")

# ─── Save CSV ─────────────────────────────────────────────────────────────────
results_df.to_csv(OUTPUT_PATH, index=False)
print()
print(f"Full results saved → {OUTPUT_PATH.relative_to(ROOT)}")
print()
