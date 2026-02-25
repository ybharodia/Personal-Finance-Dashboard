"use client";

import { useState } from "react";

export type Preset =
  | "this-month"
  | "last-month"
  | "last-90"
  | "last-year"
  | "last-2-years"
  | "custom";

export type DateRange = { from: Date; to: Date; preset: Preset };

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function getPresetRange(preset: Preset): DateRange {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  switch (preset) {
    case "this-month": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from, to: tomorrow, preset };
    }
    case "last-month": {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from, to, preset };
    }
    case "last-90": {
      const from = new Date(today);
      from.setDate(from.getDate() - 90);
      return { from, to: tomorrow, preset };
    }
    case "last-year": {
      const from = new Date(today);
      from.setDate(from.getDate() - 365);
      return { from, to: tomorrow, preset };
    }
    case "last-2-years": {
      const from = new Date(today);
      from.setDate(from.getDate() - 730);
      return { from, to: tomorrow, preset };
    }
    case "custom":
      return {
        from: new Date(today.getFullYear(), today.getMonth(), 1),
        to: tomorrow,
        preset,
      };
  }
}

function toInputDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fromInputDate(s: string): Date {
  // Parse YYYY-MM-DD without timezone shift
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: "this-month", label: "This Month" },
  { key: "last-month", label: "Last Month" },
  { key: "last-90", label: "Last 90 Days" },
  { key: "last-year", label: "Last Year" },
  { key: "last-2-years", label: "Last 2 Years" },
  { key: "custom", label: "Custom Range" },
];

type Props = {
  value: DateRange;
  onChange: (range: DateRange) => void;
};

export default function DateRangeFilter({ value, onChange }: Props) {
  const [customFrom, setCustomFrom] = useState(toInputDate(value.from));
  const [customTo, setCustomTo] = useState(
    toInputDate(new Date(value.to.getTime() - 86400000))
  );

  function handlePreset(preset: Preset) {
    if (preset === "custom") {
      onChange({ ...value, preset });
      return;
    }
    onChange(getPresetRange(preset));
  }

  function handleCustomApply() {
    const from = fromInputDate(customFrom);
    // "to" is exclusive: add 1 day to the selected end date
    const toBase = fromInputDate(customTo);
    const to = new Date(toBase);
    to.setDate(to.getDate() + 1);
    onChange({ from, to, preset: "custom" });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => handlePreset(key)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            value.preset === key
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
          }`}
        >
          {label}
        </button>
      ))}

      {value.preset === "custom" && (
        <div className="flex items-center gap-2 ml-1">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button
            onClick={handleCustomApply}
            className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
