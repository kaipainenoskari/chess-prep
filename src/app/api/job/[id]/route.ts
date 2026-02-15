import { NextRequest, NextResponse } from "next/server";
import { lineAnalysisQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Job id is required." }, { status: 400 });
    }

    const job = await lineAnalysisQueue.getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const state = await job.getState();
    const response: {
      id: string;
      state: string;
      progress?: number;
      result?: unknown;
      failedReason?: string;
      lineAnalysisId?: string;
    } = {
      id: job.id ?? id,
      state,
    };
    if (job.progress !== undefined) response.progress = job.progress as number;
    if (job.returnvalue !== undefined) {
      response.result = job.returnvalue;
      const r = job.returnvalue as { lineAnalysisId?: string };
      if (r?.lineAnalysisId) response.lineAnalysisId = r.lineAnalysisId;
    }
    if (job.failedReason) response.failedReason = job.failedReason;

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
