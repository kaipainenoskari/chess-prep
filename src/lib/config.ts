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

/** Redis cache TTL for engine analysis (PositionCache). */
export const CACHE_ENGINE_TTL = 30 * 86400; // 30 days

/** Redis cache TTL for Lichess human moves (LichessMoveCache). */
export const CACHE_LICHESS_TTL = 7 * 86400; // 7 days

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

/** Default number of months of game history to fetch (e.g. for player stats). */
export const DEFAULT_MONTHS_BACK = 6;

/** Months of games for prep projects. 0 = all games; N = last N months. */
export const PREP_MONTHS_BACK = 0;

/** Stockfish fallback depth when using chess-api.com. */
export const EVAL_FALLBACK_DEPTH = 16;

// ---------------------------------------------------------------------------
// Prep mode – scoring weights & thresholds
// ---------------------------------------------------------------------------

/** Weight (out of 100) for population effectiveness. */
export const PREP_WEIGHT_POPULATION = 30;

/** Weight (out of 100) for surprise value. */
export const PREP_WEIGHT_SURPRISE = 25;

/** Weight (out of 100) for opponent weakness exploitation. */
export const PREP_WEIGHT_WEAKNESS = 30;

/** Weight (out of 100) for engine soundness. */
export const PREP_WEIGHT_ENGINE = 15;

/** Minimum population games for a move to be considered. */
export const PREP_MIN_POPULATION_GAMES = 5;

/** Eval threshold (centipawns) below which a move is filtered out entirely. */
export const PREP_EVAL_FLOOR = -200;

/** Eval threshold for "speculative" tag. */
export const PREP_SPECULATIVE_THRESHOLD = -50;

/** Eval threshold for "sound" tag. */
export const PREP_SOUND_THRESHOLD = 50;

/** Opponent win-rate threshold for "weakness" tag. */
export const PREP_WEAKNESS_WINRATE = 0.4;

/** Default line depth (half-moves). */
export const PREP_LINE_DEPTH = 6;

/** Number of top candidates to fetch evals for. */
export const PREP_TOP_EVAL_COUNT = 5;

/** Number of top suggestions to build full lines for. */
export const PREP_TOP_LINE_COUNT = 3;

/** Min human win rate (0–1) to treat a line as "practically winning" when engine says worse. */
export const PREP_PRACTICAL_WIN_RATE_MIN = 0.55;

/** Allow root/preparer moves with engine eval down to this (cp) when human win rate is above threshold. */
export const PREP_ENGINE_FLOOR_PRACTICAL = -350;

/** Auto-enqueue line-analysis when user first visits an unscanned node. */
export const PREP_AUTO_ANALYZE_ON_VISIT = true;

/** Max analyze-node jobs to auto-enqueue per session (or per project) when visiting nodes. */
export const PREP_MAX_AUTO_ANALYZE_PER_SESSION = 10;

// ---------------------------------------------------------------------------
// Line analysis (job queue)
// ---------------------------------------------------------------------------

/** Engine depth for line analysis. */
export const LINE_ANALYSIS_DEPTH = 18;

/** Multi-PV count for candidate moves. */
export const LINE_ANALYSIS_MULTIPV = 5;

/** Half-move depth to expand each line. */
export const LINE_ANALYSIS_LINE_DEPTH = 6;

/** Prep expansion: half-move depth (used for prep projects). */
export const PREP_EXPANSION_DEPTH = 8;

/** Prep: max root candidates to expand (caps total lines per FEN). */
export const PREP_MAX_ROOT_CANDIDATES = 3;

/** Estimated ms per position for line-analysis ETA (uncached). */
export const ESTIMATED_MS_PER_POSITION = 3000;

/** Top N candidate moves to expand into lines. */
export const LINE_ANALYSIS_TOP_MOVES = 5;

/** Default Lichess rating bucket for human stats. */
export const LINE_ANALYSIS_RATING_BUCKET = "1600-1800";

// ---------------------------------------------------------------------------
// Line analysis – opponent-constrained expansion
// ---------------------------------------------------------------------------

/** Min opponent move probability to expand a branch (e.g. 5%). */
export const OPPONENT_MIN_MOVE_PROBABILITY = 0.05;

/** If one move has probability >= this, treat as forced (only expand that move). */
export const OPPONENT_FORCED_BRANCH_THRESHOLD = 0.75;

/** Max opponent moves to expand per position (1 = only most likely, 2 = allow one alternative). */
export const OPPONENT_MAX_BRANCHES = 2;

/** Min probability for a second opponent branch when no move reaches forced threshold. */
export const OPPONENT_SECOND_BRANCH_MIN_PROB = 0.15;

