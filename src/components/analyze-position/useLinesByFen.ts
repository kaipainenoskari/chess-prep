"use client";

import { useState, useEffect, useCallback } from "react";

export interface LineAnalysisItem {
  id: string;
  rootFen: string;
  lineMoves: string[];
  score: number;
  metricsJson: unknown;
  createdAt: string;
}

export interface UseLinesByFenResult {
  lines: LineAnalysisItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useLinesByFen(rootFen: string | null): UseLinesByFenResult {
  const [lines, setLines] = useState<LineAnalysisItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLines = useCallback(async () => {
    if (!rootFen?.trim()) {
      setLines([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/line-analysis?rootFen=${encodeURIComponent(rootFen.trim())}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed to fetch lines (${res.status})`);
        setLines([]);
        return;
      }
      setLines(Array.isArray(data.lines) ? data.lines : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [rootFen]);

  useEffect(() => {
    void fetchLines();
  }, [fetchLines]);

  return { lines, loading, error, refetch: fetchLines };
}
