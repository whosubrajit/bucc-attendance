import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

export async function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): Promise<{ ok: boolean; remaining: number; retryAfterSeconds: number }> {
  const now = Date.now();
  const windowStart = new Date(now - windowMs);
  const result = await prisma.$queryRaw<{ count: number; window_start: Date }[]>`
    INSERT INTO rate_limit_buckets (id, key, window_start, count)
    VALUES (${randomUUID()}, ${key}, ${new Date(now)}, 1)
    ON CONFLICT (key) DO UPDATE
    SET
      window_start = CASE
        WHEN rate_limit_buckets.window_start <= ${windowStart}
        THEN EXCLUDED.window_start
        ELSE rate_limit_buckets.window_start
      END,
      count = CASE
        WHEN rate_limit_buckets.window_start <= ${windowStart}
        THEN 1
        ELSE rate_limit_buckets.count + 1
      END
    RETURNING count, window_start
  `;
  const bucket = result[0];
  if (!bucket) throw new Error("Rate limiter did not return a bucket");
  if (bucket.count > limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.window_start.getTime() + windowMs - now) / 1000),
    );
    return { ok: false, remaining: 0, retryAfterSeconds };
  }
  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/**
 * Manual/self check-in only. QR scanning is deliberately NOT rate limited —
 * an HR SE clearing a queue must never be throttled mid-event.
 */
export const ATTENDANCE_LIMIT = { limit: 100, windowMs: 5 * 60 * 1000 };
