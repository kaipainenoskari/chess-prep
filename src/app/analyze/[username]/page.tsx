"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import type {
  TimeClass,
  ChessComProfile,
  ChessComStats,
  OpeningRepertoire as OpeningRepertoireType,
  TimeProfile,
  Weakness,
} from "@/lib/types";
import type { PerformanceStats } from "@/lib/analysis/performance";
import TimeControlFilter from "@/components/TimeControlFilter";
import PlayerOverview from "@/components/PlayerOverview";
import OpeningRepertoireComponent from "@/components/OpeningRepertoire";
import TimeAnalysis from "@/components/TimeAnalysis";
import WeaknessReport from "@/components/WeaknessReport";

interface AnalysisData {
  profile: ChessComProfile;
  stats: ChessComStats;
  totalGames: number;
  performance: PerformanceStats;
  openings: OpeningRepertoireType;
  timeProfile: TimeProfile;
  weaknesses: Weakness[];
  strengths: Weakness[];
}

function LoadingSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-pulse">
      <div className="h-8 w-64 bg-chess-card rounded mb-8" />
      <div className="h-64 bg-chess-card rounded-xl mb-6" />
      <div className="h-96 bg-chess-card rounded-xl mb-6" />
      <div className="h-64 bg-chess-card rounded-xl mb-6" />
      <div className="h-48 bg-chess-card rounded-xl" />
    </div>
  );
}

function ErrorState({ message, username }: { message: string; username: string }) {
  return (
    <div className="max-w-5xl mx-auto px-4 py-16 text-center">
      <div className="text-6xl mb-4">&#9888;</div>
      <h2 className="text-2xl font-bold mb-2">
        Could not analyze &quot;{username}&quot;
      </h2>
      <p className="text-gray-400 mb-6">{message}</p>
      <a
        href="/"
        className="px-6 py-3 rounded-lg bg-chess-accent hover:bg-purple-600 text-white font-semibold transition-colors inline-block"
      >
        Try another player
      </a>
    </div>
  );
}

export default function AnalyzePage() {
  const params = useParams<{ username: string }>();
  const username = params.username;

  const [timeClass, setTimeClass] = useState<TimeClass>("all");
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = useCallback(
    async (tc: TimeClass) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/player/${encodeURIComponent(username)}/analysis?timeClass=${tc}`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to fetch (${res.status})`);
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [username],
  );

  useEffect(() => {
    fetchAnalysis(timeClass);
  }, [fetchAnalysis, timeClass]);

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} username={username} />;
  if (!data) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">
          Analysis: <span className="text-chess-accent">{data.profile.username}</span>
        </h1>
        <TimeControlFilter value={timeClass} onChange={setTimeClass} />
      </div>

      {/* Section 1: Overview */}
      <div className="mb-6">
        <PlayerOverview
          profile={data.profile}
          stats={data.stats}
          performance={data.performance}
        />
      </div>

      {/* Section 2: Opening Repertoire */}
      <div className="mb-6">
        <OpeningRepertoireComponent openings={data.openings} />
      </div>

      {/* Section 3: Time Analysis */}
      <div className="mb-6">
        <TimeAnalysis timeProfile={data.timeProfile} />
      </div>

      {/* Section 4: Weakness & Strength Report */}
      <div className="mb-6">
        <WeaknessReport weaknesses={data.weaknesses} strengths={data.strengths} />
      </div>

      {/* Footer */}
      <div className="text-center text-sm text-gray-500 py-8">
        Data from Chess.com API. Analysis based on {data.totalGames} games from the last 6
        months.
      </div>
    </div>
  );
}
