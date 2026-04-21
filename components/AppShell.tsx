"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  PieChart,
  Repeat,
  TrendingUp,
  SlidersHorizontal,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard",      href: "/",            icon: LayoutDashboard },
  { label: "Transactions",   href: "/transactions", icon: ArrowLeftRight  },
  { label: "Budgets",        href: "/budgets",      icon: PieChart        },
  { label: "Recurring",      href: "/recurring",    icon: Repeat          },
  // Route is /table (existing); will be renamed to /income in a future chunk
  { label: "Income",         href: "/table",        icon: TrendingUp      },
  { label: "Rules",          href: "/rules",        icon: SlidersHorizontal },
];

const PAGE_TITLES: Record<string, string> = {
  "/":             "Dashboard",
  "/transactions": "Transactions",
  "/budgets":      "Budgets",
  "/recurring":    "Recurring",
  "/table":        "Income Statement",
  "/income":       "Income Statement",
  "/rules":        "Merchant Rules",
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

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
        <div
          style={{
            width: 14,
            height: 14,
            border: "2px solid var(--fo-accent)",
            borderRadius: 2,
          }}
        />
      </div>

      {/* Nav items */}
      {NAV_ITEMS.map(({ href, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            style={{ position: "relative", display: "flex" }}
          >
            {/* Active indicator bar */}
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
                height: 44,
                borderRadius: 9,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: active ? "var(--fo-accent-soft)" : "transparent",
                color: active ? "var(--fo-accent)" : "var(--fo-muted)",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              <Icon size={20} strokeWidth={1.6} />
            </div>
          </Link>
        );
      })}

      {/* Spacer */}
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

function Topbar({ pathname }: { pathname: string }) {
  const title = PAGE_TITLES[pathname] ?? "FinanceOS";

  return (
    <div
      style={{
        height: 56,
        minHeight: 56,
        background: "var(--fo-card)",
        borderBottom: "1px solid var(--fo-hair)",
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-fo-serif)",
          fontSize: 20,
          fontWeight: 500,
          color: "var(--fo-ink)",
        }}
      >
        {title}
      </span>

      <input
        type="search"
        placeholder="Search…"
        style={{
          background: "var(--fo-soft)",
          border: "none",
          borderRadius: 7,
          padding: "7px 12px",
          fontSize: 13,
          width: 220,
          fontFamily: "var(--font-fo-sans)",
          color: "var(--fo-ink)",
          outline: "none",
        }}
      />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
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

        <main
          style={{
            flex: 1,
            overflowY: "auto",
            background: "var(--fo-bg)",
          }}
        >
          <div style={{ padding: 24 }}>{children}</div>
        </main>
      </div>
    </div>
  );
}
