"use client";

import Image from "next/image";
import type { ChessComProfile, ChessComStats } from "@/lib/types";
import type { PerformanceStats } from "@/lib/analysis/performance";
import WinRateBar from "./WinRateBar";

function RatingCard({
  label,
  rating,
}: {
  label: string;
  rating?: {
    last: { rating: number };
    record: { win: number; loss: number; draw: number };
  };
}) {
  if (!rating) return null;
  return (
    <div className="bg-chess-bg border border-chess-border rounded-lg p-3">
      <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-1">{rating.last.rating}</div>
      <div className="text-xs text-gray-500 mt-1">
        {rating.record.win + rating.record.loss + rating.record.draw} games
      </div>
    </div>
  );
}

function RecentForm({ form }: { form: ("W" | "L" | "D")[] }) {
  return (
    <div className="flex gap-1">
      {form.map((r, i) => (
        <div
          key={i}
          className={`w-6 h-6 rounded-sm flex items-center justify-center text-xs font-bold ${
            r === "W"
              ? "bg-green-500/20 text-green-400"
              : r === "L"
                ? "bg-red-500/20 text-red-400"
                : "bg-gray-500/20 text-gray-400"
          }`}
        >
          {r}
        </div>
      ))}
    </div>
  );
}

export default function PlayerOverview({
  profile,
  stats,
  performance,
  periodLabel,
}: {
  profile: ChessComProfile;
  stats: ChessComStats;
  performance: PerformanceStats;
  periodLabel?: string;
}) {
  return (
    <div className="bg-chess-card border border-chess-border rounded-xl p-6">
      <div className="flex items-start gap-4 mb-6">
        {profile.avatar && (
          <Image
            src={profile.avatar}
            alt={profile.username}
            width={64}
            height={64}
            className="w-16 h-16 rounded-lg"
          />
        )}
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            {profile.title && (
              <span className="text-amber-400 text-sm font-bold">{profile.title}</span>
            )}
            {profile.username}
          </h2>
          <a
            href={profile.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-chess-accent hover:underline"
          >
            View on Chess.com
          </a>
        </div>
        <div className="ml-auto text-right">
          <div className="text-sm text-gray-400">Games analyzed</div>
          <div className="text-2xl font-bold">{performance.totalGames}</div>
          <div className="text-sm text-gray-400 capitalize">
            {periodLabel ?? "Last 6 months"}
          </div>
        </div>
      </div>

      {/* Ratings */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <RatingCard label="Bullet" rating={stats.chess_bullet} />
        <RatingCard label="Blitz" rating={stats.chess_blitz} />
        <RatingCard label="Rapid" rating={stats.chess_rapid} />
      </div>

      {/* Overall W/L/D */}
      <div className="mb-4">
        <div className="text-sm text-gray-400 mb-2">Overall Win/Draw/Loss</div>
        <WinRateBar
          wins={performance.wins}
          draws={performance.draws}
          losses={performance.losses}
        />
      </div>

      {/* By color */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-sm text-gray-400 mb-1">
            As White ({performance.byColor.white.games} games)
          </div>
          <WinRateBar
            wins={performance.byColor.white.wins}
            draws={performance.byColor.white.draws}
            losses={performance.byColor.white.losses}
            height="h-4"
            showLabels={false}
          />
          <div className="text-xs text-gray-400 mt-1">
            {performance.byColor.white.winRate}% win rate
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-400 mb-1">
            As Black ({performance.byColor.black.games} games)
          </div>
          <WinRateBar
            wins={performance.byColor.black.wins}
            draws={performance.byColor.black.draws}
            losses={performance.byColor.black.losses}
            height="h-4"
            showLabels={false}
          />
          <div className="text-xs text-gray-400 mt-1">
            {performance.byColor.black.winRate}% win rate
          </div>
        </div>
      </div>

      {/* Recent form */}
      {performance.recentForm.length > 0 && (
        <div>
          <div className="text-sm text-gray-400 mb-2">
            Recent Form (last {performance.recentForm.length} games)
          </div>
          <RecentForm form={performance.recentForm} />
        </div>
      )}

      {/* Average accuracy */}
      {performance.avgAccuracy && (
        <div className="mt-4 text-sm text-gray-400">
          Average Accuracy:{" "}
          <span className="text-white font-semibold">{performance.avgAccuracy}%</span>
        </div>
      )}
    </div>
  );
}
