"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Chess, type Square } from "chess.js";
import type {
  OpeningRepertoire as OpeningRepertoireType,
  ChessComStats,
  PrepSuggestion,
} from "@/lib/types";
import {
  START_FEN,
  getNodeAtPath,
  childMovesToArrows,
  getRepertoireMoves,
  prepSuggestionsToArrows,
} from "@/lib/opening-tree";
import type { BoardArrow } from "@/lib/opening-tree";
import { ratingToBrackets } from "@/lib/analysis/prep";
import BoardPanel from "./BoardPanel";
import MoveExplorer from "./MoveExplorer";
import MoveBreadcrumb from "./MoveBreadcrumb";
import NodeActions from "./NodeActions";
import PrepExplorer from "./PrepExplorer";

// Dot style for empty destination squares
const MOVE_DOT_STYLE: Record<string, string | number> = {
  background: "radial-gradient(circle, rgba(0,0,0,0.25) 25%, transparent 25%)",
  borderRadius: "50%",
};

// Ring style for occupied destination squares (captures)
const CAPTURE_RING_STYLE: Record<string, string | number> = {
  background: "radial-gradient(circle, transparent 55%, rgba(0,0,0,0.25) 55%)",
  borderRadius: "50%",
};

// Highlight style for the selected piece's square
const SELECTED_SQUARE_STYLE: Record<string, string | number> = {
  backgroundColor: "rgba(255, 255, 0, 0.4)",
};

