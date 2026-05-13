import { NextResponse } from "next/server";
import {
  parseDemoRequestSchema,
  parseDemoResponseSchema,
} from "@/contracts/demos";
import { parseSelectedDemo } from "@/server/services/demo-parse-service";

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseDemoRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await parseSelectedDemo(parsed.data.fileName);
  const body = parseDemoResponseSchema.parse({ result });
  return NextResponse.json(body);
}
