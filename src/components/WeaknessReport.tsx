"use client";

import { useState } from "react";
import type { Weakness } from "@/lib/types";

function SeverityBadge({ severity }: { severity: Weakness["severity"] }) {
  const colors = {
    high: "bg-red-500/20 text-red-400 border-red-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[severity]}`}
    >
      {severity}
    </span>
  );
}

function CategoryIcon({ category }: { category: Weakness["category"] }) {
  const icons: Record<string, string> = {
    opening: "\u265E", // knight
    time: "\u23F1", // timer
    color: "\u25D0", // half circle
    endgame: "\u265A", // king
    tilt: "\u2620", // skull
    general: "\u2139", // info
  };
  return <span className="text-lg">{icons[category] || "\u2139"}</span>;
}

function InsightCard({ item, type }: { item: Weakness; type: "weakness" | "strength" }) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = type === "weakness" ? "border-l-red-500" : "border-l-green-500";

  return (
    <div
      className={`bg-chess-bg border border-chess-border ${borderColor} border-l-4 rounded-lg p-4 cursor-pointer hover:bg-chess-bg/80 transition-colors`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        <CategoryIcon category={item.category} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm">{item.title}</span>
            <SeverityBadge severity={item.severity} />
          </div>
          <div className="text-xs text-gray-400">{item.stat}</div>
        </div>
        <span
          className={`text-xs text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          &#9660;
        </span>
      </div>

      {expanded && (
        <div className="mt-3 pl-8 text-sm">
          <p className="text-gray-300 mb-2">{item.description}</p>
          {item.recommendation && (
            <div
              className={`${type === "weakness" ? "bg-red-500/10 border-red-500/20" : "bg-green-500/10 border-green-500/20"} border rounded-lg p-3`}
            >
              <div className="text-xs text-gray-400 mb-1">
                {type === "weakness" ? "How to exploit" : "Watch out for"}
              </div>
              <div className={type === "weakness" ? "text-red-300" : "text-green-300"}>
                {item.recommendation}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function WeaknessReport({
  weaknesses,
  strengths,
}: {
  weaknesses: Weakness[];
  strengths: Weakness[];
}) {
  return (
    <div className="space-y-6">
      {/* Weaknesses */}
      <div className="bg-chess-card border border-chess-border rounded-xl p-6">
        <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
          <span className="text-red-400">&#9888;</span> Weaknesses
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Patterns you can exploit in your preparation
        </p>

        {weaknesses.length === 0 ? (
          <div className="text-gray-500 text-center py-6">
            No significant weaknesses detected. This opponent is well-rounded.
          </div>
        ) : (
          <div className="space-y-3">
            {weaknesses.map((w) => (
              <InsightCard key={w.id} item={w} type="weakness" />
            ))}
          </div>
        )}
      </div>

      {/* Strengths */}
      <div className="bg-chess-card border border-chess-border rounded-xl p-6">
        <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
          <span className="text-green-400">&#9733;</span> Strengths
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Areas where they perform above average -- be careful
        </p>

        {strengths.length === 0 ? (
          <div className="text-gray-500 text-center py-6">
            No significant strengths detected beyond their overall level.
          </div>
        ) : (
          <div className="space-y-3">
            {strengths.map((s) => (
              <InsightCard key={s.id} item={s} type="strength" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
