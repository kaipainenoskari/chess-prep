import { NextRequest, NextResponse } from "next/server";
import { fetchOpeningExplorer } from "@/lib/lichess";
import {
  validateFen,
  validateSpeeds,
  validateRatings,
  collectErrors,
  unwrap,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;

    const vFen = validateFen(searchParams.get("fen"));
    const vSpeeds = validateSpeeds(searchParams.get("speeds"));
    const vRatings = validateRatings(searchParams.get("ratings"));
    const errors = collectErrors(vFen, vSpeeds, vRatings);
    if (errors) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const data = await fetchOpeningExplorer(
      unwrap(vFen),
      unwrap(vSpeeds),
      unwrap(vRatings),
    );
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
