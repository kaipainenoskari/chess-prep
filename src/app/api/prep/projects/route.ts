import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  validateUsername,
  validatePrepColor,
  validateRatingBucket,
  validateTimeClass,
  type ValidTimeClass,
  collectErrors,
  unwrap,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const projects = await prisma.prepProject.findMany({
      where: { status: "active" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        opponentUsername: true,
        color: true,
        ratingBucket: true,
        status: true,
        timeClass: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ projects });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: {
      opponentUsername?: string;
      color?: string;
      ratingBucket?: string;
      timeClass?: string | null;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { errors: [{ field: "body", message: "Invalid JSON body." }] },
        { status: 400 },
      );
    }
    const vUser = validateUsername(body.opponentUsername ?? "");
    const vColor = validatePrepColor(body.color ?? null);
    const vBucket = validateRatingBucket(body.ratingBucket ?? null);
    const vTime:
      | { ok: true; data: ValidTimeClass | null }
      | { ok: false; errors: { field: string; message: string }[] } =
      body.timeClass != null && body.timeClass !== ""
        ? validateTimeClass(body.timeClass)
        : { ok: true, data: null };
    const errors = collectErrors(vUser, vColor, vBucket, vTime);
    if (errors) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const project = await prisma.prepProject.create({
      data: {
        opponentUsername: unwrap(vUser),
        color: unwrap(vColor),
        ratingBucket: unwrap(vBucket),
        timeClass: unwrap(vTime),
      },
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
