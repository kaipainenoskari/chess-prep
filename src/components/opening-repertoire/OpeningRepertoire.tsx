"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Chess, type Square } from "chess.js";
import type { OpeningRepertoire as OpeningRepertoireType } from "@/lib/types";
import {
  START_FEN,
  getNodeAtPath,
  childMovesToArrows,
  getRepertoireMoves,
} from "@/lib/opening-tree";
import type { BoardArrow } from "@/lib/opening-tree";
import { normalizeFenForLookup, fenAfterUciMoves } from "@/lib/fen";
import {
  LineResults,
  JobStatusCard,
  LineAnalysisOptionsForm,
  getDefaultLineAnalysisOptions,
  useLinesByFen,
  useAnalyzePosition,
  useJobStatus,
} from "@/components/analyze-position";
import type { LineAnalysisItem } from "@/components/analyze-position/useLinesByFen";
import BoardPanel from "./BoardPanel";
import MoveExplorer from "./MoveExplorer";
import MoveBreadcrumb from "./MoveBreadcrumb";

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
  initialTab: initialTabProp,
}: {
  openings: OpeningRepertoireType;
  initialTab?: "white" | "black";
}) {
  const [tab, setTab] = useState<"white" | "black">(initialTabProp ?? "white");
  const [path, setPath] = useState<number[]>([]);
  const [forwardStack, setForwardStack] = useState<number[][]>([]);
  const [hoveredChildIndex, setHoveredChildIndex] = useState<number | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  /** When true, right panel shows lines we've found for this position instead of move tree */
  const [linesViewMode, setLinesViewMode] = useState(false);
  /** When set, board shows this line and step index; Prev/Next step through the line */
  const [selectedLine, setSelectedLine] = useState<LineAnalysisItem | null>(null);
  const [lineStepIndex, setLineStepIndex] = useState(0);
  const [lineAnalysisOptions, setLineAnalysisOptions] = useState(() =>
    getDefaultLineAnalysisOptions(),
  );
  const [lineOptionsOpen, setLineOptionsOpen] = useState(false);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(360);

  const root = tab === "white" ? openings.asWhite : openings.asBlack;
  const currentNode = useMemo(() => getNodeAtPath(root, path), [root, path]);
  const currentFen = path.length === 0 ? START_FEN : currentNode.fen;
  const normalizedCurrentFen = useMemo(
    () => normalizeFenForLookup(currentFen),
    [currentFen],
  );

  const {
    lines,
    loading: linesLoading,
    error: linesError,
    refetch: refetchLines,
  } = useLinesByFen(linesViewMode ? normalizedCurrentFen : null);
  const {
    jobId: linesJobId,
    submit: submitFindLines,
    loading: findLinesLoading,
    error: findLinesError,
  } = useAnalyzePosition();
  const {
    state: linesJobState,
    progress: linesJobProgress,
    failedReason: linesJobFailedReason,
    error: linesJobError,
    result: linesJobResult,
  } = useJobStatus(linesJobId);

  const lastRefetchedJobIdRef = useRef<string | null>(null);
  useEffect(() => {
    lastRefetchedJobIdRef.current = null;
  }, [linesJobId]);
  useEffect(() => {
    if (
      linesViewMode &&
      linesJobState === "completed" &&
      linesJobResult != null &&
      linesJobId &&
      lastRefetchedJobIdRef.current !== linesJobId
    ) {
      lastRefetchedJobIdRef.current = linesJobId;
      void refetchLines();
    }
  }, [linesViewMode, linesJobState, linesJobResult, linesJobId, refetchLines]);

  // When playing a line: FEN after first lineStepIndex moves; fallback to root if invalid
  const lineFen = useMemo(() => {
    if (!selectedLine) return null;
    const moves = Array.isArray(selectedLine.lineMoves) ? selectedLine.lineMoves : [];
    const fen = fenAfterUciMoves(selectedLine.rootFen, moves, lineStepIndex);
    return fen ?? normalizeFenForLookup(selectedLine.rootFen);
  }, [selectedLine, lineStepIndex]);

  // The FEN actually displayed (line playback, hover preview, or tree current)
  const displayFen =
    lineFen != null
      ? lineFen
      : hoveredChildIndex != null
        ? (currentNode.children[hoveredChildIndex]?.fen ?? currentFen)
        : currentFen;

  // Arrows: when playing a line show next move; else tree moves; hide during hover preview
  const arrows: BoardArrow[] = useMemo(() => {
    if (hoveredChildIndex != null) return [];
    if (selectedLine && Array.isArray(selectedLine.lineMoves)) {
      const moves = selectedLine.lineMoves;
      if (lineStepIndex < moves.length) {
        const uci = moves[lineStepIndex].trim().toLowerCase();
        if (uci.length >= 4) {
          const from = uci.slice(0, 2);
          const to = uci.slice(2, 4);
          return [[from, to, "rgba(255, 170, 0, 0.8)"]];
        }
      }
      return [];
    }
    return childMovesToArrows(currentFen, currentNode.children);
  }, [selectedLine, lineStepIndex, currentFen, currentNode.children, hoveredChildIndex]);

  // Square styles: legal-move highlights for selected piece (none when playing a line)
  const squareStyles = useMemo(() => {
    const styles: Record<string, Record<string, string | number>> = {};
    if (selectedLine != null || !selectedSquare || hoveredChildIndex != null)
      return styles;

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
  }, [selectedLine, selectedSquare, currentFen, currentNode.children, hoveredChildIndex]);

  // Reset all navigation state when switching tabs
  const switchTab = useCallback((newTab: "white" | "black") => {
    setTab(newTab);
    setPath([]);
    setForwardStack([]);
    setHoveredChildIndex(null);
    setSelectedSquare(null);
    setSelectedLine(null);
  }, []);

  // Clear selection when navigating
  const navigateTo = useCallback((newPath: number[]) => {
    setPath(newPath);
    setForwardStack([]);
    setSelectedSquare(null);
    setHoveredChildIndex(null);
    setSelectedLine(null);
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

  const lineMovesLength =
    selectedLine && Array.isArray(selectedLine.lineMoves)
      ? selectedLine.lineMoves.length
      : 0;
  const lineCanGoBack = selectedLine != null && lineStepIndex > 0;
  const lineCanGoForward = selectedLine != null && lineStepIndex < lineMovesLength;
  const lineStepBack = useCallback(() => {
    if (lineCanGoBack) setLineStepIndex((i) => i - 1);
  }, [lineCanGoBack]);
  const lineStepForward = useCallback(() => {
    if (lineCanGoForward) setLineStepIndex((i) => i + 1);
  }, [lineCanGoForward]);

  const boardCanGoBack = selectedLine != null ? lineCanGoBack : path.length > 0;
  const boardCanGoForward = selectedLine != null ? lineCanGoForward : canGoForward;
  const boardOnBack = selectedLine != null ? lineStepBack : goBack;
  const boardOnForward = selectedLine != null ? lineStepForward : goForward;

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
      if (selectedLine != null) return false;
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
    [selectedLine, currentFen, currentNode, path, navigateTo],
  );

  const handleSquareClick = useCallback(
    (square: string) => {
      if (selectedLine != null) {
        setSelectedSquare(null);
        return;
      }
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
    [selectedLine, currentFen, currentNode, selectedSquare, path, navigateTo],
  );

  const handleHoverMove = useCallback((childIndex: number | null) => {
    setHoveredChildIndex(childIndex);
    if (childIndex != null) setSelectedSquare(null);
  }, []);

  // Keyboard navigation (line step when a line is selected, else tree)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        boardOnBack();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        boardOnForward();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [boardOnBack, boardOnForward]);

  return (
    <div className="bg-chess-card border border-chess-border rounded-xl p-6">
      {/* Header with title, tabs, and prep toggle */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h3 className="text-lg font-bold">Opening Repertoire</h3>
        <div className="flex items-center gap-3">
          {/* Show lines we've found for this position */}
          <button
            onClick={() => {
              setLinesViewMode((v) => {
                if (v) setSelectedLine(null);
                return !v;
              });
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium transition-all border ${
              linesViewMode
                ? "bg-chess-accent/15 text-chess-accent border-chess-accent/40"
                : "bg-chess-bg text-gray-400 border-chess-border hover:text-white hover:border-gray-500"
            }`}
            title="Show lines we've found for this position"
          >
            {linesViewMode ? "Show tree" : "Show lines we've found"}
          </button>

          {/* Color tabs */}
          <div className="flex gap-1 bg-chess-bg rounded-lg p-1">
            <button
              onClick={() => switchTab("white")}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                tab === "white" ? "bg-white text-black" : "text-gray-400 hover:text-white"
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
              canGoBack={boardCanGoBack}
              canGoForward={boardCanGoForward}
              onBack={boardOnBack}
              onForward={boardOnForward}
              onReset={goReset}
            />
          </div>

          {/* Right panel: Move explorer */}
          <div className="flex-1 min-w-0 flex flex-col">
            <MoveBreadcrumb root={root} path={path} onNavigate={navigateTo} />

            {linesViewMode ? (
              <div className="flex-1 flex flex-col gap-3 min-h-0">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        submitFindLines(normalizedCurrentFen, lineAnalysisOptions)
                      }
                      disabled={findLinesLoading}
                      className="px-3 py-1.5 rounded-lg bg-chess-accent hover:bg-purple-600 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {findLinesLoading ? "Submitting…" : "Find lines for this position"}
                    </button>
                    {lines.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void refetchLines()}
                        className="text-sm text-chess-accent hover:underline"
                      >
                        Refresh
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setLineOptionsOpen((o) => !o)}
                      className="text-sm text-gray-400 hover:text-gray-300"
                    >
                      {lineOptionsOpen ? "Hide options" : "Options"}
                    </button>
                  </div>
                  {lineOptionsOpen && (
                    <div className="p-3 rounded-lg bg-chess-card border border-chess-border">
                      <LineAnalysisOptionsForm
                        value={lineAnalysisOptions}
                        onChange={setLineAnalysisOptions}
                        disabled={findLinesLoading}
                      />
                    </div>
                  )}
                </div>
                {findLinesError && (
                  <p className="text-sm text-red-400" role="alert">
                    {findLinesError}
                  </p>
                )}
                {linesJobId && (
                  <JobStatusCard
                    jobId={linesJobId}
                    state={linesJobState}
                    progress={linesJobProgress}
                    failedReason={linesJobFailedReason ?? null}
                    error={linesJobError ?? null}
                  />
                )}
                {selectedLine != null && (
                  <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-chess-bg border border-chess-border">
                    <span className="text-sm text-gray-300">
                      Playing line {lines.findIndex((l) => l.id === selectedLine.id) + 1}{" "}
                      · Move {lineStepIndex}/{lineMovesLength}
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={lineStepBack}
                        disabled={!lineCanGoBack}
                        className="px-2 py-1 rounded bg-chess-card border border-chess-border text-sm text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={lineStepForward}
                        disabled={!lineCanGoForward}
                        className="px-2 py-1 rounded bg-chess-card border border-chess-border text-sm text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedLine(null)}
                      className="text-sm text-chess-accent hover:underline"
                    >
                      Exit line
                    </button>
                  </div>
                )}
                <div className="flex-1 min-h-[200px] overflow-y-auto">
                  <LineResults
                    lines={lines}
                    loading={linesLoading}
                    error={linesError}
                    selectedLineId={selectedLine?.id ?? null}
                    onSelectLine={(line) => {
                      setSelectedLine(line);
                      setLineStepIndex(0);
                    }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 border border-chess-border rounded-lg overflow-hidden">
                  <div className="max-h-[400px] overflow-y-auto">
                    <MoveExplorer
                      node={currentNode}
                      depth={path.length}
                      onSelectMove={selectMove}
                      onHoverMove={handleHoverMove}
                      showPrepStatus={false}
                    />
                  </div>
                </div>

                <div className="text-xs text-gray-600 mt-2">
                  Click a move or drag pieces on the board &middot; Arrow keys to navigate
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
