import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiHandlerOptionsT = {
  successStatus?: number;
};

export const apiHandler = async <T>(
  handler: () => Promise<T>,
  options: ApiHandlerOptionsT = {}
): Promise<NextResponse> => {
  const { successStatus = 200 } = options;

  try {
    const result = await handler();
    return NextResponse.json(result, { status: successStatus });
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    if (error instanceof ApiError) {
      const body =
        error.details !== undefined
          ? { error: error.message, details: error.details }
          : { error: error.message };
      return NextResponse.json(body, { status: error.status });
    }

    console.error(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
};
