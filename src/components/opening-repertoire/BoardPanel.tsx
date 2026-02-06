"use client";

import { Chessboard } from "react-chessboard";
import type { Arrow, Square } from "react-chessboard/dist/chessboard/types";
import type { BoardArrow } from "@/lib/opening-tree";

interface BoardPanelProps {
  fen: string;
  orientation: "white" | "black";
  boardWidth: number;
  onPieceDrop: (source: string, target: string, piece: string) => boolean;
  onSquareClick: (square: string) => void;
  customArrows: BoardArrow[];
  customSquareStyles: Record<string, Record<string, string | number>>;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onReset: () => void;
}

/** Cast our string-based arrows to the branded Square type react-chessboard expects */
function toChessboardArrows(arrows: BoardArrow[]): Arrow[] {
  return arrows as unknown as Arrow[];
}

/** Cast our string-keyed styles to the branded Square-keyed styles */
function toSquareStyles(
  styles: Record<string, Record<string, string | number>>,
): Partial<Record<Square, Record<string, string | number>>> {
  return styles as Partial<Record<Square, Record<string, string | number>>>;
}

export default function BoardPanel({
  fen,
  orientation,
  boardWidth,
  onPieceDrop,
  onSquareClick,
  customArrows,
  customSquareStyles,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onReset,
}: BoardPanelProps) {
  const navBtnClass =
    "p-2 px-3 rounded-lg bg-chess-bg border border-chess-border text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm";

  return (
    <div className="flex flex-col items-center gap-3">
      <div style={{ width: boardWidth, height: boardWidth }}>
        <Chessboard
          position={fen}
          boardOrientation={orientation}
          boardWidth={boardWidth}
          onPieceDrop={onPieceDrop}
          onSquareClick={onSquareClick}
          customArrows={toChessboardArrows(customArrows)}
          customSquareStyles={toSquareStyles(customSquareStyles)}
          animationDuration={200}
          customBoardStyle={{
            borderRadius: "8px",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
          }}
          customDarkSquareStyle={{ backgroundColor: "#779952" }}
          customLightSquareStyle={{ backgroundColor: "#edeed1" }}
        />
      </div>

      {/* Navigation controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onReset}
          disabled={!canGoBack}
          className={navBtnClass}
          title="Reset to start"
        >
          &#x23EE;
        </button>
        <button
          onClick={onBack}
          disabled={!canGoBack}
          className={navBtnClass}
          title="Go back one move"
        >
          &#x25C0;
        </button>
        <button
          onClick={onForward}
          disabled={!canGoForward}
          className={navBtnClass}
          title="Go forward one move"
        >
          &#x25B6;
        </button>
      </div>
    </div>
  );
}
