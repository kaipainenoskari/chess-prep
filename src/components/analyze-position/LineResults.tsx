"use client";

import { getTerminalPracticalWinRate } from "@/lib/analysis/metrics";
import type { LineHumanMove } from "@/lib/analysis/metrics";
import { LINE_ANALYSIS_MIN_PRACTICAL_WIN_RATE } from "@/lib/config";
import type { LineAnalysisItem } from "./useLinesByFen";

function lineHumanFromMetrics(metrics: unknown): LineHumanMove[] | null {
  if (metrics == null || typeof metrics !== "object") return null;
  const m = metrics as { lineHuman?: unknown };
  if (!Array.isArray(m.lineHuman)) return null;
  return m.lineHuman as LineHumanMove[];
}

export interface LineResultsProps {
  lines: LineAnalysisItem[];
  loading: boolean;
  error: string | null;
  selectedLineId: string | null;
  onSelectLine: (line: LineAnalysisItem) => void;
}

export default function LineResults({
  lines,
  loading,
  error,
  selectedLineId,
  onSelectLine,
}: LineResultsProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-chess-border bg-chess-card p-6">
        <h3 className="font-semibold mb-3">Lines by practical chances</h3>
        <div className="animate-pulse space-y-3">
          <div className="h-10 bg-chess-border rounded" />
          <div className="h-10 bg-chess-border rounded" />
          <div className="h-10 bg-chess-border rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-chess-border bg-chess-card p-6">
        <h3 className="font-semibold mb-2">Lines</h3>
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-xl border border-chess-border bg-chess-card p-6">
        <h3 className="font-semibold mb-2">Lines by practical chances</h3>
        <p className="text-sm text-gray-400">No lines yet. Run an analysis above.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-chess-border bg-chess-card overflow-hidden">
      <div className="px-4 py-3 border-b border-chess-border">
        <h3 className="font-semibold">Lines by practical chances</h3>
        <p className="text-sm text-gray-400 mt-0.5">
          Practical win % at the end of the line (from population data). Shown only when ≥
          65%. Best probable lines where you’re doing well in practice.
        </p>
      </div>
      <ul className="divide-y divide-chess-border" role="list">
        {lines.map((line, idx) => (
          <LineRow
            key={line.id}
            line={line}
            rank={idx + 1}
            isSelected={selectedLineId === line.id}
            onSelect={() => onSelectLine(line)}
          />
        ))}
      </ul>
    </div>
  );
}

function LineRow({
  line,
  rank,
  isSelected,
  onSelect,
}: {
  line: LineAnalysisItem;
  rank: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const movesDisplay = Array.isArray(line.lineMoves)
    ? line.lineMoves.join(" ")
    : String(line.lineMoves ?? "");

  const lineHuman = lineHumanFromMetrics(line.metricsJson);
  const preparerColor: "white" | "black" = "white";
  const winRate =
    lineHuman != null ? getTerminalPracticalWinRate(lineHuman, preparerColor) : null;
  const showWinRate = winRate != null && winRate >= LINE_ANALYSIS_MIN_PRACTICAL_WIN_RATE;

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 cursor-pointer transition-colors ${
        isSelected
          ? "bg-chess-accent/15 border-l-4 border-chess-accent"
          : "hover:bg-chess-bg/50"
      }`}
    >
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="flex h-7 w-7 items-center justify-center rounded bg-chess-border text-sm font-medium text-gray-300"
          aria-label={`Rank ${rank}`}
        >
          {rank}
        </span>
        {showWinRate && (
          <span className="font-mono text-chess-accent font-medium tabular-nums">
            {Math.round(winRate * 100)}%
          </span>
        )}
      </div>
      <p className="font-mono text-sm text-gray-300 break-all min-w-0">
        {movesDisplay || "—"}
      </p>
    </li>
  );
}
