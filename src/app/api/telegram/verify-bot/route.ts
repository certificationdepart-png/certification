import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";

const bodySchema = z.object({
  token: z.string().trim().min(5, "Токен занадто короткий"),
});

type TelegramGetMeOk = {
  ok: true;
  result: { id: number; is_bot: boolean; first_name: string; username?: string };
};

type TelegramGetMeErr = {
  ok: false;
  error_code?: number;
  description?: string;
};

export async function POST(request: Request) {
  try {
    await requireApiSession();
    const json: unknown = await request.json();
    const { token } = bodySchema.parse(json);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(t);
    }

    const data = (await res.json()) as TelegramGetMeOk | TelegramGetMeErr;

    if (!data.ok || !("result" in data) || !data.result?.is_bot) {
      return NextResponse.json(
        {
          ok: false as const,
          error: "Токен недійсний або бот недоступний. Перевірте значення та спробуйте ще раз.",
        },
        { status: 400 },
      );
    }

    const { first_name: firstName, username } = data.result;
    return NextResponse.json({
      ok: true as const,
      firstName,
      username: username ?? null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
