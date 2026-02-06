import { NextRequest, NextResponse } from "next/server";
import { Chess } from "chess.js";
import { fetchOpeningExplorer, fetchCloudEval } from "@/lib/lichess";
import {
  scorePrepCandidates,
  applyEngineScores,
  candidateToSuggestion,
  buildPrepLine,
} from "@/lib/analysis/prep";
import { PREP_TOP_EVAL_COUNT, PREP_TOP_LINE_COUNT, PREP_LINE_DEPTH } from "@/lib/config";
import type { OpponentMoveInfo, PrepSuggestion } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PrepRequestBody {
  fen: string;
  ratings: string;
  speeds: string;
  playerColor: "white" | "black";
  opponentMoves: OpponentMoveInfo[];
  lineDepth?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PrepRequestBody;

    // Basic validation
    if (!body.fen || !body.ratings || !body.speeds || !body.playerColor) {
      return NextResponse.json(
        { error: "Missing required fields: fen, ratings, speeds, playerColor" },
        { status: 400 },
      );
    }

    // Verify the FEN is valid
    try {
      new Chess(body.fen);
    } catch {
      return NextResponse.json({ error: "Invalid FEN" }, { status: 400 });
    }

    const lineDepth = body.lineDepth ?? PREP_LINE_DEPTH;

    // 1. Fetch population data for this position
    const explorerData = await fetchOpeningExplorer(body.fen, body.speeds, body.ratings);

    if (explorerData.moves.length === 0) {
      return NextResponse.json([]);
    }

    // 2. Score candidates against opponent data
    const candidates = scorePrepCandidates(
      explorerData.moves,
      body.opponentMoves ?? [],
      body.playerColor,
    );

    if (candidates.length === 0) {
      return NextResponse.json([]);
    }

    // 3. Fetch engine evals for the top N candidates (in parallel)
    const topForEval = candidates.slice(0, PREP_TOP_EVAL_COUNT);
    const evalMap = new Map<string, number>();

    const evalPromises = topForEval.map(async (c) => {
      try {
        const chessClone = new Chess(body.fen);
        chessClone.move(c.move);
        const evalResult = await fetchCloudEval(chessClone.fen());
        if (evalResult) {
          // eval is from White's perspective; normalize to preparer's
          const cpForPreparer =
            body.playerColor === "white" ? evalResult.eval : -evalResult.eval;
          evalMap.set(c.move, cpForPreparer);
        }
      } catch {
        // Eval not available for this move — skip
      }
    });

    await Promise.all(evalPromises);

    // 4. Refine scores with engine data
    const refined = applyEngineScores(candidates, evalMap);

    // 5. Build full prep lines for top N suggestions
    const topForLines = refined.slice(0, PREP_TOP_LINE_COUNT);
    const suggestions: PrepSuggestion[] = [];

    for (const candidate of topForLines) {
      const engineEval = evalMap.get(candidate.move) ?? null;
      const suggestion = candidateToSuggestion(candidate, engineEval);

      try {
        suggestion.line = await buildPrepLine(
          body.fen,
          candidate.move,
          body.playerColor,
          body.ratings,
          body.speeds,
          lineDepth,
          fetchOpeningExplorer,
        );
      } catch {
        // Line building failed — return suggestion without line
      }

      suggestions.push(suggestion);
    }

    // Also include remaining candidates (without lines) for completeness
    for (let i = PREP_TOP_LINE_COUNT; i < Math.min(refined.length, 8); i++) {
      const engineEval = evalMap.get(refined[i].move) ?? null;
      suggestions.push(candidateToSuggestion(refined[i], engineEval));
    }

    return NextResponse.json(suggestions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
