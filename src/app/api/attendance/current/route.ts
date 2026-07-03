/**
 * GET /api/attendance/current
 * The member's live status: active sessions open for check-in and their
 * own attendance record in each (drives the /attend page + personal view).
 */
import { NextResponse } from "next/server";
import { requireMember, handleApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const member = await requireMember();
    const now = new Date();
    const sessions = await prisma.session.findMany({
      where: {
        isActive: true,
        startsAt: { lt: new Date(now.getTime() + 30 * 60 * 1000) }, // 30-min early grace
        endsAt: { gt: now },
      },
      orderBy: { startsAt: "asc" },
      select: { id: true, name: true, venue: true, startsAt: true, endsAt: true },
    });
    const attendance = await prisma.attendance.findMany({
      where: { memberId: member.id, sessionId: { in: sessions.map((s) => s.id) } },
      orderBy: { checkInAt: "asc" },
      select: { sessionId: true, status: true, checkInAt: true, checkOutRequestedAt: true },
    });
    const byS = new Map(attendance.map((a) => [a.sessionId, a]));
    return NextResponse.json({
      sessions: sessions.map((s) => ({ ...s, attendance: byS.get(s.id) ?? null })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
