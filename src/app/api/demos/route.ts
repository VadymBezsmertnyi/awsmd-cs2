import { NextResponse } from "next/server";
import { listSampleDemos } from "@/server/services/demo-list-service";

export async function GET() {
  try {
    const body = await listSampleDemos();
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list demos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
