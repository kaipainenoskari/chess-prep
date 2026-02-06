import { NextRequest, NextResponse } from "next/server";
import { fetchProfileCached } from "@/lib/chess-com";
import { validateUsername } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params;
    const v = validateUsername(username);
    if (!v.ok) {
      return NextResponse.json({ errors: v.errors }, { status: 400 });
    }

    const data = await fetchProfileCached(v.data);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
