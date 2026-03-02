"use client";

import type { LineAnalysisItem } from "./useLinesByFen";

export interface LineResultsProps {
  lines: LineAnalysisItem[];
  loading: boolean;
  error: string | null;
}

export default function LineResults({ lines, loading, error }: LineResultsProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-chess-border bg-chess-card p-6">
        <h3 className="font-semibold mb-3">Lines by practical difficulty</h3>
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
        <h3 className="font-semibold mb-2">Lines by practical difficulty</h3>
        <p className="text-sm text-gray-400">No lines yet. Run an analysis above.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-chess-border bg-chess-card overflow-hidden">
      <div className="px-4 py-3 border-b border-chess-border">
        <h3 className="font-semibold">Lines by practical difficulty</h3>
        <p className="text-sm text-gray-400 mt-0.5">
          <strong>Higher is better.</strong> The score combines how often the opponent
          enters the line, how hard each move is to find (eval + human error rate), and a
          penalty for lines where the opponent has many options. Sorted by score so the
          toughest lines to face appear first.
        </p>
      </div>
      <ul className="divide-y divide-chess-border" role="list">
        {lines.map((line, idx) => (
          <LineRow key={line.id} line={line} rank={idx + 1} />
        ))}
      </ul>
    </div>
  );
}

function LineRow({ line, rank }: { line: LineAnalysisItem; rank: number }) {
  const movesDisplay = Array.isArray(line.lineMoves)
    ? line.lineMoves.join(" ")
    : String(line.lineMoves ?? "");

  return (
    <li className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="flex h-7 w-7 items-center justify-center rounded bg-chess-border text-sm font-medium text-gray-300"
          aria-label={`Rank ${rank}`}
        >
          {rank}
        </span>
        <span className="font-mono text-chess-accent font-medium tabular-nums">
          {typeof line.score === "number" ? line.score.toFixed(1) : line.score}
        </span>
      </div>
      <p className="font-mono text-sm text-gray-300 break-all min-w-0">
        {movesDisplay || "—"}
      </p>
    </li>
  );
}
