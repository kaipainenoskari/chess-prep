import type { ParsedGame } from "../types";

export interface PerformanceStats {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  byColor: {
    white: {
      games: number;
      wins: number;
      draws: number;
      losses: number;
      winRate: number;
    };
    black: {
      games: number;
      wins: number;
      draws: number;
      losses: number;
      winRate: number;
    };
  };
  byTimeControl: Record<string, { games: number; wins: number; winRate: number }>;
  byGameLength: {
    short: { games: number; winRate: number }; // < 25 moves
    medium: { games: number; winRate: number }; // 25-40 moves
    long: { games: number; winRate: number }; // > 40 moves
  };
  recentForm: ("W" | "L" | "D")[];
  tiltFactor: number; // win rate after a loss vs overall
  avgAccuracy: number | null;
}

export function analyzePerformance(
  games: ParsedGame[],
  timeClassFilter?: string,
): PerformanceStats {
  const filtered =
    timeClassFilter && timeClassFilter !== "all"
      ? games.filter((g) => g.timeClass === timeClassFilter)
      : games;

  const totalGames = filtered.length;
  const wins = filtered.filter((g) => g.result === "win").length;
  const losses = filtered.filter((g) => g.result === "loss").length;
  const draws = filtered.filter((g) => g.result === "draw").length;

  // By color
  const whiteGames = filtered.filter((g) => g.playerColor === "white");
  const blackGames = filtered.filter((g) => g.playerColor === "black");

  // By time control
  const byTimeControl: Record<string, { games: number; wins: number; winRate: number }> =
    {};
  for (const tc of ["bullet", "blitz", "rapid"]) {
    const tcGames = filtered.filter((g) => g.timeClass === tc);
    const tcWins = tcGames.filter((g) => g.result === "win").length;
    byTimeControl[tc] = {
      games: tcGames.length,
      wins: tcWins,
      winRate: tcGames.length > 0 ? Math.round((tcWins / tcGames.length) * 100) : 0,
    };
  }

  // By game length
  const shortGames = filtered.filter((g) => g.numMoves < 25);
  const mediumGames = filtered.filter((g) => g.numMoves >= 25 && g.numMoves <= 40);
  const longGames = filtered.filter((g) => g.numMoves > 40);

  // Recent form (last 20 games)
  const recent = filtered.slice(-20);
  const recentForm = recent.map((g) =>
    g.result === "win"
      ? ("W" as const)
      : g.result === "loss"
        ? ("L" as const)
        : ("D" as const),
  );

  // Tilt factor: win rate in game immediately after a loss
  let afterLossGames = 0;
  let afterLossWins = 0;
  for (let i = 1; i < filtered.length; i++) {
    if (filtered[i - 1].result === "loss") {
      afterLossGames++;
      if (filtered[i].result === "win") afterLossWins++;
    }
  }
  const overallWinRate = totalGames > 0 ? wins / totalGames : 0;
  const afterLossWinRate =
    afterLossGames > 0 ? afterLossWins / afterLossGames : overallWinRate;
  const tiltFactor =
    overallWinRate > 0
      ? Math.round(((afterLossWinRate - overallWinRate) / overallWinRate) * 100)
      : 0;

  // Average accuracy
  const gamesWithAccuracy = filtered.filter((g) => g.accuracy != null);
  const avgAccuracy =
    gamesWithAccuracy.length > 0
      ? Math.round(
          (gamesWithAccuracy.reduce((sum, g) => sum + (g.accuracy ?? 0), 0) /
            gamesWithAccuracy.length) *
            10,
        ) / 10
      : null;

  return {
    totalGames,
    wins,
    losses,
    draws,
    winRate: totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0,
    byColor: {
      white: {
        games: whiteGames.length,
        wins: whiteGames.filter((g) => g.result === "win").length,
        draws: whiteGames.filter((g) => g.result === "draw").length,
        losses: whiteGames.filter((g) => g.result === "loss").length,
        winRate:
          whiteGames.length > 0
            ? Math.round(
                (whiteGames.filter((g) => g.result === "win").length /
                  whiteGames.length) *
                  100,
              )
            : 0,
      },
      black: {
        games: blackGames.length,
        wins: blackGames.filter((g) => g.result === "win").length,
        draws: blackGames.filter((g) => g.result === "draw").length,
        losses: blackGames.filter((g) => g.result === "loss").length,
        winRate:
          blackGames.length > 0
            ? Math.round(
                (blackGames.filter((g) => g.result === "win").length /
                  blackGames.length) *
                  100,
              )
            : 0,
      },
    },
    byTimeControl,
    byGameLength: {
      short: {
        games: shortGames.length,
        winRate:
          shortGames.length > 0
            ? Math.round(
                (shortGames.filter((g) => g.result === "win").length /
                  shortGames.length) *
                  100,
              )
            : 0,
      },
      medium: {
        games: mediumGames.length,
        winRate:
          mediumGames.length > 0
            ? Math.round(
                (mediumGames.filter((g) => g.result === "win").length /
                  mediumGames.length) *
                  100,
              )
            : 0,
      },
      long: {
        games: longGames.length,
        winRate:
          longGames.length > 0
            ? Math.round(
                (longGames.filter((g) => g.result === "win").length / longGames.length) *
                  100,
              )
            : 0,
      },
    },
    recentForm,
    tiltFactor,
    avgAccuracy,
  };
}
