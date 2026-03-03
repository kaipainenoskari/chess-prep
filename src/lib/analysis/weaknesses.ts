import type { Weakness, OpeningRepertoire, TimeProfile } from "../types";
import type { PerformanceStats } from "./performance";

/**
 * Weakness/strength detection is disabled; returns empty arrays.
 * Analysis API still returns the same shape for compatibility.
 */
export function detectWeaknesses(
  _perf: PerformanceStats,
  _openings: OpeningRepertoire,
  _timeProfile: TimeProfile,
): { weaknesses: Weakness[]; strengths: Weakness[] } {
  return { weaknesses: [], strengths: [] };
}
