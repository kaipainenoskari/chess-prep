"use client";

import { useState } from "react";
import type {
  OpeningNode,
  OpeningRepertoire as OpeningRepertoireType,
} from "@/lib/types";

function WinBar({
  wins,
  draws,
  games,
}: {
  wins: number;
  draws: number;
  losses: number;
  games: number;
}) {
  if (games === 0) return null;
  const w = (wins / games) * 100;
  const d = (draws / games) * 100;
  return (
    <div className="flex h-3 rounded-full overflow-hidden w-24">
      <div className="bg-green-500" style={{ width: `${w}%` }} />
      <div className="bg-gray-400" style={{ width: `${d}%` }} />
      <div className="bg-red-500" style={{ width: `${100 - w - d}%` }} />
    </div>
  );
}

function TreeNode({ node, depth = 0 }: { node: OpeningNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const moveNum = Math.floor(depth / 2) + 1;
  const isWhiteMove = depth % 2 === 0;
  const moveLabel = isWhiteMove
    ? `${moveNum}. ${node.move}`
    : `${moveNum}... ${node.move}`;
  const winRate = Math.round(node.winRate * 100);

  return (
    <div className={depth > 0 ? "ml-4 border-l border-chess-border pl-3" : ""}>
      {node.move !== "root" && (
        <div
          className="flex items-center gap-3 py-1.5 cursor-pointer hover:bg-chess-bg/50 rounded px-2 -mx-2 group"
          onClick={() => setExpanded(!expanded)}
        >
          {hasChildren ? (
            <span
              className={`text-xs text-gray-500 transition-transform ${expanded ? "rotate-90" : ""}`}
            >
              &#9654;
            </span>
          ) : (
            <span className="text-xs text-gray-700 w-3">&#8226;</span>
          )}

          <span className="font-mono font-semibold text-sm min-w-[80px]">
            {moveLabel}
          </span>

          <span className="text-xs text-gray-400">{node.games} games</span>

          <WinBar
            wins={node.wins}
            draws={node.draws}
            losses={node.losses}
            games={node.games}
          />

          <span
            className={`text-xs font-bold min-w-[40px] text-right ${
              winRate >= 55
                ? "text-green-400"
                : winRate <= 45
                  ? "text-red-400"
                  : "text-gray-400"
            }`}
          >
            {winRate}%
          </span>

          {node.populationWinRate != null && node.delta != null && (
            <span
              className={`text-xs ${
                node.delta > 5
                  ? "text-green-400"
                  : node.delta < -5
                    ? "text-red-400"
                    : "text-gray-500"
              }`}
            >
              ({node.delta > 0 ? "+" : ""}
              {Math.round(node.delta)}% vs avg)
            </span>
          )}
        </div>
      )}

      {(expanded || node.move === "root") && hasChildren && (
        <div>
          {node.children.map((child, i) => (
            <TreeNode
              key={`${child.move}-${i}`}
              node={child}
              depth={node.move === "root" ? 0 : depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OpeningRepertoire({
  openings,
}: {
  openings: OpeningRepertoireType;
}) {
  const [tab, setTab] = useState<"white" | "black">("white");
  const root = tab === "white" ? openings.asWhite : openings.asBlack;

  return (
    <div className="bg-chess-card border border-chess-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold">Opening Repertoire</h3>
        <div className="flex gap-1 bg-chess-bg rounded-lg p-1">
          <button
            onClick={() => setTab("white")}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              tab === "white" ? "bg-white text-black" : "text-gray-400 hover:text-white"
            }`}
          >
            As White ({openings.asWhite.games})
          </button>
          <button
            onClick={() => setTab("black")}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              tab === "black"
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            As Black ({openings.asBlack.games})
          </button>
        </div>
      </div>

      {root.games === 0 ? (
        <div className="text-gray-500 text-center py-8">
          No games found for this filter.
        </div>
      ) : (
        <div className="max-h-[500px] overflow-y-auto pr-2">
          <div className="flex items-center gap-3 text-xs text-gray-500 mb-2 px-2">
            <span className="w-3" />
            <span className="min-w-[80px]">Move</span>
            <span>Games</span>
            <span className="w-24">W/D/L</span>
            <span className="min-w-[40px] text-right">Win%</span>
          </div>
          <TreeNode node={root} />
        </div>
      )}
    </div>
  );
}
