/**
 * GET /api/dashboard/stats?days=30
 * Chart data: attendance by department, time-of-arrival heatmap,
 * leaderboard, and per-department health score (avg attendance rate).
 * Same department scoping rules as the live board.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requirePermission, handleApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const viewer = await requirePermission("live:department");
    const seesAll = can(viewer.role, "live:all");
    const department = seesAll ? undefined : viewer.department;
    const days = Math.min(180, Number(req.nextUrl.searchParams.get("days")) || 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Parameterized fragment — safe composition, no string concatenation.
    const deptSql = department ? Prisma.sql`AND m.department = ${department}` : Prisma.empty;
    const deptFilter = department ? { member: { department } } : {};

    const [byDept, arrivals, leaderboard, memberCounts, attendedCounts, sessionCount] = await Promise.all([
      prisma.$queryRaw<{ department: string; count: bigint }[]>(Prisma.sql`
        SELECT m.department, COUNT(*) AS count
        FROM attendance a JOIN members m ON m.id = a.member_id
        WHERE a.check_in_at >= ${since} ${deptSql}
        GROUP BY m.department ORDER BY count DESC`),
      // Arrival heatmap: day-of-week × hour buckets
      prisma.$queryRaw<{ dow: number; hour: number; count: bigint }[]>(Prisma.sql`
        SELECT EXTRACT(DOW FROM a.check_in_at)::int AS dow,
               EXTRACT(HOUR FROM a.check_in_at)::int AS hour,
               COUNT(*) AS count
        FROM attendance a JOIN members m ON m.id = a.member_id
        WHERE a.check_in_at >= ${since} ${deptSql}
        GROUP BY 1, 2`),
      // Leaderboard: top volunteers by finalized hours
      prisma.attendance.groupBy({
        by: ["memberId"],
        where: { checkInAt: { gte: since }, durationMinutes: { not: null }, ...deptFilter },
        _sum: { durationMinutes: true },
        orderBy: { _sum: { durationMinutes: "desc" } },
        take: 10,
      }),
      prisma.member.groupBy({
        by: ["department"],
        where: { isActive: true, ...(department ? { department } : {}) },
        _count: true,
      }),
      prisma.$queryRaw<{ department: string; attended: bigint }[]>(Prisma.sql`
        SELECT m.department, COUNT(DISTINCT a.member_id) AS attended
        FROM attendance a JOIN members m ON m.id = a.member_id
        WHERE a.check_in_at >= ${since} ${deptSql}
        GROUP BY m.department`),
      prisma.session.count({ where: { startsAt: { gte: since } } }),
    ]);

    const leaders = await prisma.member.findMany({
      where: { id: { in: leaderboard.map((l) => l.memberId) } },
      select: { id: true, name: true, department: true, profilePhotoUrl: true },
    });
    const leaderMap = new Map(leaders.map((l) => [l.id, l]));

    // Department health score: % of active members who attended ≥1 session
    const attendedMap = new Map(attendedCounts.map((a) => [a.department, Number(a.attended)]));
    const health = memberCounts.map((mc) => ({
      department: mc.department,
      members: mc._count,
      attended: attendedMap.get(mc.department) ?? 0,
      score: mc._count > 0 ? Math.round(((attendedMap.get(mc.department) ?? 0) / mc._count) * 100) : 0,
    }));

    return NextResponse.json({
      days,
      sessionCount,
      byDepartment: byDept.map((d) => ({ department: d.department, count: Number(d.count) })),
      arrivalHeatmap: arrivals.map((a) => ({ dow: a.dow, hour: a.hour, count: Number(a.count) })),
      leaderboard: leaderboard.map((l) => ({
        member: leaderMap.get(l.memberId),
        minutes: l._sum.durationMinutes ?? 0,
      })),
      health,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
