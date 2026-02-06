import { NextRequest, NextResponse } from "next/server";
import { fetchCloudEval } from "@/lib/lichess";
import { validateFen } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const vFen = validateFen(req.nextUrl.searchParams.get("fen"));
    if (!vFen.ok) {
      return NextResponse.json({ errors: vFen.errors }, { status: 400 });
    }

    const evaluation = await fetchCloudEval(vFen.data);
    if (!evaluation) {
      return NextResponse.json({ error: "Evaluation not available" }, { status: 404 });
    }

    return NextResponse.json(evaluation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
