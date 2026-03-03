/**
 * Central configuration for the Chess Prep application.
 * Minimal set: lines from start, opponent by probability, population fallback.
 */

// ---------------------------------------------------------------------------
// Data sources & cache
// ---------------------------------------------------------------------------

export const LICHESS_EXPLORER_BASE = "https://explorer.lichess.ovh/lichess";
export const LICHESS_CLOUD_EVAL_BASE = "https://lichess.org/api/cloud-eval";
export const CHESS_API_EVAL_BASE = "https://chess-api.com/v1";

/**
 * Optional base URL for local FEN→move-frequency service.
 * When set (e.g. http://localhost:8080), human move stats are fetched from
 * GET {base}/query?fen=...&bucket=... instead of the Lichess Explorer API.
 */
export const FEN_MOVE_SERVICE_URL = process.env.FEN_MOVE_SERVICE_URL?.trim() ?? "";

/** Redis cache TTL for engine analysis (PositionCache). */
export const CACHE_ENGINE_TTL = 30 * 86400; // 30 days

/** Redis cache TTL for Lichess human moves (LichessMoveCache). */
export const CACHE_LICHESS_TTL = 7 * 86400; // 7 days

/** Stockfish fallback depth when using chess-api.com. */
export const EVAL_FALLBACK_DEPTH = 16;

// ---------------------------------------------------------------------------
// Rating & line building
// ---------------------------------------------------------------------------

/** Default Lichess rating bucket for human stats (population). */
export const LINE_ANALYSIS_RATING_BUCKET = "1600-1800";

/** Engine depth for line analysis. */
export const LINE_ANALYSIS_DEPTH = 18;

/** Multi-PV count for candidate moves. */
export const LINE_ANALYSIS_MULTIPV = 5;

/** Stop expanding when entry probability drops below this (advancing only decreases it). */
export const LINE_ANALYSIS_MIN_ENTRY_PROBABILITY = 0.1;

/** Return line as "winning" when practical win rate (preparer view) at current position >= this. */
export const LINE_ANALYSIS_MIN_PRACTICAL_WIN_RATE = 0.65;

/** Only treat a line as "winning" (and stop expansion) after at least this many half-moves. Avoids trivial 2-ply lines. */
export const PREP_MIN_HALFMOVES_BEFORE_WINNING = 6;

/** Max half-moves per line (safety cap; bars and winning stop expansion earlier). */
export const PREP_EXPANSION_MAX_DEPTH = 30;

/** Estimated ms per position for line-analysis ETA (uncached). */
export const ESTIMATED_MS_PER_POSITION = 3000;

/** ETA only: assumed preparer branches per node (pruning controls actual expansion). */
export const ESTIMATED_PREPARER_BRANCHES = 3;

/** ETA only: assumed opponent branches per node (pruning controls actual expansion). */
export const ESTIMATED_OPPONENT_BRANCHES = 3;

// ---------------------------------------------------------------------------
// Opponent move distribution
// ---------------------------------------------------------------------------

/** Min opponent move probability to expand (don't branch on moves played e.g. 10% of the time). */
export const OPPONENT_MIN_PROBABILITY_TO_EXPAND = 0.1;

/** If one move has probability >= this, treat as forced (only expand that move). */
export const OPPONENT_FORCED_BRANCH_THRESHOLD = 0.75;

/** Min population games for a preparer move to be considered (in expandRealisticLines). */
export const PREP_MIN_POPULATION_GAMES = 5;

// ---------------------------------------------------------------------------
// Opening tree (UI)
// ---------------------------------------------------------------------------

/** Maximum half-moves to track in the opening tree. */
export const OPENING_TREE_MAX_DEPTH = 20;

/** Maximum lines returned in opening line searches. */
export const OPENING_MAX_RESULTS = 5;
