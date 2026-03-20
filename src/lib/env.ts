import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  DATA_ENCRYPTION_KEY: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  /** HTTPS base URL for Telegram setWebhook when tunneling (ngrok). Overrides NEXT_PUBLIC_APP_URL only for webhook hints. */
  NEXT_PUBLIC_TELEGRAM_WEBHOOK_BASE_URL: z.string().url().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  NOVA_POSHTA_API_KEY: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  /**
   * Safer alternative to `GOOGLE_SERVICE_ACCOUNT_JSON` for `.env` files:
   * set it to base64-encoded service account JSON.
   */
  GOOGLE_SERVICE_ACCOUNT_JSON_B64: z.string().optional(),
  CRON_SECRET: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().optional(),
  ),
  RATE_LIMIT_WEBHOOK_PER_MINUTE: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_CRON_PER_MINUTE: z.coerce.number().int().positive().default(20),
  ERROR_TRACKING_DSN: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().url().optional(),
  ),
}).superRefine((value, ctx) => {
  const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_URL);

  // Next builds run in `NODE_ENV=production` even locally.
  // We only enforce CRON_SECRET when actually running on Vercel.
  if (value.NODE_ENV === "production" && isVercel && !value.CRON_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["CRON_SECRET"],
      message: "CRON_SECRET must be configured on Vercel production",
    });
  }
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_TELEGRAM_WEBHOOK_BASE_URL: process.env.NEXT_PUBLIC_TELEGRAM_WEBHOOK_BASE_URL,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  NOVA_POSHTA_API_KEY: process.env.NOVA_POSHTA_API_KEY,
  GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  GOOGLE_SERVICE_ACCOUNT_JSON_B64: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64,
  CRON_SECRET: process.env.CRON_SECRET,
  RATE_LIMIT_WEBHOOK_PER_MINUTE: process.env.RATE_LIMIT_WEBHOOK_PER_MINUTE,
  RATE_LIMIT_CRON_PER_MINUTE: process.env.RATE_LIMIT_CRON_PER_MINUTE,
  ERROR_TRACKING_DSN: process.env.ERROR_TRACKING_DSN,
});

