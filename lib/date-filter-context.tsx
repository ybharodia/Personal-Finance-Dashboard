"use client";

import { createContext, useContext, useState } from "react";

export type ShellPreset =
  | "last-7"
  | "last-30"
  | "month-to-date"
  | "quarter-to-date"
  | "year-to-date"
  | "last-12-months"
  | "all-time"
  | "custom";

export type ShellDateRange = { from: Date; to: Date; preset: ShellPreset; label: string };

export type SyncStatus = "idle" | "syncing" | "success" | "error";

export type DashboardActions = {
  onDownload: () => void;
  onSync: () => void;
  syncStatus: SyncStatus;
  syncError: string | null;
};

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function tomorrow(): Date {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() + 1);
  return d;
}

export function getShellPresetRange(preset: ShellPreset): ShellDateRange {
  const today = startOfDay(new Date());
  const tom = tomorrow();

  switch (preset) {
    case "last-7": {
      const from = new Date(today);
      from.setDate(from.getDate() - 7);
      return { from, to: tom, preset, label: "Last 7 days" };
    }
    case "last-30": {
      const from = new Date(today);
      from.setDate(from.getDate() - 30);
      return { from, to: tom, preset, label: "Last 30 days" };
    }
    case "month-to-date": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from, to: tom, preset, label: "Month to date" };
    }
    case "quarter-to-date": {
      const qMonth = Math.floor(today.getMonth() / 3) * 3;
      const from = new Date(today.getFullYear(), qMonth, 1);
      return { from, to: tom, preset, label: "Quarter to date" };
    }
    case "year-to-date": {
      const from = new Date(today.getFullYear(), 0, 1);
      return { from, to: tom, preset, label: "Year to date" };
    }
    case "last-12-months": {
      const from = new Date(today);
      from.setFullYear(from.getFullYear() - 1);
      return { from, to: tom, preset, label: "Last 12 months" };
    }
    case "all-time":
      return { from: new Date(2000, 0, 1), to: tom, preset, label: "All time" };
    case "custom": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from, to: tom, preset, label: "Custom" };
    }
  }
}

type DateFilterCtx = {
  dateRange: ShellDateRange;
  setDateRange: (r: ShellDateRange) => void;
  dashboardActions: DashboardActions | null;
  setDashboardActions: (a: DashboardActions | null) => void;
};

export const DateFilterContext = createContext<DateFilterCtx | null>(null);

export function useDateFilter(): DateFilterCtx {
  const ctx = useContext(DateFilterContext);
  if (!ctx) throw new Error("useDateFilter must be used within AppShell");
  return ctx;
}

export function DateFilterProvider({ children }: { children: React.ReactNode }) {
  const [dateRange, setDateRange] = useState<ShellDateRange>(() =>
    getShellPresetRange("month-to-date")
  );
  const [dashboardActions, setDashboardActions] = useState<DashboardActions | null>(null);

  return (
    <DateFilterContext.Provider value={{ dateRange, setDateRange, dashboardActions, setDashboardActions }}>
      {children}
    </DateFilterContext.Provider>
  );
}
