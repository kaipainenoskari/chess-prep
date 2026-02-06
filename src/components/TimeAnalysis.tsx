"use client";

import type { TimeProfile } from "@/lib/types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function StatCard({
  label,
  value,
  subtext,
  color,
}: {
  label: string;
  value: string;
  subtext?: string;
  color?: string;
}) {
  return (
    <div className="bg-chess-bg border border-chess-border rounded-lg p-4">
      <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color || "text-white"}`}>{value}</div>
      {subtext && <div className="text-xs text-gray-500 mt-1">{subtext}</div>}
    </div>
  );
}

export default function TimeAnalysis({ timeProfile }: { timeProfile: TimeProfile }) {
  const { avgClockByMove, timeAllocation, troubleStats: ts } = timeProfile;

  if (ts.totalGames === 0) {
    return (
      <div className="bg-chess-card border border-chess-border rounded-xl p-6">
        <h3 className="text-lg font-bold mb-4">Time Management</h3>
        <div className="text-gray-500 text-center py-8">
          No games with clock data found for this filter.
        </div>
      </div>
    );
  }

  const troubleRate = Math.round((ts.below30s / ts.totalGames) * 100);
  const flagRate = Math.round((ts.flagged / ts.totalGames) * 100);

  return (
    <div className="bg-chess-card border border-chess-border rounded-xl p-6">
      <h3 className="text-lg font-bold mb-4">Time Management</h3>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Time trouble rate"
          value={`${troubleRate}%`}
          subtext={`${ts.below30s}/${ts.totalGames} games below 30s`}
          color={
            troubleRate > 30
              ? "text-red-400"
              : troubleRate > 15
                ? "text-yellow-400"
                : "text-green-400"
          }
        />
        <StatCard
          label="Flag rate"
          value={`${flagRate}%`}
          subtext={`${ts.flagged} games lost on time`}
          color={flagRate > 15 ? "text-red-400" : "text-gray-300"}
        />
        <StatCard
          label="Win rate under pressure"
          value={`${ts.winRateUnderPressure}%`}
          subtext="When below 30s"
          color={ts.winRateUnderPressure < 40 ? "text-red-400" : "text-gray-300"}
        />
        <StatCard
          label="Win rate comfortable"
          value={`${ts.winRateComfortable}%`}
          subtext="When never below 30s"
          color="text-green-400"
        />
      </div>

      {/* Time usage curve */}
      {avgClockByMove.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm text-gray-400 mb-3">Average Clock Remaining by Move</h4>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={avgClockByMove}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" />
              <XAxis
                dataKey="move"
                stroke="#8892a6"
                tick={{ fontSize: 12 }}
                label={{
                  value: "Move",
                  position: "insideBottom",
                  offset: -5,
                  fill: "#8892a6",
                }}
              />
              <YAxis
                stroke="#8892a6"
                tick={{ fontSize: 12 }}
                tickFormatter={formatTime}
              />
              <Tooltip
                contentStyle={{
                  background: "#1a1f2e",
                  border: "1px solid #2a3040",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "#8892a6" }}
                formatter={(value: number) => [formatTime(value), "Avg Clock"]}
                labelFormatter={(label) => `Move ${label}`}
              />
              <Line
                type="monotone"
                dataKey="avgClock"
                stroke="#7c3aed"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Time allocation */}
      {timeAllocation.length > 0 && (
        <div>
          <h4 className="text-sm text-gray-400 mb-3">Time Allocation by Phase</h4>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={timeAllocation} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" />
              <XAxis
                type="number"
                domain={[0, 100]}
                stroke="#8892a6"
                tick={{ fontSize: 12 }}
                tickFormatter={(v) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="phase"
                width={140}
                stroke="#8892a6"
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: "#1a1f2e",
                  border: "1px solid #2a3040",
                  borderRadius: "8px",
                }}
                formatter={(value: number) => [`${value}%`, "Time spent"]}
              />
              <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
                {timeAllocation.map((_, i) => (
                  <Cell key={i} fill={["#7c3aed", "#6366f1", "#8b5cf6"][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
