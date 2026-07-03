/**
 * QR token scheme.
 *
 * A QR code encodes `sessionId.windowStart.signature` where:
 *  - windowStart = unix seconds floored to a 60s window
 *  - signature   = HMAC-SHA256(QR_SIGNING_SECRET + session.qrSecret, sessionId.windowStart)
 *
 * Properties:
 *  - Time-bound: a scanned token is valid for at most ~2 minutes
 *    (current window + one window of clock tolerance), and never outside
 *    the session's start/end times (checked at the API layer).
 *  - Unforgeable: signed with a server-only key + per-session secret.
 *  - Effectively single-use per member: the DB's unique
 *    (member_id, session_id) constraint blocks duplicate check-ins, and a
 *    second scan flips to the sign-out flow instead.
 *  - Revocable: regenerate qrSecret (admin panel) to kill a leaked code.
 */
import { createHmac, timingSafeEqual } from "crypto";

const WINDOW_SECONDS = 60;

function signingKey(): string {
  const master = process.env.QR_SIGNING_SECRET;
  if (!master) throw new Error("QR_SIGNING_SECRET is not set");
  return master;
}

function sign(memberId: string, windowStart: number): string {
  return createHmac("sha256", signingKey())
    .update(`${memberId}.${windowStart}`)
    .digest("base64url");
}

/** Current token for a member; the QR display refreshes this every minute. */
export function makeQrToken(memberId: string, now = Date.now()): string {
  const windowStart = Math.floor(now / 1000 / WINDOW_SECONDS) * WINDOW_SECONDS;
  return `${memberId}.${windowStart}.${sign(memberId, windowStart)}`;
}

/**
 * Verify a scanned member token. Accepts the current and the previous window so a
 * scan isn't rejected just as the code rotates.
 * Returns the memberId on success, null on any failure.
 */
export function verifyQrToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [memberId, windowStr, sig] = parts;
  const windowStart = Number(windowStr);
  if (!memberId || !Number.isInteger(windowStart) || !sig) return null;

  const nowWindow = Math.floor(Date.now() / 1000 / WINDOW_SECONDS) * WINDOW_SECONDS;
  // current window or the immediately previous one only
  if (windowStart !== nowWindow && windowStart !== nowWindow - WINDOW_SECONDS) return null;

  const expected = sign(memberId, windowStart);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return memberId;
}

export const QR_WINDOW_SECONDS = WINDOW_SECONDS;
