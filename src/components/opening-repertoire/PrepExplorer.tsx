"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  PrepSuggestion,
  PrepTag,
  PrepLineMove,
  OpeningNode,
  OpponentMoveInfo,
} from "@/lib/types";
import { formatMoveLabel } from "@/lib/opening-tree";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const TAG_STYLES: Record<PrepTag, string> = {
  surprise: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  weakness: "bg-red-500/15 text-red-400 border-red-500/30",
  gambit: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  sound: "bg-green-500/15 text-green-400 border-green-500/30",
  speculative: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

const TAG_LABELS: Record<PrepTag, string> = {
  surprise: "Surprise",
  weakness: "Weakness",
  gambit: "Gambit",
  sound: "Sound",
  speculative: "Speculative",
};

function TagChip({ tag }: { tag: PrepTag }) {
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${TAG_STYLES[tag]}`}
    >
      {TAG_LABELS[tag]}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  let colorClass = "text-gray-400 bg-gray-700";
  if (score >= 70) colorClass = "text-green-400 bg-green-500/15";
  else if (score >= 50) colorClass = "text-yellow-400 bg-yellow-500/15";
  else if (score >= 30) colorClass = "text-orange-400 bg-orange-500/15";

  return (
    <span
      className={`text-xs font-bold px-2 py-0.5 rounded-full tabular-nums ${colorClass}`}
    >
      {score}
    </span>
  );
}

function PrepLine({
  line,
  preparerColor,
  onClickMove,
}: {
  line: PrepLineMove[];
  preparerColor: "white" | "black";
  onClickMove: (fen: string) => void;
}) {
  if (line.length === 0) return null;

  // Build move pairs for display
  const entries: { label: string; fen: string; isPlayerMove: boolean }[] = [];

  // Determine the starting move number from the FEN of the first move's parent
  // We use a simple heuristic: the first move in the line
  let halfMoveIdx = preparerColor === "white" ? 0 : 1;

  for (const m of line) {
    entries.push({
      label: formatMoveLabel(m.move, halfMoveIdx),
      fen: m.fen,
      isPlayerMove: m.isPlayerMove,
    });
    halfMoveIdx++;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-2 px-3 py-2 bg-chess-bg/50 rounded-lg border border-chess-border/50">
      {entries.map((entry, i) => (
        <button
          key={i}
          onClick={() => onClickMove(entry.fen)}
          className={`font-mono text-xs px-1 py-0.5 rounded transition-colors ${
            entry.isPlayerMove
              ? "text-chess-accent hover:bg-chess-accent/10 font-semibold"
              : "text-gray-400 hover:bg-white/5"
          }`}
          title={entry.isPlayerMove ? "Your move" : "Expected reply"}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 p-3 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-12 h-5 bg-chess-bg rounded" />
            <div className="w-20 h-5 bg-chess-bg rounded" />
            <div className="flex-1" />
            <div className="w-8 h-5 bg-chess-bg rounded-full" />
          </div>
          <div className="w-3/4 h-3 bg-chess-bg rounded" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface PrepExplorerProps {
  fen: string;
  currentNode: OpeningNode;
  depth: number;
  playerColor: "white" | "black";
  ratings: string;
  speeds: string;
  onHoverMove: (childIndex: number | null) => void;
  onSelectMove: (childIndex: number) => void;
  /** Called when a prep suggestion is played (may not be in the opponent tree) */
  onPlayPrepMove?: (fen: string) => void;
  /** Called when suggestions are loaded, so parent can update arrows */
  onSuggestionsLoaded?: (suggestions: PrepSuggestion[]) => void;
}

export default function PrepExplorer({
  fen,
  currentNode,
  depth,
  playerColor,
  ratings,
  speeds,
  onHoverMove,
  onSelectMove,
  onPlayPrepMove,
  onSuggestionsLoaded,
}: PrepExplorerProps) {
  const [suggestions, setSuggestions] = useState<PrepSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setExpandedIndex(null);

    try {
      // Build opponent moves from current node's children
      const opponentMoves: OpponentMoveInfo[] = currentNode.children.map((child) => ({
        move: child.move,
        games: child.games,
        winRate: child.winRate,
      }));

      const res = await fetch("/api/prep/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen,
          ratings,
          speeds,
          playerColor,
          opponentMoves,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }

      const data = (await res.json()) as PrepSuggestion[];
      setSuggestions(data);
      onSuggestionsLoaded?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load prep suggestions");
    } finally {
      setLoading(false);
    }
  }, [fen, ratings, speeds, playerColor, currentNode.children, onSuggestionsLoaded]);

  // Fetch suggestions whenever position changes
  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleClickSuggestion = useCallback(
    (suggestion: PrepSuggestion) => {
      // If the move exists in the opponent tree, navigate there
      const childIndex = currentNode.children.findIndex(
        (c) => c.move === suggestion.move,
      );
      if (childIndex !== -1) {
        onSelectMove(childIndex);
      } else if (suggestion.line.length > 0 && onPlayPrepMove) {
        // Move is not in the tree — jump to the position after the move
        onPlayPrepMove(suggestion.line[0].fen);
      }
    },
    [currentNode.children, onSelectMove, onPlayPrepMove],
  );

  const handleHoverSuggestion = useCallback(
    (suggestion: PrepSuggestion | null) => {
      if (!suggestion) {
        onHoverMove(null);
        // Clear any prep-FEN preview when mouse leaves
        if (onPlayPrepMove) onPlayPrepMove("");
        return;
      }
      // If it's a tree move, use the tree hover
      const childIndex = currentNode.children.findIndex(
        (c) => c.move === suggestion.move,
      );
      if (childIndex !== -1) {
        onHoverMove(childIndex);
      } else if (suggestion.line.length > 0 && onPlayPrepMove) {
        // Surprise move — show the position on the board via prepFen
        onPlayPrepMove(suggestion.line[0].fen);
      } else {
        onHoverMove(null);
      }
    },
    [currentNode.children, onHoverMove, onPlayPrepMove],
  );

  const handleLineClick = useCallback(
    (lineFen: string) => {
      if (onPlayPrepMove) onPlayPrepMove(lineFen);
    },
    [onPlayPrepMove],
  );

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <div className="text-red-400 text-sm mb-2">{error}</div>
        <button
          onClick={fetchSuggestions}
          className="text-xs text-chess-accent hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <div className="text-2xl mb-2">&#9881;</div>
        <span className="text-sm">No prep suggestions</span>
        <span className="text-xs text-gray-600 mt-1">
          Not enough population data for this position
        </span>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2 text-xs text-gray-500 border-b border-chess-border bg-chess-bg/50">
        <span className="w-[72px] shrink-0">Move</span>
        <span className="flex-1 min-w-[80px]">Analysis</span>
        <span className="w-12 text-right shrink-0">Score</span>
      </div>

      {/* Suggestion rows */}
      {suggestions.map((suggestion, i) => {
        const isExpanded = expandedIndex === i;
        const hasLine = suggestion.line.length > 0;

        return (
          <div
            key={`${suggestion.move}-${i}`}
            className="border-b border-chess-border/40"
          >
            <button
              onClick={() => handleClickSuggestion(suggestion)}
              onMouseEnter={() => handleHoverSuggestion(suggestion)}
              onMouseLeave={() => handleHoverSuggestion(null)}
              className="flex items-center gap-3 px-3 py-2.5 w-full text-left transition-colors hover:bg-white/5 cursor-pointer group"
            >
              {/* Move name */}
              <span className="font-mono font-semibold text-sm text-white w-[72px] shrink-0 group-hover:text-chess-accent transition-colors">
                {formatMoveLabel(suggestion.move, depth)}
              </span>

              {/* Tags + reasoning */}
              <div className="flex-1 min-w-[80px] space-y-1">
                <div className="flex flex-wrap items-center gap-1">
                  {suggestion.tags.map((tag) => (
                    <TagChip key={tag} tag={tag} />
                  ))}
                  {suggestion.opponentGames > 0 && (
                    <span className="text-[10px] text-gray-500 ml-1">
                      {suggestion.opponentGames} opp. games
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400 leading-tight">
                  {suggestion.reasoning}
                </div>
              </div>

              {/* Score */}
              <div className="w-12 text-right shrink-0">
                <ScoreBadge score={suggestion.score} />
              </div>
            </button>

            {/* Expand/collapse line */}
            {hasLine && (
              <div className="px-3 pb-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedIndex(isExpanded ? null : i);
                  }}
                  className="text-[10px] text-gray-500 hover:text-chess-accent transition-colors"
                >
                  {isExpanded ? "Hide line" : "Show prep line"}
                  {" \u203A"}
                </button>
                {isExpanded && (
                  <PrepLine
                    line={suggestion.line}
                    preparerColor={playerColor}
                    onClickMove={handleLineClick}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
