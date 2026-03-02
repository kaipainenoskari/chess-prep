"use client";

import type { AnalysisStatus } from "@/lib/types";

interface NodeStatusBadgeProps {
  status?: AnalysisStatus;
  trapCount?: number;
  title?: string;
  size?: "sm" | "md";
}

const TOOLTIPS: Record<AnalysisStatus, string> = {
  UNSCANNED: "Not scanned",
  RISK_SCANNED: "Scanned — run deep analysis to find traps",
  ANALYSIS_RUNNING: "Analyzing…",
  ANALYZED_NO_TRAPS: "No traps found",
  ANALYZED_WITH_TRAPS: "Traps found — view lines",
};

export default function NodeStatusBadge({
  status = "UNSCANNED",
  trapCount = 0,
  title,
  size = "sm",
}: NodeStatusBadgeProps) {
  const tooltip = title ?? TOOLTIPS[status];
  const sizeClass = size === "sm" ? "w-5 h-5 text-[10px]" : "w-6 h-6 text-xs";

  if (status === "UNSCANNED") {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full border border-dashed border-gray-600 text-gray-500 ${sizeClass}`}
        title={tooltip}
      >
        ·
      </span>
    );
  }
  if (status === "RISK_SCANNED") {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-gray-600/50 text-gray-400 ${sizeClass}`}
        title={tooltip}
      >
        ✓
      </span>
    );
  }
  if (status === "ANALYSIS_RUNNING") {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-chess-accent/30 text-chess-accent ${sizeClass} animate-pulse`}
        title={tooltip}
      >
        …
      </span>
    );
  }
  if (status === "ANALYZED_NO_TRAPS") {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-green-500/20 text-green-400 ${sizeClass}`}
        title={tooltip}
      >
        ✓
      </span>
    );
  }
  if (status === "ANALYZED_WITH_TRAPS") {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-orange-500/20 text-orange-400 font-bold ${sizeClass}`}
        title={tooltip}
      >
        {trapCount > 0 ? trapCount : "!"}
      </span>
    );
  }
  return null;
}
