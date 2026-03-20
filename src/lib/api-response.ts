import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AppError } from "@/services/errors";

export function handleRouteError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: error.issues[0]?.message ?? "Помилка валідації",
        code: "validation_error",
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      error: "Внутрішня помилка сервера",
      code: "internal_error",
    },
    { status: 500 },
  );
}
