"use client";

import type { TimeClass } from "@/lib/types";

const options: { value: TimeClass; label: string }[] = [
  { value: "all", label: "All" },
  { value: "bullet", label: "Bullet" },
  { value: "blitz", label: "Blitz" },
  { value: "rapid", label: "Rapid" },
];

export default function TimeControlFilter({
  value,
  onChange,
}: {
  value: TimeClass;
  onChange: (v: TimeClass) => void;
}) {
  return (
    <div className="flex gap-1 bg-chess-card border border-chess-border rounded-lg p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            value === opt.value
              ? "bg-chess-accent text-white"
              : "text-gray-400 hover:text-white hover:bg-chess-border"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
