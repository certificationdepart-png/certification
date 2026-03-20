import { createHash } from "node:crypto";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function getBucketKey(key: string, windowMs: number) {
  const windowId = Math.floor(Date.now() / windowMs);
  return `${key}:${windowId}`;
}

export function getRequestFingerprint(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const realIp = request.headers.get("x-real-ip") ?? "";
  const userAgent = request.headers.get("user-agent") ?? "";
  const source = `${forwardedFor}|${realIp}|${userAgent}`;
  return createHash("sha256").update(source).digest("hex").slice(0, 20);
}

export function applyRateLimit(options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const bucketKey = getBucketKey(options.key, options.windowMs);
  const existing = buckets.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + options.windowMs });
    return {
      allowed: true,
      retryAfterMs: options.windowMs,
      remaining: Math.max(options.limit - 1, 0),
    };
  }

  existing.count += 1;
  buckets.set(bucketKey, existing);
  const remaining = Math.max(options.limit - existing.count, 0);
  return {
    allowed: existing.count <= options.limit,
    retryAfterMs: Math.max(existing.resetAt - now, 0),
    remaining,
  };
}
