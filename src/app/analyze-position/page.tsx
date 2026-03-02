"use client";

import { useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FenInput,
  JobStatusCard,
  LineResults,
  useAnalyzePosition,
  useJobStatus,
  useLinesByFen,
} from "@/components/analyze-position";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function AnalyzePositionContent({ initialRootFen }: { initialRootFen: string | null }) {
  const [fen, setFen] = useState(() => initialRootFen ?? "");
  const [submittedRootFen, setSubmittedRootFen] = useState<string | null>(
    () => initialRootFen,
  );

  const {
    jobId,
    error: submitError,
    loading: submitLoading,
    submit,
    reset,
  } = useAnalyzePosition();
  const { state, progress, failedReason, error: statusError } = useJobStatus(jobId);

  const rootFenForLines = state === "completed" ? submittedRootFen : submittedRootFen;
  const {
    lines,
    loading: linesLoading,
    error: linesError,
    refetch,
  } = useLinesByFen(rootFenForLines);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const fenToSend = fen.trim() || STARTING_FEN;
      const ok = await submit(fenToSend);
      if (ok) setSubmittedRootFen(fenToSend);
    },
    [fen, submit],
  );

  const handleReset = useCallback(() => {
    reset();
    setSubmittedRootFen(null);
  }, [reset]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Line difficulty analysis</h1>
        <p className="text-gray-400 text-sm">
          Enter a position (FEN). We rank candidate lines by{" "}
          <strong className="text-gray-300">practical difficulty</strong> for the
          opponent, not just engine eval.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 mb-8">
        <FenInput
          value={fen}
          onChange={setFen}
          error={submitError ?? undefined}
          disabled={submitLoading}
        />
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={submitLoading}
            className="px-5 py-2.5 rounded-lg bg-chess-accent hover:bg-purple-600 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitLoading ? "Submitting…" : "Analyze position"}
          </button>
          {(jobId || submittedRootFen) && (
            <button
              type="button"
              onClick={handleReset}
              className="px-5 py-2.5 rounded-lg border border-chess-border bg-chess-card hover:bg-chess-border/50 text-gray-300 font-medium transition-colors"
            >
              New analysis
            </button>
          )}
        </div>
      </form>

      {jobId && (
        <div className="mb-8">
          <JobStatusCard
            jobId={jobId}
            state={state}
            progress={progress}
            failedReason={failedReason}
            error={statusError}
          />
        </div>
      )}

      {(state === "completed" || (submittedRootFen && !jobId)) && (
        <div className="mb-4">
          <LineResults lines={lines} loading={linesLoading} error={linesError} />
          {lines.length > 0 && (
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-2 text-sm text-chess-accent hover:underline"
            >
              Refresh results
            </button>
          )}
        </div>
      )}

      <div className="pt-8 border-t border-chess-border">
        <Link
          href="/"
          className="text-sm text-gray-400 hover:text-chess-accent transition-colors"
        >
          ← Back to opponent analysis
        </Link>
      </div>
    </div>
  );
}

export default function AnalyzePositionPage() {
  return (
    <Suspense
      fallback={<div className="max-w-3xl mx-auto px-4 py-8 text-gray-400">Loading…</div>}
    >
      <AnalyzePositionContentKeyed />
    </Suspense>
  );
}

function AnalyzePositionContentKeyed() {
  const searchParams = useSearchParams();
  const rootFenFromUrl = searchParams.get("rootFen")?.trim() || null;
  return (
    <AnalyzePositionContent
      key={rootFenFromUrl ?? "empty"}
      initialRootFen={rootFenFromUrl}
    />
  );
}
