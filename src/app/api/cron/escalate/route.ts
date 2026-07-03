/**
 * GET /api/cron/escalate — the auto-timeout worker.
 *
 * Vercel Cron hits this every 5 minutes (see vercel.json). Self-hosted?
 * Point any scheduler at it with `Authorization: Bearer $CRON_SECRET`.
 *
 *  - Requests pending > 30 min  → escalate to GB + HR_SE
 *  - Requests pending > 2 hours → auto-approve + flag needs_review
 */
import { NextRequest, NextResponse } from "next/server";
import { escalateStaleRequests } from "@/lib/attendance-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await escalateStaleRequests();
  return NextResponse.json(result);
}
