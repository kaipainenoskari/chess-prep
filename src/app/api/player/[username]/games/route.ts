import { NextRequest, NextResponse } from "next/server";
import { fetchAllGamesCached } from "@/lib/chess-com";
import { parseAllGames } from "@/lib/analysis/parse-games";
import {
  validateUsername,
  validateMonths,
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
    const errors = collectErrors(vUser, vMonths);
    if (errors) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const rawGames = await fetchAllGamesCached(unwrap(vUser), unwrap(vMonths));
    const parsed = parseAllGames(rawGames, unwrap(vUser));

    return NextResponse.json({ total: parsed.length, games: parsed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
