/**
 * Estimate line-analysis work (positions and time) from config.
 * Used for progress bar denominator and ETA; parameterized for future user overrides.
 */

export interface EstimateLineAnalysisWorkParams {
  rootCandidates: number;
  depth: number;
  preparerBranches: number;
  opponentBranches: number;
  msPerPosition: number;
}

export interface EstimateLineAnalysisWorkResult {
  estimatedPositions: number;
  estimatedTimeMs: number;
}

/**
 * Rough upper bound: per root candidate we have (depth/2) preparer turns and (depth/2) opponent turns.
 * Total positions ≈ rootCandidates * preparerBranches^preparerTurns * opponentBranches^opponentTurns.
 * Uses integer division for half-moves so depth 8 => 4 preparer, 4 opponent.
 */
export function estimateLineAnalysisWork(
  params: EstimateLineAnalysisWorkParams,
): EstimateLineAnalysisWorkResult {
  const { rootCandidates, depth, preparerBranches, opponentBranches, msPerPosition } =
    params;

  const half = Math.floor(depth / 2);
  const preparerTurns = half;
  const opponentTurns = half;

  const perRoot =
    Math.pow(preparerBranches, preparerTurns) * Math.pow(opponentBranches, opponentTurns);
  const estimatedPositions = Math.max(1, rootCandidates * perRoot);
  const estimatedTimeMs = estimatedPositions * msPerPosition;

  return { estimatedPositions, estimatedTimeMs };
}
