"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Search,
  Calendar,
  ChevronDown,
} from "lucide-react";
import {
  DateFilterProvider,
  useDateFilter,
  getShellPresetRange,
  type ShellPreset,
} from "@/lib/date-filter-context";

// ── Nav config ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: "Dash",  href: "/"            },
  { label: "Txns",  href: "/transactions"},
  { label: "Budgets", href: "/budgets"   },
  { label: "Recur", href: "/recurring"   },
  // Route is /table (existing); will be renamed to /income in a future chunk
  { label: "Income", href: "/table"      },
  { label: "Rules", href: "/rules"       },
];

const PRESETS: { preset: ShellPreset; label: string }[] = [
  { preset: "last-7",          label: "Last 7 days"     },
  { preset: "last-30",         label: "Last 30 days"    },
  { preset: "month-to-date",   label: "Month to date"   },
  { preset: "quarter-to-date", label: "Quarter to date" },
  { preset: "year-to-date",    label: "Year to date"    },
  { preset: "last-12-months",  label: "Last 12 months"  },
  { preset: "all-time",        label: "All time"        },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

// ── Rail ─────────────────────────────────────────────────────────────────────

function Rail({ pathname }: { pathname: string }) {
  return (
    <div
      style={{
        width: 68,
        minWidth: 68,
        background: "var(--fo-card)",
        borderRight: "1px solid var(--fo-hair)",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "18px 0",
        gap: 4,
        position: "relative",
      }}
    >
      {/* Logo mark */}
      <div
        style={{
          width: 36,
          height: 36,
          background: "var(--fo-ink)",
          borderRadius: 9,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 18,
          flexShrink: 0,
        }}
      >
        <div style={{ width: 14, height: 14, border: "2px solid var(--fo-accent)", borderRadius: 2 }} />
      </div>

      {/* Nav items */}
      {NAV_ITEMS.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link key={href} href={href} style={{ position: "relative", display: "flex" }}>
            {active && (
              <span
                style={{
                  position: "absolute",
                  left: -12,
                  top: 10,
                  bottom: 10,
                  width: 2,
                  borderRadius: 2,
                  background: "var(--fo-accent)",
                }}
              />
            )}
            <div
              style={{
                width: 44,
                minHeight: 44,
                borderRadius: 9,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "4px 2px",
                background: active ? "var(--fo-accent-soft)" : "transparent",
                color: active ? "var(--fo-accent)" : "var(--fo-muted)",
                transition: "background 0.15s, color 0.15s",
                fontFamily: "var(--font-fo-sans)",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.3px",
                textAlign: "center",
                lineHeight: 1.2,
                textDecoration: "none",
              }}
            >
              {label}
            </div>
          </Link>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* Avatar */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "var(--fo-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--fo-ink)",
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "var(--font-fo-mono)",
          flexShrink: 0,
        }}
      >
        Y
      </div>
    </div>
  );
}

// ── Date filter dropdown ───────────────────────────────────────────────────────

