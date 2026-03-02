"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { OpeningNode } from "@/lib/types";
import NodeStatusBadge from "./NodeStatusBadge";
import { useJobStatus } from "@/components/analyze-position";
import {
  PREP_AUTO_ANALYZE_ON_VISIT,
  PREP_MAX_AUTO_ANALYZE_PER_SESSION,
} from "@/lib/config";

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
  const autoEnqueuedFens = useRef<Set<string>>(new Set());
  const autoEnqueuedCount = useRef(0);

  const effectiveJobId =
    submittedJobId ??
    (currentNode.analysisStatus === "ANALYSIS_RUNNING"
      ? (currentNode.lastJobId ?? null)
      : null);

  const {
    state: jobState,
    result: jobResult,
    progress,
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

  // Auto-enqueue analyze-node on first visit to an unscanned node (when enabled and under cap)
  useEffect(() => {
    if (
      !PREP_AUTO_ANALYZE_ON_VISIT ||
      autoEnqueuedCount.current >= PREP_MAX_AUTO_ANALYZE_PER_SESSION ||
      isRunning ||
      isAnalyzed ||
      autoEnqueuedFens.current.has(currentNode.fen)
    ) {
      return;
    }
    const status = currentNode.analysisStatus;
    if (status !== "UNSCANNED" && status !== "RISK_SCANNED") return;

    let cancelled = false;
    const enqueue = async () => {
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
        if (cancelled) return;
        if (res.ok && (data.jobId || data.alreadyRunning)) {
          autoEnqueuedFens.current.add(currentNode.fen);
          if (data.jobId) autoEnqueuedCount.current += 1;
          if (data.jobId) setSubmittedJobId(data.jobId);
          onRefetchProject();
        }
      } catch {
        if (!cancelled) setSubmitError("Auto-analyze failed");
      }
    };
    void enqueue();
    return () => {
      cancelled = true;
    };
  }, [
    projectId,
    currentNode.fen,
    currentNode.analysisStatus,
    isRunning,
    isAnalyzed,
    onRefetchProject,
  ]);

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

  const showProgress =
    isRunning &&
    progress != null &&
    typeof progress.total === "number" &&
    progress.total > 0;
  const progressPct = showProgress
    ? Math.min(100, Math.round(((progress!.current ?? 0) / progress!.total!) * 100))
    : 0;

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
      {showProgress && (
        <div className="mb-2">
          <div className="h-1.5 rounded-full bg-chess-bg overflow-hidden">
            <div
              className="h-full bg-chess-accent transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {progress?.estimatedPositions != null && (
            <p className="text-xs text-gray-400 mt-0.5">
              ~{progress.estimatedPositions} nodes
              {progress.estimatedTimeMs != null &&
                ` · ~${Math.ceil(progress.estimatedTimeMs / 60000)} min`}
            </p>
          )}
        </div>
      )}
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
        {isRunning && !showProgress && (
          <span className="text-sm text-chess-accent">Analyzing…</span>
        )}
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
