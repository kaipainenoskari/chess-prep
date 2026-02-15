"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { OpeningNode } from "@/lib/types";
import NodeStatusBadge from "./NodeStatusBadge";
import { useJobStatus } from "@/components/analyze-position";

interface NodeActionsProps {
  projectId: string;
  currentNode: OpeningNode;
  onRefetchProject: () => void;
}

export default function NodeActions({
  projectId,
  currentNode,
  onRefetchProject,
}: NodeActionsProps) {
  const [submittedJobId, setSubmittedJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const refetchedForJobId = useRef<string | null>(null);

  const effectiveJobId =
    submittedJobId ??
    (currentNode.analysisStatus === "ANALYSIS_RUNNING"
      ? (currentNode.lastJobId ?? null)
      : null);

  const {
    state: jobState,
    result: jobResult,
    failedReason,
    error: jobError,
  } = useJobStatus(effectiveJobId);

  const isJobDone = jobState === "completed" || jobResult != null;

  // Show completed UI as soon as we know the job finished (don't wait for refetch)
  const isRunning =
    !isJobDone &&
    (currentNode.analysisStatus === "ANALYSIS_RUNNING" ||
      jobState === "active" ||
      jobState === "waiting" ||
      jobState === "delayed");
  const isAnalyzed =
    currentNode.analysisStatus === "ANALYZED_NO_TRAPS" ||
    currentNode.analysisStatus === "ANALYZED_WITH_TRAPS" ||
    isJobDone;

  useEffect(() => {
    if (!effectiveJobId) {
      refetchedForJobId.current = null;
      return;
    }
    if (isJobDone && refetchedForJobId.current !== effectiveJobId) {
      refetchedForJobId.current = effectiveJobId;
      setSubmittedJobId(null);
      onRefetchProject();
    }
  }, [effectiveJobId, isJobDone, onRefetchProject]);

  const handleDeepAnalyze = useCallback(async () => {
    if (currentNode.analysisStatus === "ANALYSIS_RUNNING") return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/prep/projects/${projectId}/analyze-node`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: currentNode.fen }),
      });
      const data = (await res.json()) as {
        jobId?: string;
        alreadyRunning?: boolean;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Request failed");
      }
      if (data.jobId) {
        setSubmittedJobId(data.jobId);
        onRefetchProject();
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to start analysis");
    } finally {
      setSubmitting(false);
    }
  }, [projectId, currentNode.fen, currentNode.analysisStatus, onRefetchProject]);

  return (
    <div className="mb-3 p-3 rounded-lg border border-chess-border bg-chess-bg/50">
      <div className="flex items-center gap-2 mb-2">
        <NodeStatusBadge
          status={currentNode.analysisStatus}
          trapCount={currentNode.trapCount}
          size="md"
        />
        <span className="text-xs text-gray-400">
          {currentNode.analysisStatus === "UNSCANNED" && !isJobDone && "Not scanned"}
          {currentNode.analysisStatus === "RISK_SCANNED" && !isJobDone && "Scanned"}
          {currentNode.analysisStatus === "ANALYSIS_RUNNING" &&
            !isJobDone &&
            "Analyzing…"}
          {(currentNode.analysisStatus === "ANALYZED_NO_TRAPS" ||
            (isJobDone && (jobResult?.linesStored ?? 0) === 0)) &&
            "No traps"}
          {(currentNode.analysisStatus === "ANALYZED_WITH_TRAPS" ||
            (isJobDone && (jobResult?.linesStored ?? 0) > 0)) &&
            `${jobResult?.linesStored ?? currentNode.trapCount} trap${(jobResult?.linesStored ?? currentNode.trapCount) !== 1 ? "s" : ""} found`}
        </span>
      </div>
      {submitError && <p className="text-xs text-red-400 mb-2">{submitError}</p>}
      {failedReason && (
        <p className="text-xs text-red-400 mb-2">Job failed: {failedReason}</p>
      )}
      {jobError && <p className="text-xs text-red-400 mb-2">{jobError}</p>}
      <div className="flex flex-wrap gap-2">
        {!isAnalyzed && !isRunning && (
          <button
            type="button"
            onClick={handleDeepAnalyze}
            disabled={submitting}
            className="px-3 py-1.5 rounded-lg bg-chess-accent hover:bg-purple-600 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Starting…" : "Deep analyze"}
          </button>
        )}
        {isRunning && <span className="text-sm text-chess-accent">Analyzing…</span>}
        {isAnalyzed && (
          <>
            <a
              href={`/analyze-position?rootFen=${encodeURIComponent(currentNode.fen)}`}
              className="px-3 py-1.5 rounded-lg border border-chess-border bg-chess-card hover:bg-chess-border/50 text-sm font-medium text-gray-300"
            >
              View lines
            </a>
            <button
              type="button"
              onClick={handleDeepAnalyze}
              disabled={submitting}
              className="px-3 py-1.5 rounded-lg border border-chess-border bg-chess-card hover:bg-chess-border/50 text-sm font-medium text-gray-300 disabled:opacity-50"
            >
              {submitting ? "Starting…" : "Analyze again"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
