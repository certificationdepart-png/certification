import { logger } from "./logger";

export function captureException(error: unknown, context?: Record<string, unknown>) {
  // Avoid importing server-only env validation in client bundles (e.g. app/error.tsx).
  const errorTrackingConfigured =
    typeof window === "undefined"
      ? Boolean(process.env.ERROR_TRACKING_DSN)
      : Boolean(process.env.NEXT_PUBLIC_ERROR_TRACKING_DSN);

  logger.error("Unhandled exception", {
    errorTrackingConfigured,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  });
}

