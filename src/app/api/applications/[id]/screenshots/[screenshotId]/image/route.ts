import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { handleRouteError } from "@/lib/api-response";
import { applicationScreenshotParamsSchema } from "@/lib/api-validation";
import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { NotFoundError } from "@/services/errors";

type Params = { params: Promise<{ id: string; screenshotId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireApiSession(["admin", "manager"]);
    const raw = await params;
    const { id: applicationId, screenshotId } = applicationScreenshotParamsSchema.parse({
      id: raw.id,
      screenshotId: raw.screenshotId,
    });

    const screenshot = await prisma.applicationScreenshot.findFirst({
      where: {
        id: screenshotId,
        applicationId,
      },
      include: {
        application: {
          include: {
            school: { select: { telegramBotTokenEnc: true } },
          },
        },
      },
    });

    if (!screenshot) {
      throw new NotFoundError("Скріншот не знайдено");
    }

    let botToken: string;
    try {
      botToken = decryptSecret(screenshot.application.school.telegramBotTokenEnc);
    } catch (error) {
      // In some legacy/dev setups the encrypted token may not match the current DATA_ENCRYPTION_KEY.
      // Falling back to a single configured bot token is better than failing with 500.
      if (env.TELEGRAM_BOT_TOKEN) {
        logger.warn("telegram.screenshot_image.decrypt_failed_fallback", {
          message: error instanceof Error ? error.message : String(error),
        });
        botToken = env.TELEGRAM_BOT_TOKEN;
      } else {
        throw error;
      }
    }
    const getFileRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(screenshot.fileId)}`,
    );
    const getFileJson = (await getFileRes.json().catch(() => null)) as
      | { ok: boolean; result?: { file_path?: string } }
      | null;

    if (!getFileJson?.ok || typeof getFileJson.result?.file_path !== "string") {
      throw new NotFoundError("Файл недоступний");
    }

    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${getFileJson.result.file_path}`;
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      throw new NotFoundError("Не вдалося завантажити файл");
    }

    const contentType = fileRes.headers.get("content-type") ?? "image/jpeg";
    const body = fileRes.body;
    if (!body) {
      throw new NotFoundError("Не вдалося завантажити файл");
    }

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    // Do not log secrets (bot token), only the high-level error.
    if (error instanceof Error) {
      logger.error("telegram.screenshot_image_failed", {
        message: error.message,
        name: error.name,
      });
    } else {
      logger.error("telegram.screenshot_image_failed", { message: String(error) });
    }
    return handleRouteError(error);
  }
}
