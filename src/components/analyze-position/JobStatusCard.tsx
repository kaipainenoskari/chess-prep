"use client";

import type { JobState } from "./useJobStatus";

export interface JobStatusCardProps {
  jobId: string;
  state: JobState | null;
  failedReason: string | null;
  error: string | null;
}

const STATE_LABELS: Record<string, string> = {
  waiting: "Queued",
  delayed: "Scheduled",
  active: "Analyzing…",
  completed: "Done",
  failed: "Failed",
};

export default function JobStatusCard({
  jobId,
  state,
  failedReason,
  error,
}: JobStatusCardProps) {
  const label = state ? (STATE_LABELS[state] ?? state) : "Unknown";
  const isComplete = state === "completed";
  const isFailed = state === "failed" || !!failedReason || !!error;

  return (
    <div
      className="rounded-xl border border-chess-border bg-chess-card p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <StatusDot state={state} />
          <span className="font-medium">{label}</span>
          {jobId && (
            <span className="text-sm text-gray-500 font-mono" title="Job ID">
              {jobId.slice(0, 8)}…
            </span>
          )}
        </div>
      </div>
      {isFailed && (failedReason || error) && (
        <p className="mt-2 text-sm text-red-400" role="alert">
          {failedReason ?? error}
        </p>
      )}
      {!isComplete && !isFailed && state !== null && (
        <p className="mt-2 text-sm text-gray-400">
          Results will appear when the analysis finishes. This may take a minute.
        </p>
      )}
    </div>
  );
}

function StatusDot({ state }: { state: JobState | null }) {
  const dotClass =
    state === "completed"
      ? "bg-green-500"
      : state === "failed"
        ? "bg-red-500"
        : state === "active"
          ? "bg-chess-accent animate-pulse"
          : "bg-gray-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} aria-hidden />;
}
