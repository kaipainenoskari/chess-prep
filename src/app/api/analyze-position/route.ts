import { NextRequest, NextResponse } from "next/server";
import { lineAnalysisQueue } from "@/lib/queue";
import type { LineAnalysisOptions } from "@/lib/queue/processor";
import { validateFen, validateRatingBucket } from "@/lib/validation";

export const dynamic = "force-dynamic";

function clampProbability(n: number): number {
  return Math.max(0, Math.min(1, Number(n)));
}

function parseOptions(
  raw: unknown,
):
  | { ok: true; data: LineAnalysisOptions }
  | { ok: false; errors: { field: string; message: string }[] } {
  if (raw == null || typeof raw !== "object") {
    return { ok: true, data: {} };
  }
  const o = raw as Record<string, unknown>;
  const options: LineAnalysisOptions = {};
  if (typeof o.ratingBucket === "string" && o.ratingBucket.trim()) {
    const v = validateRatingBucket(o.ratingBucket);
    if (!v.ok) return { ok: false, errors: v.errors };
    options.ratingBucket = v.data;
  }
  if (
    typeof o.minEntryProbability === "number" &&
    Number.isFinite(o.minEntryProbability)
  ) {
    options.minEntryProbability = clampProbability(o.minEntryProbability);
  }
  if (
    typeof o.minPracticalWinRate === "number" &&
    Number.isFinite(o.minPracticalWinRate)
  ) {
    options.minPracticalWinRate = clampProbability(o.minPracticalWinRate);
  }
  if (
    typeof o.minOpponentProbabilityToExpand === "number" &&
    Number.isFinite(o.minOpponentProbabilityToExpand)
  ) {
    options.minOpponentProbabilityToExpand = clampProbability(
      o.minOpponentProbabilityToExpand,
    );
  }
  return { ok: true, data: options };
}

export async function POST(req: NextRequest) {
  try {
    let body: { fen?: string; options?: unknown };
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
    const vOptions = parseOptions(body.options);
    if (!vOptions.ok) {
      return NextResponse.json({ errors: vOptions.errors }, { status: 400 });
    }

    const job = await lineAnalysisQueue.add("analyze", {
      rootFen: vFen.data,
      options: Object.keys(vOptions.data).length > 0 ? vOptions.data : undefined,
    });
    return NextResponse.json({ jobId: job.id ?? "" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