function DateFilterDropdown() {
  const { dateRange, setDateRange } = useDateFilter();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  function applyCustom() {
    if (!customFrom || !customTo) return;
    const [fy, fm, fd] = customFrom.split("-").map(Number);
    const [ty, tm, td] = customTo.split("-").map(Number);
    const from = new Date(fy, fm - 1, fd);
    const to = new Date(ty, tm - 1, td + 1);
    setDateRange({ from, to, preset: "custom", label: "Custom" });
    setOpen(false);
  }

  const triggerBtn: React.CSSProperties = {
    border: "1px solid var(--fo-hair)",
    background: "var(--fo-card)",
    color: "var(--fo-ink)",
    borderRadius: 7,
    padding: "7px 12px",
    fontSize: 12,
    fontFamily: "var(--font-fo-sans)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  return (
    <div style={{ position: "relative" }}>
      <button style={triggerBtn} onClick={() => setOpen((v) => !v)}>
        <Calendar size={14} color="var(--fo-faint)" />
        <span>{dateRange.label}</span>
        <ChevronDown size={12} color="var(--fo-faint)" />
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              zIndex: 50,
              background: "var(--fo-card)",
              border: "1px solid var(--fo-hair)",
              borderRadius: 8,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              padding: 10,
              width: 200,
            }}
          >
            {PRESETS.map(({ preset, label }) => {
              const active = dateRange.preset === preset;
              return (
                <button
                  key={preset}
                  onClick={() => { setDateRange(getShellPresetRange(preset)); setOpen(false); }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "7px 10px",
                    border: "none",
                    borderRadius: 5,
                    fontSize: 12.5,
                    fontFamily: "var(--font-fo-sans)",
                    cursor: "pointer",
                    background: active ? "var(--fo-soft)" : "transparent",
                    color: active ? "var(--fo-ink)" : "var(--fo-muted)",
                    fontWeight: active ? 600 : 450,
                  }}
                >
                  {label}
                </button>
              );
            })}

            <div style={{ borderTop: "1px solid var(--fo-hair)", margin: "8px 0" }} />
            <p
              style={{
                fontSize: 10,
                color: "var(--fo-muted)",
                textTransform: "uppercase",
                letterSpacing: "1.2px",
                padding: "0 10px",
                marginBottom: 6,
                fontFamily: "var(--font-fo-sans)",
              }}
            >
              Custom range
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "0 4px" }}>
              {(["From", "To"] as const).map((label, i) => (
                <div key={label}>
                  <label style={{ fontSize: 10, color: "var(--fo-muted)", fontFamily: "var(--font-fo-sans)" }}>{label}</label>
                  <input
                    type="date"
                    value={i === 0 ? customFrom : customTo}
                    onChange={(e) => i === 0 ? setCustomFrom(e.target.value) : setCustomTo(e.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      fontSize: 11,
                      border: "1px solid var(--fo-hair)",
                      borderRadius: 4,
                      padding: "4px 6px",
                      fontFamily: "var(--font-fo-sans)",
                      background: "var(--fo-soft)",
                      color: "var(--fo-ink)",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={applyCustom}
              style={{
                display: "block",
                width: "calc(100% - 8px)",
                margin: "8px 4px 0",
                background: "var(--fo-ink)",
                color: "white",
                border: "none",
                borderRadius: 5,
                padding: 6,
                fontSize: 12,
                fontFamily: "var(--font-fo-sans)",
                cursor: "pointer",
              }}
            >
              Apply
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Topbar ────────────────────────────────────────────────────────────────────

function Topbar({ pathname }: { pathname: string }) {
  const { dashboardActions } = useDateFilter();
  const monthYear = new Date()
    .toLocaleDateString("en-US", { month: "long", year: "numeric" })
    .toUpperCase();

  const isDashboard = pathname === "/";
  const actions = isDashboard ? dashboardActions : null;

  const syncIdle: React.CSSProperties = {
    background: "var(--fo-ink)",
    color: "var(--fo-card)",
    border: "none",
    borderRadius: 7,
    padding: "7px 13px",
    fontSize: 12,
    fontWeight: 500,
    fontFamily: "var(--font-fo-sans)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  const syncStyle: React.CSSProperties =
    actions?.syncStatus === "success"
      ? { ...syncIdle, background: "var(--fo-good)", color: "white" }
      : actions?.syncStatus === "error"
      ? { ...syncIdle, background: "var(--fo-bad)", color: "white" }
      : actions?.syncStatus === "syncing"
      ? { ...syncIdle, opacity: 0.6, cursor: "not-allowed" }
      : syncIdle;

  return (
    <div
      style={{
        height: 64,
        minHeight: 64,
        background: "var(--fo-card)",
        borderBottom: "1px solid var(--fo-hair)",
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      {/* Left — two-line greeting */}
      <div style={{ flexShrink: 0 }}>
        <p
          style={{
            fontSize: 10,
            letterSpacing: "1.4px",
            color: "var(--fo-faint)",
            fontFamily: "var(--font-fo-sans)",
            lineHeight: 1,
            marginBottom: 3,
          }}
        >
          {monthYear}
        </p>
        <p
          style={{
            fontFamily: "var(--font-fo-serif)",
            fontSize: 22,
            fontWeight: 500,
            color: "var(--fo-ink)",
            lineHeight: 1,
          }}
        >
          Good morning, Yash.
        </p>
      </div>

      {/* Center — search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "var(--fo-soft)",
          borderRadius: 7,
          padding: "8px 14px",
          gap: 8,
          width: 300,
          flexShrink: 0,
        }}
      >
        <Search size={14} color="var(--fo-faint)" style={{ flexShrink: 0 }} />
        <input
          type="search"
          placeholder="Search txns, accounts, rules..."
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 13,
            fontFamily: "var(--font-fo-sans)",
            color: "var(--fo-ink)",
            minWidth: 0,
          }}
        />
        <span
          style={{
            fontSize: 10,
            color: "var(--fo-faint)",
            background: "var(--fo-hair)",
            borderRadius: 4,
            padding: "2px 5px",
            flexShrink: 0,
            fontFamily: "var(--font-fo-sans)",
          }}
        >
          ⌘K
        </span>
      </div>

      {/* Right — dashboard toolbar (date filter + download + sync) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {isDashboard && <DateFilterDropdown />}

        {isDashboard && (
          <button
            onClick={actions?.onDownload}
            style={{
              border: "1px solid var(--fo-hair)",
              background: "var(--fo-card)",
              color: "var(--fo-ink)",
              borderRadius: 7,
              padding: "7px 12px",
              fontSize: 12,
              fontFamily: "var(--font-fo-sans)",
              cursor: "pointer",
            }}
          >
            ↓ Download
          </button>
        )}

        {isDashboard && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <button
              onClick={actions?.onSync}
              disabled={actions?.syncStatus === "syncing"}
              style={syncStyle}
            >
              {actions?.syncStatus === "syncing" ? (
                <>
                  <svg width="13" height="13" className="animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Syncing…
                </>
              ) : actions?.syncStatus === "success" ? (
                <>✓ Synced!</>
              ) : (
                <>
                  ⟳ Sync
                  <span style={{ fontSize: 10, opacity: 0.5, fontFamily: "var(--font-fo-mono)" }}>⌘S</span>
                </>
              )}
            </button>
            {actions?.syncStatus === "error" && actions.syncError && (
              <p style={{ fontSize: 11, color: "var(--fo-bad)", maxWidth: 160, textAlign: "right" }}>
                {actions.syncError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "row",
        background: "var(--fo-bg)",
        overflow: "hidden",
      }}
    >
      <Rail pathname={pathname} />

      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
        <Topbar pathname={pathname} />

        <main style={{ flex: 1, overflowY: "auto", background: "var(--fo-bg)" }}>
          <div style={{ padding: 24 }}>{children}</div>
        </main>
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <DateFilterProvider>
      <ShellInner>{children}</ShellInner>
    </DateFilterProvider>
  );
}
