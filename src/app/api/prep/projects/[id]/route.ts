import { NextRequest, NextResponse } from "next/server";
import { fetchAllGamesCached } from "@/lib/chess-com";
import { parseAllGames } from "@/lib/analysis/parse-games";
import { materializeProjectTree } from "@/lib/prep/materialize";
import { prisma } from "@/lib/prisma";
import { PREP_MONTHS_BACK } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Project id is required." }, { status: 400 });
    }

    const project = await prisma.prepProject.findUnique({
      where: { id },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const rawGames = await fetchAllGamesCached(
      project.opponentUsername,
      PREP_MONTHS_BACK,
    );
    const games = parseAllGames(rawGames, project.opponentUsername);
    const openings = await materializeProjectTree({
      projectId: project.id,
      games,
      timeClass: project.timeClass,
    });

    return NextResponse.json({
      project: {
        id: project.id,
        opponentUsername: project.opponentUsername,
        color: project.color,
        ratingBucket: project.ratingBucket,
        status: project.status,
        timeClass: project.timeClass,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      },
      openings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("404") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
