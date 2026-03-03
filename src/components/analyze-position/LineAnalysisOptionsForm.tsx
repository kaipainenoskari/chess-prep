"use client";

import {
  LINE_ANALYSIS_RATING_BUCKET,
  LINE_ANALYSIS_MIN_ENTRY_PROBABILITY,
  LINE_ANALYSIS_MIN_PRACTICAL_WIN_RATE,
  OPPONENT_MIN_PROBABILITY_TO_EXPAND,
} from "@/lib/config";
import type { LineAnalysisOptions } from "@/lib/queue/processor";

const RATING_BUCKETS = [
  "1200-1400",
  "1400-1600",
  "1600-1800",
  "1800-2000",
  "2000-2200",
  "2200-2400",
] as const;

export interface LineAnalysisOptionsFormProps {
  value: LineAnalysisOptions;
  onChange: (options: LineAnalysisOptions) => void;
  disabled?: boolean;
}

const DEFAULT_OPTIONS: LineAnalysisOptions = {
  ratingBucket: LINE_ANALYSIS_RATING_BUCKET,
  minEntryProbability: LINE_ANALYSIS_MIN_ENTRY_PROBABILITY,
  minPracticalWinRate: LINE_ANALYSIS_MIN_PRACTICAL_WIN_RATE,
  minOpponentProbabilityToExpand: OPPONENT_MIN_PROBABILITY_TO_EXPAND,
};

export function getDefaultLineAnalysisOptions(): LineAnalysisOptions {
  return { ...DEFAULT_OPTIONS };
}

export default function LineAnalysisOptionsForm({
  value,
  onChange,
  disabled = false,
}: LineAnalysisOptionsFormProps) {
  const ratingBucket = value.ratingBucket ?? LINE_ANALYSIS_RATING_BUCKET;
  const minEntryProbability =
    value.minEntryProbability ?? LINE_ANALYSIS_MIN_ENTRY_PROBABILITY;
  const minPracticalWinRate =
    value.minPracticalWinRate ?? LINE_ANALYSIS_MIN_PRACTICAL_WIN_RATE;
  const minOpponentProbabilityToExpand =
    value.minOpponentProbabilityToExpand ?? OPPONENT_MIN_PROBABILITY_TO_EXPAND;

  const update = (patch: Partial<LineAnalysisOptions>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-gray-400">Rating bucket</span>
        <select
          value={ratingBucket}
          onChange={(e) => update({ ratingBucket: e.target.value })}
          disabled={disabled}
          className="rounded bg-chess-card border border-chess-border px-2 py-1.5 text-gray-200 focus:border-chess-accent focus:outline-none disabled:opacity-50"
        >
          {RATING_BUCKETS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-gray-400">Min win rate (%)</span>
        <input
          type="number"
          min={1}
          max={100}
          step={1}
          value={Math.round(minPracticalWinRate * 100)}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n))
              update({ minPracticalWinRate: Math.max(0, Math.min(1, n / 100)) });
          }}
          disabled={disabled}
          className="rounded bg-chess-card border border-chess-border px-2 py-1.5 text-gray-200 focus:border-chess-accent focus:outline-none disabled:opacity-50 w-20"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-gray-400">Min entry probability</span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={minEntryProbability}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n))
              update({ minEntryProbability: Math.max(0, Math.min(1, n)) });
          }}
          disabled={disabled}
          className="rounded bg-chess-card border border-chess-border px-2 py-1.5 text-gray-200 focus:border-chess-accent focus:outline-none disabled:opacity-50 w-20"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-gray-400">Min opponent move probability</span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={minOpponentProbabilityToExpand}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n))
              update({
                minOpponentProbabilityToExpand: Math.max(0, Math.min(1, n)),
              });
          }}
          disabled={disabled}
          className="rounded bg-chess-card border border-chess-border px-2 py-1.5 text-gray-200 focus:border-chess-accent focus:outline-none disabled:opacity-50 w-20"
        />
      </label>
    </div>
  );
}
