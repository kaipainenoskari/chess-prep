import { NextRequest, NextResponse } from "next/server";
import { fetchProfileCached, fetchAllGamesCached } from "@/lib/chess-com";
import { parseAllGames } from "@/lib/analysis/parse-games";
import { buildOpeningRepertoire } from "@/lib/analysis/openings";
import { analyzeTimeManagement } from "@/lib/analysis/time";
import { analyzePerformance } from "@/lib/analysis/performance";
import { detectWeaknesses } from "@/lib/analysis/weaknesses";
import {
  validateUsername,
  validateMonths,
  validateTimeClass,
  collectErrors,
  unwrap,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params;
    const searchParams = req.nextUrl.searchParams;

    const vUser = validateUsername(username);
    const vMonths = validateMonths(searchParams.get("months"));
    const vTime = validateTimeClass(searchParams.get("timeClass"));
    const errors = collectErrors(vUser, vMonths, vTime);
    if (errors) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const lowerUsername = unwrap(vUser);
    const months = unwrap(vMonths);
    const timeClass = unwrap(vTime);

    const [{ profile, stats }, rawGames] = await Promise.all([
      fetchProfileCached(lowerUsername),
      fetchAllGamesCached(lowerUsername, months),
    ]);

    const games = parseAllGames(rawGames, lowerUsername);
    const openings = buildOpeningRepertoire(games, timeClass);
    const timeProfile = analyzeTimeManagement(games, timeClass);
    const performance = analyzePerformance(games, timeClass);
    const { weaknesses, strengths } = detectWeaknesses(
      performance,
      openings,
      timeProfile,
    );

    return NextResponse.json({
      profile,
      stats,
      totalGames: games.length,
      performance,
      openings,
      timeProfile,
      weaknesses,
      strengths,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("404") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
