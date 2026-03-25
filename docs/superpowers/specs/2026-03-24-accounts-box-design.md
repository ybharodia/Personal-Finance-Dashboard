# Accounts Box — Design Spec
**Date:** 2026-03-24
**Session:** Dashboard Redesign Session 2
**Status:** Approved

---

## Goal

Replace the "Accounts — coming soon" placeholder in the dashboard Row 2 right column with a fully working `AccountsBox` component. The box groups accounts by owner/type into four labelled sections and lets the user tag any account via a pencil-icon modal — with instant UI updates, no page refresh.

---

## Data Flow

`app/(app)/page.tsx` (server component) fetches `accounts` via `getAccounts()` in `lib/db.ts`.
`DashboardClient` receives `accounts: DbAccount[]` and passes it as a prop to `AccountsBox`.
`AccountsBox` copies the prop into local `useState<DbAccount[]>` for optimistic mutation after tagging.
On save, local state is updated immediately; no `router.refresh()` needed.

---

## Type Changes — `lib/database.types.ts`

Add two nullable columns to the `accounts` table type:

```ts
Row: {
  // existing fields …
  owner: string | null;
  account_group: string | null;
}
Insert: {
  // existing fields …
  owner?: string | null;
  account_group?: string | null;
}
Update: {
  // existing fields …
  owner?: string | null;
  account_group?: string | null;
}
```

The SQL migration (`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS owner text; ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_group text;`) was already applied in Session 1.

---

## API Change — `app/api/accounts/[id]/route.ts`

Extend the existing `PATCH` handler to accept `owner` and `account_group` in addition to the existing `custom_name`. All three fields remain optional; only present fields are written. Validation: each field, if present, must be `string | null`.

---

## Component — `components/AccountsBox.tsx`

**Type:** `"use client"` component.
**Props:** `{ accounts: DbAccount[] }`

### Sections (rendered in this order)

| # | Label | Filter condition |
|---|-------|-----------------|
| 1 | Untagged | `owner` is null/empty **OR** `account_group` is null/empty |
| 2 | Yash | `owner === 'yash'` AND `account_group !== 'credit'` |
| 3 | Nancy | `owner === 'nancy'` AND `account_group !== 'credit'` |
| 4 | Credit Cards | `account_group === 'credit'` (any owner) |

- Section 1 (Untagged) disappears entirely when empty — no heading, no warning.
- Untagged section shows a small amber note: *"These accounts need to be tagged."*

### Account Row

```
[Account name]          [balance]  [pencil icon]
[subtitle]
```

- **Account name:** `custom_name?.trim() || name`
- **Subtitle (sections 1–3):** `{typeLabel} · {bank_name}` where typeLabel maps `account_group`: `checking → Checking`, `savings → Savings`, `credit → Credit Card`, null/unknown → just `{bank_name}`
- **Subtitle (Credit Cards section):** If `owner` is set: `{OwnerName} · {bank_name}` (e.g., "Yash · Chase"). If not: just `{bank_name}`.
- **Balance:** right-aligned, red if negative.
- **Pencil icon:** visible on row hover (`group-hover:opacity-100`). Opens tagging modal.

### Section Headers

Small, uppercase, letter-spaced muted text (`text-xs font-semibold uppercase tracking-wider text-gray-400`). Thin divider between rows.

### Scrolling

Outer container: `overflow-y-auto` with `max-h-[420px]` so the box doesn't push Row 3 down on large account lists.

---

## Tagging Modal (inline sub-component `TagModal`)

Triggered by pencil click. Renders as a fixed overlay with a centered white card.

**Fields:**
- Title: account name
- **Owner** dropdown: options `Yash` → `'yash'`, `Nancy` → `'nancy'`. Pre-selected to current value if already tagged.
- **Type** dropdown: options `Checking` → `'checking'`, `Savings` → `'savings'`, `Credit Card` → `'credit'`. Pre-selected to current `account_group` if set.
- **Save** button: disabled until both fields are selected.
- **Cancel** button: closes without saving.

**On Save:**
1. `PATCH /api/accounts/{id}` with `{ owner, account_group }`.
2. On success: update `localAccounts` state — replace the matching account with `{ ...account, owner, account_group }`.
3. Close modal immediately (optimistic — fire-and-forget after state update; show no loading spinner for simplicity).
4. On error: keep modal open, show inline error message.

---

## Dashboard Integration — `components/DashboardClient.tsx`

Replace this placeholder in Row 2:
```tsx
<div className="flex-[2] min-h-[220px] bg-gray-100 rounded-xl flex items-center justify-center">
  <span className="text-sm text-gray-400 font-medium">Accounts — coming soon</span>
</div>
```

With:
```tsx
<AccountsBox accounts={accounts} />
```

Wrap it in the same `flex-[2]` container so proportions are preserved.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/database.types.ts` | Add `owner`, `account_group` to accounts Row/Insert/Update |
| `app/api/accounts/[id]/route.ts` | Accept `owner` + `account_group` in PATCH body |
| `components/AccountsBox.tsx` | **New** — full component + TagModal sub-component |
| `components/DashboardClient.tsx` | Swap placeholder with `<AccountsBox accounts={accounts} />` |

---

## Out of Scope

- Plaid connect button (lives in the old `AccountsPanel`, not needed here)
- Account rename (separate pencil flow in old panel; not part of this spec)
- Sorting / filtering within sections
- Balance totals per section
