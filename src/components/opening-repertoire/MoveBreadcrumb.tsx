"use client";

import type { OpeningNode } from "@/lib/types";
import { getNodesAlongPath, formatMoveLabel } from "@/lib/opening-tree";

interface MoveBreadcrumbProps {
  root: OpeningNode;
  path: number[];
  onNavigate: (newPath: number[]) => void;
}

export default function MoveBreadcrumb({ root, path, onNavigate }: MoveBreadcrumbProps) {
  const nodes = getNodesAlongPath(root, path);

  if (nodes.length === 0) {
    return <div className="text-sm text-gray-500 italic py-2">Starting position</div>;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 py-2 text-sm">
      <button
        onClick={() => onNavigate([])}
        className="text-gray-500 hover:text-white transition-colors"
        title="Go to starting position"
      >
        Start
      </button>
      {nodes.map((node, i) => {
        const isLast = i === nodes.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            <span className="text-gray-600">&rsaquo;</span>
            <button
              onClick={() => onNavigate(path.slice(0, i + 1))}
              className={`font-mono font-medium transition-colors ${
                isLast ? "text-chess-accent" : "text-gray-400 hover:text-white"
              }`}
            >
              {formatMoveLabel(node.move, i)}
            </button>
          </span>
        );
      })}
    </div>
  );
}
