import { NextResponse } from "next/server";

import { apiHandler } from "@/src/server/api-handler";

import { parseDemoRequestSchema } from "../demos.schemas";
import { postParseDemo } from "../demos.service";

export const POST = async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  return apiHandler(async () => {
    const input = parseDemoRequestSchema.parse(body);
    return postParseDemo(input);
  });
};
