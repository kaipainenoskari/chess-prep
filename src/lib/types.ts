// ---- Chess.com API types ----

export interface ChessComProfile {
  username: string;
  player_id: number;
  url: string;
  name?: string;
  title?: string;
  avatar?: string;
  location?: string;
  country?: string;
  joined: number;
  last_online: number;
  followers: number;
  is_streamer: boolean;
  verified: boolean;
}

export interface ChessComRating {
  last: { rating: number; date: number; rd: number };
  best?: { rating: number; date: number; game: string };
  record: { win: number; loss: number; draw: number };
}

export interface ChessComStats {
  chess_rapid?: ChessComRating;
  chess_blitz?: ChessComRating;
  chess_bullet?: ChessComRating;
  chess_daily?: ChessComRating;
  fide?: number;
  tactics?: {
    highest: { rating: number; date: number };
    lowest: { rating: number; date: number };
  };
}

export interface ChessComGamePlayer {
  rating: number;
  result: string; // "win" | "checkmated" | "timeout" | "resigned" | "stalemate" | "agreed" | "repetition" | "insufficient" | "50move" | "abandoned" | "timevsinsufficient"
  username: string;
  uuid?: string;
}

export interface ChessComGame {
  url: string;
  pgn: string;
  time_control: string;
  time_class: "bullet" | "blitz" | "rapid" | "daily" | "correspondence";
  rules: string;
  rated: boolean;
  tcn?: string;
  uuid: string;
  initial_setup?: string;
  fen: string;
  start_time?: number;
  end_time: number;
  accuracies?: { white: number; black: number };
  white: ChessComGamePlayer;
  black: ChessComGamePlayer;
}

// ---- Parsed / analyzed types ----

export type TimeClass = "bullet" | "blitz" | "rapid" | "all";

export type GameResult = "win" | "loss" | "draw";

export interface ParsedGame {
  url: string;
  uuid: string;
  playerColor: "white" | "black";
  opponentUsername: string;
  playerRating: number;
  opponentRating: number;
  result: GameResult;
  resultDetail: string; // "checkmate", "resigned", "timeout", etc.
  timeClass: "bullet" | "blitz" | "rapid" | "daily";
  timeControl: string;
  eco: string;
  openingName: string;
  moves: string[]; // SAN moves
  clocks: number[]; // clock times in seconds for each half-move
  numMoves: number; // full moves
  endTime: number; // unix timestamp
  accuracy?: number;
  fen: string;
}

export interface OpeningNode {
  move: string; // SAN move, e.g. "e4"
  fen: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  // Population comparison from Lichess
  populationGames?: number;
  populationWinRate?: number;
  delta?: number; // player winRate - populationWinRate
  children: OpeningNode[];
}

export interface OpeningRepertoire {
  asWhite: OpeningNode;
  asBlack: OpeningNode;
}

export interface TimeTroubleStats {
  totalGames: number;
  below30s: number;
  below10s: number;
  flagged: number;
  winRateUnderPressure: number; // when below 30s at any point
  winRateComfortable: number; // when never below 30s
}

export interface TimeProfile {
  avgClockByMove: { move: number; avgClock: number }[];
  timeAllocation: { phase: string; percentage: number }[];
  troubleStats: TimeTroubleStats;
}

export interface Weakness {
  id: string;
  category: "opening" | "time" | "color" | "endgame" | "tilt" | "general";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  stat: string; // e.g. "35% win rate"
  recommendation?: string;
}

export interface AnalysisResult {
  profile: ChessComProfile;
  stats: ChessComStats;
  games: ParsedGame[];
  openings: OpeningRepertoire;
  timeProfile: TimeProfile;
  weaknesses: Weakness[];
  strengths: Weakness[]; // reuse same shape
}

// Lichess explorer response
export interface LichessExplorerMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating: number;
}

export interface LichessExplorerResponse {
  white: number;
  draws: number;
  black: number;
  moves: LichessExplorerMove[];
  topGames: unknown[];
  opening: { eco: string; name: string } | null;
}