/** Min opponent games at this FEN to use player-only distribution; below this use Lichess only. */
export const OPPONENT_MIN_GAMES_FOR_PLAYER_ONLY = 4;

/** Weight for player (Chess.com) data when blending with Lichess (0–1). */
export const OPPONENT_PLAYER_WEIGHT = 0.8;

/** Weight for Lichess data when blending with player (0–1). Player + Lichess = 1. */
export const OPPONENT_LICHESS_WEIGHT = 0.2;

/** Min probability that opponent enters the line; below this we do not store. */
export const LINE_ANALYSIS_MIN_OPPONENT_ENTRY_PROBABILITY = 0.05;

/** Score weight for opponent move probability (higher = more realistic line). */
export const LINE_SCORE_WEIGHT_OPPONENT_PROBABILITY = 20;

/** Score penalty weight for opponent branching (more options = worse). */
export const LINE_SCORE_WEIGHT_BRANCHING = 10;

// ---------------------------------------------------------------------------
// Trap metrics (Phase 1 — trap pipeline)
// ---------------------------------------------------------------------------

/** Moves within this many cp of best count as "near best". */
export const MARGIN_NEAR_BEST_CP = 50;

/** Margin used when only one move in multipv (only-move signal). */
export const ONLY_MOVE_MARGIN_CP = 500;

/** Eval drop (cp) assumed for a move not in multipv. */
export const TRAP_DEFAULT_MOVE_EVAL_DROP_CP = 100;

/** Our eval (cp) above which position is "clearly winning". */
export const TRAP_WINNING_CP = 200;

/** Early bonus at critical index 0 (max). */
export const EARLY_BONUS_MAX = 50;

/** Early bonus decay per half-move (linear). */
export const EARLY_BONUS_DECAY_PER_HALFMOVE = 5;

// ---------------------------------------------------------------------------
// Trap detection (Phase 2 — isTrapNode thresholds)
// ---------------------------------------------------------------------------

/** Min margin (cp) between best and second-best for trap. */
export const TRAP_DETECTION_MARGIN_CP = 80;

/** Min narrowness (1/n_near_best) for trap. */
export const TRAP_DETECTION_NARROWNESS_MIN = 0.6;

/** Min probability opponent deviates from best move. */
export const TRAP_DETECTION_P_DEVIATE_MIN = 0.4;

/** Min expected mistake cp for trap. */
export const TRAP_DETECTION_EXPECTED_MISTAKE_CP = 80;

/** Min expected eval swing (cp) for trap. */
export const TRAP_DETECTION_EXPECTED_SWING_CP = 80;

/** Min probability we are winning after opponent mistake. */
export const TRAP_DETECTION_P_WINNING_MIN = 0.5;

/** Min entry probability (path) for trap. */
export const TRAP_DETECTION_ENTRY_PROBABILITY_MIN = 0.02;

// ---------------------------------------------------------------------------
// Root move selection (Phase 3 — trap-oriented candidates)
// ---------------------------------------------------------------------------

/** Root candidate: max count returned. */
export const ROOT_CANDIDATES_MAX = 5;

/** Min engine eval (cp) to consider a root move. */
export const ROOT_MIN_EVAL_CP = -50;

/** Min forcing margin or expected mistake cp (either) to consider a root move. */
export const ROOT_MIN_MARGIN_OR_MISTAKE_CP = 40;

// ---------------------------------------------------------------------------
// Trap-oriented expansion (Phase 4)
// ---------------------------------------------------------------------------

/** Max half-moves (plies) for trap-oriented expansion. */
export const MAX_TRAP_DEPTH = 12;

/** Don't terminate the line at a trap node until the line has at least this many half-moves (avoids cutting off after 1 preparer move). */
export const TRAP_MIN_HALFMOVES_BEFORE_TERMINAL = 4;

/** Min opponent move probability to expand a branch in trap expansion. */
export const TRAP_EXPANSION_MIN_OPPONENT_PROB = 0.1;

/** When Lichess data exists, only expand opponent moves that have at least this share in the population (so we don't suggest lines relying on moves played by e.g. 2% of players). */
export const TRAP_EXPANSION_MIN_LICHESS_PROB = 0.05;

/** Prune branch when entry probability drops below this. */
export const TRAP_EXPANSION_MIN_ENTRY_PROB = 0.02;

/** At each preparer node (after root), consider up to this many engine moves; 1 = only best. */
export const PREPARER_CANDIDATES_PER_NODE = 3;

/** At preparer nodes (after root): take up to this many moves by Lichess human win rate (practical moves). */
export const PREPARER_TOP_HUMAN_MOVES = 5;

/** Only consider preparer moves within this many cp of the best move. */
export const PREPARER_MAX_EVAL_GAP_CP = 50;
