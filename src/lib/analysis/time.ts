import type { ParsedGame, TimeProfile, TimeTroubleStats } from "../types";

const TIME_TROUBLE_THRESHOLD = 30;
const TIME_CRITICAL_THRESHOLD = 10;
const PHASE_OPENING_END = 10;
const PHASE_MIDDLEGAME_END = 25;
const CLOCK_CHART_MAX_MOVE = 60;

/**
 * Extract the player's clock times from a game.
 * Clocks alternate: white move 1, black move 1, white move 2, ...
 */
function getPlayerClocks(game: ParsedGame): number[] {
  const startIndex = game.playerColor === "white" ? 0 : 1;
  const playerClocks: number[] = [];
  for (let i = startIndex; i < game.clocks.length; i += 2) {
    playerClocks.push(game.clocks[i]);
  }
  return playerClocks;
}

/**
 * Parse the initial time from a time-control string.
 * Format: "600" or "180+2" or "300+0"
 */
function getInitialTime(timeControl: string): number {
  const parts = timeControl.split("+");
  return parseInt(parts[0], 10) || 600;
}

/**
 * Build a comprehensive time-management profile.
 */
export function analyzeTimeManagement(
  games: ParsedGame[],
  timeClassFilter?: string,
): TimeProfile {
  const filtered = (
    timeClassFilter && timeClassFilter !== "all"
      ? games.filter((g) => g.timeClass === timeClassFilter)
      : games
  ).filter((g) => g.clocks.length >= 4);

  if (filtered.length === 0) {
    return {
      avgClockByMove: [],
      timeAllocation: [],
      troubleStats: {
        totalGames: 0,
        below30s: 0,
        below10s: 0,
        flagged: 0,
        winRateUnderPressure: 0,
        winRateComfortable: 0,
      },
    };
  }

  const clockSums = new Map<number, { total: number; count: number }>();
  let gamesBelow30 = 0;
  let gamesBelow10 = 0;
  let gamesFlagged = 0;
  let winsUnderPressure = 0;
  let gamesUnderPressure = 0;
  let winsComfortable = 0;
  let gamesComfortable = 0;

  const phases = { opening: 0, middlegame: 0, endgame: 0 };
  let totalTimeSpent = 0;

  for (const game of filtered) {
    const playerClocks = getPlayerClocks(game);
    if (playerClocks.length < 2) continue;

    const initialTime = getInitialTime(game.timeControl);
    let wasBelow30 = false;
    let wasBelow10 = false;

    for (let i = 0; i < playerClocks.length; i++) {
      const moveNum = i + 1;
      const clock = playerClocks[i];

      const existing = clockSums.get(moveNum) || { total: 0, count: 0 };
      existing.total += clock;
      existing.count++;
      clockSums.set(moveNum, existing);

      if (clock < TIME_TROUBLE_THRESHOLD) wasBelow30 = true;
      if (clock < TIME_CRITICAL_THRESHOLD) wasBelow10 = true;

      const timeSpent =
        i === 0 ? initialTime - clock : Math.max(0, playerClocks[i - 1] - clock);

      if (moveNum <= PHASE_OPENING_END) phases.opening += timeSpent;
      else if (moveNum <= PHASE_MIDDLEGAME_END) phases.middlegame += timeSpent;
      else phases.endgame += timeSpent;

      totalTimeSpent += timeSpent;
    }

    if (wasBelow30) {
      gamesBelow30++;
      gamesUnderPressure++;
      if (game.result === "win") winsUnderPressure++;
    } else {
      gamesComfortable++;
      if (game.result === "win") winsComfortable++;
    }

    if (wasBelow10) gamesBelow10++;
    if (game.resultDetail === "timeout" && game.result === "loss") {
      gamesFlagged++;
    }
  }

  // Build average-clock curve
  const avgClockByMove: { move: number; avgClock: number }[] = [];
  const maxMove = Math.min(
    CLOCK_CHART_MAX_MOVE,
    Math.max(...Array.from(clockSums.keys())),
  );
  for (let m = 1; m <= maxMove; m++) {
    const data = clockSums.get(m);
    if (data && data.count >= Math.max(2, filtered.length * 0.1)) {
      avgClockByMove.push({
        move: m,
        avgClock: Math.round(data.total / data.count),
      });
    }
  }

  const timeAllocation =
    totalTimeSpent > 0
      ? [
          {
            phase: "Opening (1-10)",
            percentage: Math.round((phases.opening / totalTimeSpent) * 100),
          },
          {
            phase: "Middlegame (11-25)",
            percentage: Math.round((phases.middlegame / totalTimeSpent) * 100),
          },
          {
            phase: "Endgame (26+)",
            percentage: Math.round((phases.endgame / totalTimeSpent) * 100),
          },
        ]
      : [];

  const troubleStats: TimeTroubleStats = {
    totalGames: filtered.length,
    below30s: gamesBelow30,
    below10s: gamesBelow10,
    flagged: gamesFlagged,
    winRateUnderPressure:
      gamesUnderPressure > 0
        ? Math.round((winsUnderPressure / gamesUnderPressure) * 100)
        : 0,
    winRateComfortable:
      gamesComfortable > 0 ? Math.round((winsComfortable / gamesComfortable) * 100) : 0,
  };

  return { avgClockByMove, timeAllocation, troubleStats };
}