export default function OpeningRepertoire({
  openings,
  stats,
  projectId,
  onRefetchProject,
  initialTab: initialTabProp,
  hideColorTabs,
}: {
  openings: OpeningRepertoireType;
  stats?: ChessComStats;
  projectId?: string;
  onRefetchProject?: () => void;
  initialTab?: "white" | "black";
  hideColorTabs?: boolean;
}) {
  const [tab, setTab] = useState<"white" | "black">(initialTabProp ?? "white");
  const [path, setPath] = useState<number[]>([]);
  const [forwardStack, setForwardStack] = useState<number[][]>([]);
  const [hoveredChildIndex, setHoveredChildIndex] = useState<number | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [prepMode, setPrepMode] = useState(false);
  const [prepSuggestions, setPrepSuggestions] = useState<PrepSuggestion[]>([]);
  /** FEN override for viewing prep positions outside the opponent's tree */
  const [prepFen, setPrepFen] = useState<string | null>(null);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(360);

  const root = tab === "white" ? openings.asWhite : openings.asBlack;
  const currentNode = useMemo(() => getNodeAtPath(root, path), [root, path]);
  const currentFen = path.length === 0 ? START_FEN : currentNode.fen;

  // In the tree, tab="white" means the opponent played as White,
  // so the preparer is Black, and vice versa.
  const preparerColor: "white" | "black" = tab === "white" ? "black" : "white";

  // Derive rating and bracket from stats
  const opponentRating = useMemo(() => {
    if (!stats) return 1500;
    const rapid = stats.chess_rapid?.last?.rating;
    const blitz = stats.chess_blitz?.last?.rating;
    const bullet = stats.chess_bullet?.last?.rating;
    return rapid ?? blitz ?? bullet ?? 1500;
  }, [stats]);

  const ratingBrackets = useMemo(
    () => ratingToBrackets(opponentRating),
    [opponentRating],
  );

  // Determine if it's the preparer's turn at the current position
  const isPreparerTurn = useMemo(() => {
    // depth 0 = starting pos (white to move)
    // even depth = white to move, odd depth = black to move
    const whiteToMove = path.length % 2 === 0;
    return (
      (preparerColor === "white" && whiteToMove) ||
      (preparerColor === "black" && !whiteToMove)
    );
  }, [path.length, preparerColor]);

  // Show PrepExplorer when prep mode is on AND it's the preparer's turn
  const showPrepExplorer = prepMode && isPreparerTurn;

  // The FEN actually displayed (hover preview, prep position, or current)
  const displayFen =
    hoveredChildIndex != null
      ? (currentNode.children[hoveredChildIndex]?.fen ?? currentFen)
      : (prepFen ?? currentFen);

  // Arrows: show on current position, hide during hover preview
  const arrows: BoardArrow[] = useMemo(() => {
    if (hoveredChildIndex != null) return [];
    if (showPrepExplorer && prepSuggestions.length > 0) {
      return prepSuggestionsToArrows(currentFen, prepSuggestions);
    }
    return childMovesToArrows(currentFen, currentNode.children);
  }, [
    currentFen,
    currentNode.children,
    hoveredChildIndex,
    showPrepExplorer,
    prepSuggestions,
  ]);

  // Square styles: legal-move highlights for selected piece
  const squareStyles = useMemo(() => {
    const styles: Record<string, Record<string, string | number>> = {};
    if (!selectedSquare || hoveredChildIndex != null) return styles;

    styles[selectedSquare] = SELECTED_SQUARE_STYLE;

    const chess = new Chess(currentFen);
    const piece = chess.get(selectedSquare as Square);
    if (!piece) return styles;

    // Determine if the square has a piece on it (for capture ring vs dot)
    const targets = getRepertoireMoves(currentFen, selectedSquare, currentNode.children);
    for (const { to } of targets) {
      const targetPiece = chess.get(to as Square);
      styles[to] = targetPiece ? CAPTURE_RING_STYLE : MOVE_DOT_STYLE;
    }

    return styles;
  }, [selectedSquare, currentFen, currentNode.children, hoveredChildIndex]);

  // Reset all navigation state when switching tabs
  const switchTab = useCallback((newTab: "white" | "black") => {
    setTab(newTab);
    setPath([]);
    setForwardStack([]);
    setHoveredChildIndex(null);
    setSelectedSquare(null);
    setPrepSuggestions([]);
    setPrepFen(null);
  }, []);

  // Clear selection when navigating
  const navigateTo = useCallback((newPath: number[]) => {
    setPath(newPath);
    setForwardStack([]);
    setSelectedSquare(null);
    setHoveredChildIndex(null);
    setPrepFen(null);
  }, []);

  // Responsive board sizing
  useEffect(() => {
    const container = boardContainerRef.current;
    if (!container) return;

    const measure = () => {
      const width = container.clientWidth;
      if (width > 0) setBoardWidth(Math.min(width, 480));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const goBack = useCallback(() => {
    if (path.length === 0) return;
    setForwardStack((prev) => [path, ...prev]);
    setPath((prev) => prev.slice(0, -1));
    setSelectedSquare(null);
    setHoveredChildIndex(null);
  }, [path]);

  const goForward = useCallback(() => {
    if (forwardStack.length > 0) {
      const [next, ...rest] = forwardStack;
      setPath(next);
      setForwardStack(rest);
    } else if (currentNode.children.length > 0) {
      setPath((prev) => [...prev, 0]);
    }
    setSelectedSquare(null);
    setHoveredChildIndex(null);
  }, [forwardStack, currentNode]);

  const canGoForward = forwardStack.length > 0 || currentNode.children.length > 0;

  const goReset = useCallback(() => {
    if (path.length === 0) return;
    setForwardStack([path]);
    setPath([]);
    setSelectedSquare(null);
    setHoveredChildIndex(null);
  }, [path]);

  const selectMove = useCallback(
    (childIndex: number) => {
      navigateTo([...path, childIndex]);
    },
    [path, navigateTo],
  );

  const handlePieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string, _piece: string): boolean => {
      try {
        const chess = new Chess(currentFen);
        const move = chess.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: "q",
        });
        if (!move) return false;

        const childIndex = currentNode.children.findIndex(
          (child) => child.move === move.san,
        );
        if (childIndex === -1) return false;

        navigateTo([...path, childIndex]);
        return true;
      } catch {
        return false;
      }
    },
    [currentFen, currentNode, path, navigateTo],
  );

  const handleSquareClick = useCallback(
    (square: string) => {
      const chess = new Chess(currentFen);

      // If a piece is already selected, try to make a move to this square
      if (selectedSquare) {
        try {
          const move = chess.move({
            from: selectedSquare,
            to: square,
            promotion: "q",
          });
          if (move) {
            const childIndex = currentNode.children.findIndex(
              (child) => child.move === move.san,
            );
            if (childIndex !== -1) {
              navigateTo([...path, childIndex]);
              return;
            }
          }
        } catch {
          // Invalid move, fall through to selection logic
        }
      }

      // Select/deselect a piece
      const piece = chess.get(square as Square);
      if (piece && square !== selectedSquare) {
        // Check if this piece has any repertoire moves
        const targets = getRepertoireMoves(currentFen, square, currentNode.children);
        if (targets.length > 0) {
          setSelectedSquare(square);
          return;
        }
      }

      // Click on empty square or piece with no repertoire moves: clear
      setSelectedSquare(null);
    },
    [currentFen, currentNode, selectedSquare, path, navigateTo],
  );

  const handleHoverMove = useCallback((childIndex: number | null) => {
    setHoveredChildIndex(childIndex);
    if (childIndex != null) setSelectedSquare(null);
  }, []);

  // Callback for PrepExplorer to bubble up loaded suggestions (for arrows)
  const handlePrepSuggestionsLoaded = useCallback((suggestions: PrepSuggestion[]) => {
    setPrepSuggestions(suggestions);
  }, []);

  // Show a prep position on the board (for surprise moves or prep line clicks)
  // Empty string clears the preview back to the current position.
  const handlePlayPrepMove = useCallback((fen: string) => {
    setPrepFen(fen || null);
    setSelectedSquare(null);
    setHoveredChildIndex(null);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goBack, goForward]);

  return (
    <div className="bg-chess-card border border-chess-border rounded-xl p-6">
      {/* Header with title, tabs, and prep toggle */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h3 className="text-lg font-bold">Opening Repertoire</h3>
        <div className="flex items-center gap-3">
          {/* Prep mode toggle */}
          <button
            onClick={() => {
              setPrepMode((p) => !p);
              setPrepSuggestions([]);
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium transition-all border ${
              prepMode
                ? "bg-chess-accent/15 text-chess-accent border-chess-accent/40"
                : "bg-chess-bg text-gray-400 border-chess-border hover:text-white hover:border-gray-500"
            }`}
            title="Prep Mode: Find moves that exploit this opponent's weaknesses"
          >
            <span className="text-base leading-none">
              {prepMode ? "\u2694" : "\u2694"}
            </span>
            Prep
          </button>

          {/* Color tabs (hidden in prep project single-tree view) */}
          {!hideColorTabs && (
            <div className="flex gap-1 bg-chess-bg rounded-lg p-1">
              <button
                onClick={() => switchTab("white")}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  tab === "white"
                    ? "bg-white text-black"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                As White ({openings.asWhite.games})
              </button>
              <button
                onClick={() => switchTab("black")}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  tab === "black"
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                As Black ({openings.asBlack.games})
              </button>
            </div>
          )}
        </div>
      </div>

      {root.games === 0 ? (
        <div className="text-gray-500 text-center py-8">
          No games found for this filter.
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left panel: Board */}
          <div ref={boardContainerRef} className="w-full md:w-[360px] md:shrink-0">
            <BoardPanel
              fen={displayFen}
              orientation={tab}
              boardWidth={boardWidth}
              onPieceDrop={handlePieceDrop}
              onSquareClick={handleSquareClick}
              customArrows={arrows}
              customSquareStyles={squareStyles}
              canGoBack={path.length > 0}
              canGoForward={canGoForward}
              onBack={goBack}
              onForward={goForward}
              onReset={goReset}
            />
          </div>

          {/* Right panel: Move explorer */}
          <div className="flex-1 min-w-0 flex flex-col">
            <MoveBreadcrumb root={root} path={path} onNavigate={navigateTo} />

            {projectId && onRefetchProject && (
              <NodeActions
                projectId={projectId}
                currentNode={currentNode}
                onRefetchProject={onRefetchProject}
              />
            )}

            {prepMode && (
              <div className="text-xs text-chess-accent/70 mb-1 flex items-center gap-1">
                <span>{"\u2694"}</span>
                Prep mode &mdash;{" "}
                {isPreparerTurn
                  ? "showing prep suggestions (your turn)"
                  : "opponent's moves"}
              </div>
            )}

            <div className="flex-1 border border-chess-border rounded-lg overflow-hidden">
              <div className="max-h-[400px] overflow-y-auto">
                {showPrepExplorer ? (
                  <PrepExplorer
                    fen={currentFen}
                    currentNode={currentNode}
                    depth={path.length}
                    playerColor={preparerColor}
                    ratings={ratingBrackets}
                    speeds="blitz,rapid"
                    onHoverMove={handleHoverMove}
                    onSelectMove={selectMove}
                    onPlayPrepMove={handlePlayPrepMove}
                    onSuggestionsLoaded={handlePrepSuggestionsLoaded}
                  />
                ) : (
                  <MoveExplorer
                    node={currentNode}
                    depth={path.length}
                    onSelectMove={selectMove}
                    onHoverMove={handleHoverMove}
                    showPrepStatus={Boolean(projectId)}
                  />
                )}
              </div>
            </div>

            <div className="text-xs text-gray-600 mt-2">
              Click a move or drag pieces on the board &middot; Arrow keys to navigate
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
