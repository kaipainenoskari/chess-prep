"use client";

import { useState, useEffect, useCallback } from "react";

export type JobState = "waiting" | "delayed" | "active" | "completed" | "failed";

export interface JobStatusResult {
  state: JobState | null;
  result: { lineAnalysisId?: string; linesStored?: number } | null;
  failedReason: string | null;
  error: string | null;
  refetch: () => Promise<void>;
}

const POLL_INTERVAL_MS = 2000;

export function useJobStatus(jobId: string | null): JobStatusResult {
  const [state, setState] = useState<JobState | null>(null);
  const [result, setResult] = useState<JobStatusResult["result"]>(null);
  const [failedReason, setFailedReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!jobId) {
      setState(null);
      setResult(null);
      setFailedReason(null);
      setError(null);
      return;
    }
    try {
      const res = await fetch(`/api/job/${encodeURIComponent(jobId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404) {
          setError(null);
          setState("completed");
          setResult(null);
          setFailedReason(null);
          return;
        }
        setError(data.error ?? `Failed to fetch job (${res.status})`);
        return;
      }
      setError(null);
      const rawState = data.state as JobState | undefined;
      const rawResult = data.result as JobStatusResult["result"] | undefined;
      setResult(rawResult ?? null);
      setFailedReason(data.failedReason ?? null);
      setState(rawResult != null ? "completed" : (rawState ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    const tick = () => void fetchStatus();
    const timeoutId = setTimeout(tick, 0);
    const intervalId = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [jobId, fetchStatus]);

  return { state, result, failedReason, error, refetch: fetchStatus };
}
