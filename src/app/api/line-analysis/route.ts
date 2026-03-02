import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateFen } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * GET /api/line-analysis?rootFen=...
 * Returns all LineAnalysis rows for the given root FEN (for UI after job completes).
 */
export async function GET(req: NextRequest) {
  try {
    const rootFen = req.nextUrl.searchParams.get("rootFen");
    const vFen = validateFen(rootFen);
    if (!vFen.ok) {
      return NextResponse.json({ errors: vFen.errors }, { status: 400 });
    }

    const lines = await prisma.lineAnalysis.findMany({
      where: { rootFen: vFen.data },
      orderBy: { score: "desc" },
    });

    return NextResponse.json({
      rootFen: vFen.data,
      lines: lines.map((l) => ({
        id: l.id,
        rootFen: l.rootFen,
        lineMoves: l.lineMoves as string[],
        score: l.score,
        metricsJson: l.metricsJson,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
