/**
 * Central configuration for the Chess Prep application.
 * All magic numbers, thresholds, and API settings live here.
 */

// ---------------------------------------------------------------------------
// External API endpoints
// ---------------------------------------------------------------------------

export const CHESS_COM_API_BASE = "https://api.chess.com/pub";
export const CHESS_COM_USER_AGENT =
  process.env.CHESS_COM_USER_AGENT ?? "ChessPrepTool/1.0";

export const LICHESS_EXPLORER_BASE = "https://explorer.lichess.ovh/lichess";
export const LICHESS_CLOUD_EVAL_BASE = "https://lichess.org/api/cloud-eval";
export const CHESS_API_EVAL_BASE = "https://chess-api.com/v1";

// ---------------------------------------------------------------------------
// Cache durations (seconds)
// ---------------------------------------------------------------------------

/** How long player profile & stats stay cached. */
export const CACHE_PLAYER_STATS_TTL = 3600; // 1 hour

/** How long the current (latest) month of game archives stays cached. */
export const CACHE_CURRENT_MONTH_TTL = 3600; // 1 hour

/** How long Lichess opening explorer responses stay cached. */
export const CACHE_OPENING_EXPLORER_TTL = 7 * 86400; // 7 days

// ---------------------------------------------------------------------------
// Analysis – openings
// ---------------------------------------------------------------------------

/** Maximum half-moves to track in the opening tree. */
export const OPENING_TREE_MAX_DEPTH = 10;

/** Minimum game count for a line to appear in weak/strong reports. */
export const OPENING_MIN_GAMES = 3;

/** Maximum lines returned in weak/strong line searches. */
export const OPENING_MAX_RESULTS = 5;

/** Win-rate threshold below which an opening is flagged as a weakness. */
export const OPENING_WEAK_THRESHOLD = 0.4;

/** Win-rate threshold below which severity is upgraded to "high". */
export const OPENING_WEAK_HIGH_SEVERITY = 0.25;

/** Win-rate threshold above which an opening is flagged as a strength. */
export const OPENING_STRONG_THRESHOLD = 0.6;

/** Win-rate threshold above which severity is upgraded to "high". */
export const OPENING_STRONG_HIGH_SEVERITY = 0.75;

// ---------------------------------------------------------------------------
// Analysis – time management
// ---------------------------------------------------------------------------

/** Clock threshold (seconds) for "time trouble". */
export const TIME_TROUBLE_THRESHOLD = 30;

/** Clock threshold (seconds) for "severe time trouble". */
export const TIME_CRITICAL_THRESHOLD = 10;

/** Move boundary: opening phase ends at this half-move. */
export const PHASE_OPENING_END = 10;

/** Move boundary: middlegame phase ends at this half-move. */
export const PHASE_MIDDLEGAME_END = 25;

/** Max move shown in the average-clock chart. */
export const CLOCK_CHART_MAX_MOVE = 60;

// ---------------------------------------------------------------------------
// Analysis – weakness detection
// ---------------------------------------------------------------------------

/** Time-trouble rate above which we report a weakness. */
export const WEAKNESS_TIME_TROUBLE_RATE = 0.3;

/** Time-trouble rate above which severity is "high". */
export const WEAKNESS_TIME_TROUBLE_HIGH = 0.5;

/** Win-rate gap (percentage points) between pressure / comfortable. */
export const WEAKNESS_PRESSURE_DROP = 10;

/** Flag rate above which we report a weakness. */
export const WEAKNESS_FLAG_RATE = 0.1;

/** Flag rate above which severity is "high". */
export const WEAKNESS_FLAG_RATE_HIGH = 0.2;

/** Win-rate gap (percentage points) between colours to flag. */
export const WEAKNESS_COLOR_GAP = 10;

/** Minimum games per colour to report a colour weakness. */
export const WEAKNESS_COLOR_MIN_GAMES = 10;

/** Minimum games in a game-length bucket to report. */
export const WEAKNESS_GAME_LENGTH_MIN = 5;

/** Win-rate delta (percentage points) from overall to flag game-length weakness. */
export const WEAKNESS_GAME_LENGTH_DELTA = 10;

/** Tilt factor threshold (negative %) to report. */
export const WEAKNESS_TILT_THRESHOLD = -15;

/** Tilt factor threshold for "high" severity. */
export const WEAKNESS_TILT_HIGH = -25;

/** Minimum total games before tilt analysis is meaningful. */
export const WEAKNESS_TILT_MIN_GAMES = 20;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default number of months of game history to fetch. */
export const DEFAULT_MONTHS_BACK = 6;

/** Stockfish fallback depth when using chess-api.com. */
export const EVAL_FALLBACK_DEPTH = 16;
