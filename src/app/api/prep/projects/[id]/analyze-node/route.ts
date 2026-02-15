import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lineAnalysisQueue } from "@/lib/queue";
import { validateFen } from "@/lib/validation";

export const dynamic = "force-dynamic";

const ANALYSIS_STATUS_RUNNING = "ANALYSIS_RUNNING";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ error: "Project id is required." }, { status: 400 });
    }

    let body: { fen?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { errors: [{ field: "body", message: "Invalid JSON body." }] },
        { status: 400 },
      );
    }
    const vFen = validateFen(body.fen ?? null);
    if (!vFen.ok) {
      return NextResponse.json({ errors: vFen.errors }, { status: 400 });
    }
    const fen = vFen.data;

    const project = await prisma.prepProject.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    let node = await prisma.openingTreeNode.findUnique({
      where: { projectId_fen: { projectId, fen } },
    });
    if (node?.analysisStatus === ANALYSIS_STATUS_RUNNING && node.lastJobId) {
      return NextResponse.json({
        jobId: node.lastJobId,
        alreadyRunning: true,
      });
    }

    const job = await lineAnalysisQueue.add("analyze", { rootFen: fen, projectId });
    const jobId = job.id ?? "";

    await prisma.openingTreeNode.upsert({
      where: { projectId_fen: { projectId, fen } },
      create: {
        projectId,
        fen,
        move: "",
        gamesCount: 0,
        analysisStatus: ANALYSIS_STATUS_RUNNING,
        lastJobId: jobId,
      },
      update: {
        analysisStatus: ANALYSIS_STATUS_RUNNING,
        lastJobId: jobId,
      },
    });

    return NextResponse.json({ jobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
