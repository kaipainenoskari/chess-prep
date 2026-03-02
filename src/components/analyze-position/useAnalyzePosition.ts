"use client";

import { useState, useCallback } from "react";
import { validateFen } from "@/lib/validation";

export interface UseAnalyzePositionResult {
  jobId: string | null;
  error: string | null;
  loading: boolean;
  submit: (fen: string) => Promise<boolean>;
  reset: () => void;
}

export function useAnalyzePosition(): UseAnalyzePositionResult {
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = useCallback(async (fen: string): Promise<boolean> => {
    const v = validateFen(fen.trim() || null);
    if (!v.ok) {
      setError(v.errors[0]?.message ?? "Invalid FEN");
      return false;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/analyze-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: v.data }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.errors?.[0]?.message ?? data.error ?? `Request failed (${res.status})`,
        );
        return false;
      }
      const id = data.jobId ?? null;
      setJobId(id);
      return !!id;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setJobId(null);
    setError(null);
    setLoading(false);
  }, []);

  return { jobId, error, loading, submit, reset };
}
