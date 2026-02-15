"use client";

import type { OpeningNode } from "@/lib/types";
import { formatMoveLabel } from "@/lib/opening-tree";
import WinRateBar from "@/components/WinRateBar";
import NodeStatusBadge from "./NodeStatusBadge";

// ---- Small display components kept co-located ----

function FrequencyBar({ ratio }: { ratio: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-chess-bg rounded-full overflow-hidden min-w-[40px]">
        <div
          className="h-full bg-chess-accent/60 rounded-full"
          style={{ width: `${Math.max(Math.round(ratio * 100), 2)}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 tabular-nums w-8 text-right shrink-0">
        {Math.round(ratio * 100)}%
      </span>
    </div>
  );
}

function DeltaChip({ delta }: { delta: number }) {
  const rounded = Math.round(delta);
  const isPositive = rounded > 0;
  const isNeutral = Math.abs(rounded) <= 5;

  if (isNeutral) {
    return (
      <span className="text-xs text-gray-500 tabular-nums">
        {rounded >= 0 ? "+" : ""}
        {rounded}%
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded tabular-nums ${
        isPositive ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"
      }`}
    >
      {isPositive ? "\u25B2" : "\u25BC"} {isPositive ? "+" : ""}
      {rounded}%
    </span>
  );
}

// ---- Main explorer ----

interface MoveExplorerProps {
  node: OpeningNode;
  depth: number;
  onSelectMove: (childIndex: number) => void;
  onHoverMove: (childIndex: number | null) => void;
  showPrepStatus?: boolean;
}

export default function MoveExplorer({
  node,
  depth,
  onSelectMove,
  onHoverMove,
  showPrepStatus = false,
}: MoveExplorerProps) {
  const children = node.children;
  const totalGames = children.reduce((sum, c) => sum + c.games, 0);

  if (children.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <div className="text-2xl mb-2">&#9814;</div>
        <span className="text-sm">End of repertoire</span>
        <span className="text-xs text-gray-600 mt-1">No more book moves from here</span>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2 text-xs text-gray-500 border-b border-chess-border bg-chess-bg/50">
        <span className="w-[72px] shrink-0">Move</span>
        <span className="flex-1 min-w-[80px]">Played</span>
        <span className="w-[80px] shrink-0">Result</span>
        <span className="w-10 text-right shrink-0">Win%</span>
        <span className="w-14 text-right shrink-0">vs Avg</span>
        {showPrepStatus && <span className="w-6 shrink-0" />}
      </div>

      {/* Rows */}
      {children.map((child, i) => {
        const winRate = Math.round(child.winRate * 100);
        const frequency = totalGames > 0 ? child.games / totalGames : 0;

        const rowBg =
          winRate >= 55
            ? "hover:bg-green-500/5"
            : winRate <= 45
              ? "hover:bg-red-500/5"
              : "hover:bg-white/5";

        const transpositionExtra =
          child.mergedGames != null && child.mergedGames > child.games
            ? child.mergedGames - child.games
            : 0;

        return (
          <button
            key={`${child.move}-${i}`}
            onClick={() => onSelectMove(i)}
            onMouseEnter={() => onHoverMove(i)}
            onMouseLeave={() => onHoverMove(null)}
            className={`flex items-center gap-3 px-3 py-2.5 w-full text-left transition-colors border-b border-chess-border/40 ${rowBg} cursor-pointer group`}
          >
            {/* Move */}
            <span className="font-mono font-semibold text-sm text-white w-[72px] shrink-0 group-hover:text-chess-accent transition-colors">
              {formatMoveLabel(child.move, depth)}
            </span>

            {/* Frequency */}
            <div className="flex-1 min-w-[80px] flex items-center gap-2">
              <FrequencyBar ratio={frequency} />
              <span className="text-xs text-gray-600 tabular-nums shrink-0">
                {child.games}
                {transpositionExtra > 0 && (
                  <span
                    className="text-gray-500 ml-0.5"
                    title={`+${transpositionExtra} games reach this position via transposition`}
                  >
                    (+{transpositionExtra})
                  </span>
                )}
              </span>
            </div>

            {/* W/D/L */}
            <div className="w-[80px] shrink-0">
              <WinRateBar
                wins={child.wins}
                draws={child.draws}
                losses={child.losses}
                showLabels={false}
                height="h-2"
              />
            </div>

            {/* Win% */}
            <span
              className={`text-sm font-bold tabular-nums w-10 text-right shrink-0 ${
                winRate >= 55
                  ? "text-green-400"
                  : winRate <= 45
                    ? "text-red-400"
                    : "text-gray-300"
              }`}
            >
              {winRate}%
            </span>

            {/* Delta */}
            <div className="w-14 text-right shrink-0">
              {child.delta != null ? (
                <DeltaChip delta={child.delta} />
              ) : (
                <span className="text-xs text-gray-700">&mdash;</span>
              )}
            </div>

            {/* Prep status */}
            {showPrepStatus && (
              <div className="w-6 shrink-0 flex justify-center">
                <NodeStatusBadge
                  status={child.analysisStatus}
                  trapCount={child.trapCount}
                />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
