import {
  OPENING_MIN_GAMES,
  OPENING_WEAK_THRESHOLD,
  OPENING_WEAK_HIGH_SEVERITY,
  OPENING_STRONG_THRESHOLD,
  OPENING_STRONG_HIGH_SEVERITY,
  WEAKNESS_TIME_TROUBLE_RATE,
  WEAKNESS_TIME_TROUBLE_HIGH,
  WEAKNESS_PRESSURE_DROP,
  WEAKNESS_FLAG_RATE,
  WEAKNESS_FLAG_RATE_HIGH,
  WEAKNESS_COLOR_GAP,
  WEAKNESS_COLOR_MIN_GAMES,
  WEAKNESS_GAME_LENGTH_MIN,
  WEAKNESS_GAME_LENGTH_DELTA,
  WEAKNESS_TILT_THRESHOLD,
  WEAKNESS_TILT_HIGH,
  WEAKNESS_TILT_MIN_GAMES,
} from "../config";
import type { Weakness, OpeningRepertoire, TimeProfile } from "../types";
import type { PerformanceStats } from "./performance";
import { findWeakLines, findStrongLines } from "./openings";

/**
 * Auto-detect weaknesses and strengths from all analysis data.
 */
export function detectWeaknesses(
  perf: PerformanceStats,
  openings: OpeningRepertoire,
  timeProfile: TimeProfile,
): { weaknesses: Weakness[]; strengths: Weakness[] } {
  const weaknesses: Weakness[] = [];
  const strengths: Weakness[] = [];

  // ---- Opening weaknesses ----
  const weakWhiteLines = findWeakLines(
    openings.asWhite,
    OPENING_MIN_GAMES,
    OPENING_MIN_GAMES,
  );
  const weakBlackLines = findWeakLines(
    openings.asBlack,
    OPENING_MIN_GAMES,
    OPENING_MIN_GAMES,
  );

  for (const line of weakWhiteLines) {
    if (line.winRate < OPENING_WEAK_THRESHOLD && line.games >= OPENING_MIN_GAMES) {
      weaknesses.push({
        id: `opening-white-${line.move}-${line.fen.slice(0, 10)}`,
        category: "opening",
        severity: line.winRate < OPENING_WEAK_HIGH_SEVERITY ? "high" : "medium",
        title: `Weak as White after ${line.move}`,
        description: `Only ${Math.round(line.winRate * 100)}% win rate in ${line.games} games when playing ${line.move} as White.`,
        stat: `${Math.round(line.winRate * 100)}% win rate`,
        recommendation: "Prepare a line against their response or avoid this variation.",
      });
    }
  }

  for (const line of weakBlackLines) {
    if (line.winRate < OPENING_WEAK_THRESHOLD && line.games >= OPENING_MIN_GAMES) {
      weaknesses.push({
        id: `opening-black-${line.move}-${line.fen.slice(0, 10)}`,
        category: "opening",
        severity: line.winRate < OPENING_WEAK_HIGH_SEVERITY ? "high" : "medium",
        title: `Weak as Black after ${line.move}`,
        description: `Only ${Math.round(line.winRate * 100)}% win rate in ${line.games} games when facing ${line.move} as Black.`,
        stat: `${Math.round(line.winRate * 100)}% win rate`,
        recommendation: "Play this line to exploit their weakness.",
      });
    }
  }

  // ---- Opening strengths ----
  const strongWhiteLines = findStrongLines(
    openings.asWhite,
    OPENING_MIN_GAMES,
    OPENING_MIN_GAMES,
  );
  const strongBlackLines = findStrongLines(
    openings.asBlack,
    OPENING_MIN_GAMES,
    OPENING_MIN_GAMES,
  );

  for (const line of strongWhiteLines) {
    if (line.winRate > OPENING_STRONG_THRESHOLD && line.games >= OPENING_MIN_GAMES) {
      strengths.push({
        id: `opening-white-strong-${line.move}`,
        category: "opening",
        severity: line.winRate > OPENING_STRONG_HIGH_SEVERITY ? "high" : "medium",
        title: `Strong as White with ${line.move}`,
        description: `${Math.round(line.winRate * 100)}% win rate in ${line.games} games.`,
        stat: `${Math.round(line.winRate * 100)}% win rate`,
        recommendation: "Avoid letting them reach this position.",
      });
    }
  }

  for (const line of strongBlackLines) {
    if (line.winRate > OPENING_STRONG_THRESHOLD && line.games >= OPENING_MIN_GAMES) {
      strengths.push({
        id: `opening-black-strong-${line.move}`,
        category: "opening",
        severity: line.winRate > OPENING_STRONG_HIGH_SEVERITY ? "high" : "medium",
        title: `Strong as Black with ${line.move}`,
        description: `${Math.round(line.winRate * 100)}% win rate in ${line.games} games.`,
        stat: `${Math.round(line.winRate * 100)}% win rate`,
        recommendation: "Avoid this line if possible.",
      });
    }
  }

  // ---- Time management weaknesses ----
  const ts = timeProfile.troubleStats;
  if (ts.totalGames > 0) {
    const troubleRate = ts.below30s / ts.totalGames;
    if (troubleRate > WEAKNESS_TIME_TROUBLE_RATE) {
      weaknesses.push({
        id: "time-trouble-frequent",
        category: "time",
        severity: troubleRate > WEAKNESS_TIME_TROUBLE_HIGH ? "high" : "medium",
        title: "Frequent time trouble",
        description: `Gets below 30 seconds in ${Math.round(troubleRate * 100)}% of games (${ts.below30s}/${ts.totalGames}).`,
        stat: `${Math.round(troubleRate * 100)}% of games`,
        recommendation:
          "Play complex positions to burn their clock. Choose unfamiliar openings to force long thinks.",
      });
    }

    if (ts.winRateUnderPressure < ts.winRateComfortable - WEAKNESS_PRESSURE_DROP) {
      weaknesses.push({
        id: "time-pressure-performance",
        category: "time",
        severity:
          ts.winRateComfortable - ts.winRateUnderPressure > 20 ? "high" : "medium",
        title: "Cracks under time pressure",
        description: `Win rate drops from ${ts.winRateComfortable}% to ${ts.winRateUnderPressure}% when under time pressure.`,
        stat: `${ts.winRateComfortable - ts.winRateUnderPressure}% drop`,
        recommendation:
          "Aim to get them into time trouble by playing positions with many decisions.",
      });
    }

    const flagRate = ts.flagged / ts.totalGames;
    if (flagRate > WEAKNESS_FLAG_RATE) {
      weaknesses.push({
        id: "flagging-tendency",
        category: "time",
        severity: flagRate > WEAKNESS_FLAG_RATE_HIGH ? "high" : "medium",
        title: "Loses on time frequently",
        description: `Flagged in ${Math.round(flagRate * 100)}% of games (${ts.flagged}/${ts.totalGames}).`,
        stat: `${Math.round(flagRate * 100)}% flag rate`,
        recommendation:
          "In equal or slightly worse positions, play fast and let them run out of time.",
      });
    }
  }

  // ---- Colour weakness ----
  const colorDiff = Math.abs(perf.byColor.white.winRate - perf.byColor.black.winRate);
  if (
    colorDiff > WEAKNESS_COLOR_GAP &&
    perf.byColor.white.games >= WEAKNESS_COLOR_MIN_GAMES &&
    perf.byColor.black.games >= WEAKNESS_COLOR_MIN_GAMES
  ) {
    const weakColor =
      perf.byColor.white.winRate < perf.byColor.black.winRate ? "white" : "black";
    const weakRate = perf.byColor[weakColor].winRate;
    const strongColor = weakColor === "white" ? "black" : "white";
    const strongRate = perf.byColor[strongColor].winRate;

    weaknesses.push({
      id: "color-weakness",
      category: "color",
      severity: colorDiff > 20 ? "high" : "medium",
      title: `Weaker with ${weakColor} pieces`,
      description: `${weakRate}% win rate as ${weakColor} vs ${strongRate}% as ${strongColor}.`,
      stat: `${colorDiff}% gap`,
      recommendation: `Try to get ${weakColor} if you have the choice (e.g., in a match).`,
    });
  }

  // ---- Endgame weakness ----
  if (perf.byGameLength.long.games >= WEAKNESS_GAME_LENGTH_MIN) {
    if (perf.byGameLength.long.winRate < perf.winRate - WEAKNESS_GAME_LENGTH_DELTA) {
      weaknesses.push({
        id: "endgame-weakness",
        category: "endgame",
        severity: perf.winRate - perf.byGameLength.long.winRate > 20 ? "high" : "medium",
        title: "Struggles in long games / endgames",
        description: `${perf.byGameLength.long.winRate}% win rate in games over 40 moves vs ${perf.winRate}% overall.`,
        stat: `${perf.byGameLength.long.winRate}% in endgames`,
        recommendation:
          "Trade pieces and simplify into endgames. They are less comfortable in long games.",
      });
    }
    if (perf.byGameLength.long.winRate > perf.winRate + WEAKNESS_GAME_LENGTH_DELTA) {
      strengths.push({
        id: "endgame-strength",
        category: "endgame",
        severity: perf.byGameLength.long.winRate - perf.winRate > 20 ? "high" : "medium",
        title: "Strong in endgames",
        description: `${perf.byGameLength.long.winRate}% win rate in long games vs ${perf.winRate}% overall.`,
        stat: `${perf.byGameLength.long.winRate}% in endgames`,
        recommendation: "Avoid simplification. Keep the position complex and tactical.",
      });
    }
  }

  // ---- Short game strength / weakness ----
  if (perf.byGameLength.short.games >= WEAKNESS_GAME_LENGTH_MIN) {
    if (perf.byGameLength.short.winRate > perf.winRate + WEAKNESS_GAME_LENGTH_DELTA) {
      strengths.push({
        id: "tactical-strength",
        category: "general",
        severity: "medium",
        title: "Dangerous in short tactical games",
        description: `${perf.byGameLength.short.winRate}% win rate in games under 25 moves vs ${perf.winRate}% overall.`,
        stat: `${perf.byGameLength.short.winRate}% in short games`,
        recommendation: "Avoid sharp tactical complications. Play solid and positional.",
      });
    }
  }

  // ---- Tilt ----
  if (
    perf.tiltFactor < WEAKNESS_TILT_THRESHOLD &&
    perf.totalGames >= WEAKNESS_TILT_MIN_GAMES
  ) {
    weaknesses.push({
      id: "tilt",
      category: "tilt",
      severity: perf.tiltFactor < WEAKNESS_TILT_HIGH ? "high" : "medium",
      title: "Tilts after losses",
      description: `Win rate drops by ${Math.abs(perf.tiltFactor)}% in the game immediately following a loss.`,
      stat: `${Math.abs(perf.tiltFactor)}% drop after loss`,
      recommendation: "If you win the first game, keep the pressure on. They may spiral.",
    });
  }

  // Sort by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };
  weaknesses.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  strengths.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return { weaknesses, strengths };
}
