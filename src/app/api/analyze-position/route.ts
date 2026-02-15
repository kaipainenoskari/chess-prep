import { NextRequest, NextResponse } from "next/server";
import { lineAnalysisQueue } from "@/lib/queue";
import { validateFen } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
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

    const job = await lineAnalysisQueue.add("analyze", {
      rootFen: vFen.data,
    });
    return NextResponse.json({ jobId: job.id ?? "" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
