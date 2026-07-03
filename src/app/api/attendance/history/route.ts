/**
 * GET /api/attendance/history?page=1&pageSize=20
 * The member's own attendance history + lifetime volunteering totals.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireMember, handleApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const member = await requireMember();
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Number(req.nextUrl.searchParams.get("pageSize")) || 20);

    const [rows, total, agg] = await Promise.all([
      prisma.attendance.findMany({
        where: { memberId: member.id },
        orderBy: { checkInAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { session: { select: { name: true, venue: true } } },
      }),
      prisma.attendance.count({ where: { memberId: member.id } }),
      prisma.attendance.aggregate({
        where: { memberId: member.id, durationMinutes: { not: null } },
        _sum: { durationMinutes: true },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      rows,
      total,
      page,
      pageSize,
      totalMinutes: agg._sum.durationMinutes ?? 0,
      completedSessions: agg._count,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
