"use client";

import { useState, useCallback, useRef } from "react";
import type { DateRange } from "@/lib/types";

export interface DateRangeValue {
  range: DateRange;
  /** ISO date string (YYYY-MM-DD) for custom selection */
  customDate?: string;
}

const PRESETS: { value: DateRange; label: string }[] = [
  { value: "1m", label: "1 mo" },
  { value: "3m", label: "3 mo" },
  { value: "6m", label: "6 mo" },
  { value: "all", label: "All" },
];

const MONTHS_MAP: Record<string, number> = {
  "1m": 1,
  "3m": 3,
  "6m": 6,
};

/**
 * Convert a DateRangeValue into a Unix timestamp (seconds) for the API.
 * Returns null for "all" (no filter).
 */
export function dateRangeToSince(value: DateRangeValue): number | null {
  if (value.range === "all") return null;

  if (value.range === "custom" && value.customDate) {
    const d = new Date(value.customDate);
    if (!isNaN(d.getTime())) {
      return Math.floor(d.getTime() / 1000);
    }
    return null;
  }

  const months = MONTHS_MAP[value.range];
  if (months) {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return Math.floor(d.getTime() / 1000);
  }

  return null;
}

/** Human-readable label for the current selection (used in footer, etc.) */
export function dateRangeLabel(value: DateRangeValue): string {
  if (value.range === "all") return "all available data";
  if (value.range === "custom" && value.customDate) {
    return `games since ${value.customDate}`;
  }
  const months = MONTHS_MAP[value.range];
  if (months) return `the last ${months} month${months > 1 ? "s" : ""}`;
  return "all available data";
}

/**
 * How many months of archives the backend should fetch.
 * For "all" or custom dates that may reach far back, fetch the maximum (24).
 * For presets, fetch at least that many months (with a buffer).
 */
export function dateRangeToMonths(value: DateRangeValue): number {
  if (value.range === "all") return 24;
  if (value.range === "custom" && value.customDate) {
    const d = new Date(value.customDate);
    if (!isNaN(d.getTime())) {
      const diffMs = Date.now() - d.getTime();
      const diffMonths = Math.ceil(diffMs / (30.44 * 24 * 60 * 60 * 1000));
      return Math.min(Math.max(diffMonths + 1, 1), 24);
    }
    return 24;
  }
  const months = MONTHS_MAP[value.range];
  return months ?? 6;
}

export default function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
}) {
  const [customExpanded, setCustomExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Show the date input when custom is active (either via prop or local toggle)
  const showCustom = value.range === "custom" || customExpanded;

  const handlePreset = useCallback(
    (preset: DateRange) => {
      setCustomExpanded(false);
      onChange({ range: preset });
    },
    [onChange],
  );

  const handleCustomToggle = useCallback(() => {
    if (showCustom) {
      // Already showing custom picker — collapse and go back to 6m
      setCustomExpanded(false);
      onChange({ range: "6m" });
    } else {
      setCustomExpanded(true);
      // Default custom date to 3 months ago
      const d = new Date();
      d.setMonth(d.getMonth() - 3);
      const iso = d.toISOString().split("T")[0];
      onChange({ range: "custom", customDate: iso });
      // Focus the input after render
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [showCustom, onChange]);

  const handleDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ range: "custom", customDate: e.target.value });
    },
    [onChange],
  );

  const isCustomActive = value.range === "custom";

  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-1 bg-chess-card border border-chess-border rounded-lg p-1">
        {PRESETS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handlePreset(opt.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              value.range === opt.value
                ? "bg-chess-accent text-white"
                : "text-gray-400 hover:text-white hover:bg-chess-border"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <button
          onClick={handleCustomToggle}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isCustomActive
              ? "bg-chess-accent text-white"
              : "text-gray-400 hover:text-white hover:bg-chess-border"
          }`}
          title="Pick a custom start date"
        >
          Custom
        </button>
      </div>

      {showCustom && (
        <input
          ref={inputRef}
          type="date"
          value={value.customDate ?? ""}
          onChange={handleDateChange}
          max={new Date().toISOString().split("T")[0]}
          className="ml-1 px-2 py-1.5 rounded-md text-sm bg-chess-card border border-chess-border text-white focus:outline-none focus:border-chess-accent transition-colors [color-scheme:dark]"
        />
      )}
    </div>
  );
}
