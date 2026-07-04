/**
 * GET /api/dashboard/live?department=&status=&q=&date=&page=&pageSize=
 *
 * Live attendance board. Scope is enforced server-side:
 *  - HR_EB / HR_SE / GB → all departments (optionally filtered)
 *  - EB / SE            → own department only, regardless of query params
 *  - MEMBER             → 403
 */
import { NextRequest, NextResponse } from "next/server";
import { AttendanceStatus } from "@/lib/enums";
import { requirePermission, handleApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const viewer = await requirePermission("live:department");
    const p = req.nextUrl.searchParams;

    const seesAll = can(viewer.role, "live:all");
    // Server-side scoping — client-sent department is ignored for EB/SE.
    const department = seesAll ? p.get("department") || undefined : viewer.department;

    const status = p.get("status") as AttendanceStatus | null;
    const q = p.get("q")?.trim();
    const dateStr = p.get("date"); // YYYY-MM-DD, defaults to today
    const sessionId = p.get("sessionId");
    const page = Math.max(1, Number(p.get("page")) || 1);
    const pageSize = Math.min(200, Number(p.get("pageSize")) || 50);

    const day = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date(new Date().setHours(0, 0, 0, 0));
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);

    const where = {
      ...(sessionId ? { sessionId } : { checkInAt: { gte: day, lt: nextDay } }),
      ...(status && Object.values(AttendanceStatus).includes(status) ? { status } : {}),
      member: {
        ...(department ? { department } : {}),
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
    };

    const [rows, total, byStatus, byDepartment] = await Promise.all([
      prisma.attendance.findMany({
        where,
        orderBy: { checkInAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          member: { select: { name: true, department: true, designation: true, profilePhotoUrl: true } },
          session: { select: { name: true } },
        },
      }),
      prisma.attendance.count({ where }),
      prisma.attendance.groupBy({
        by: ["status"],
        where: { 
          ...(sessionId ? { sessionId } : { checkInAt: { gte: day, lt: nextDay } }), 
          ...(department ? { member: { department } } : {}) 
        },
        _count: true,
      }),
      // Per-department breakdown (only meaningful for global viewers)
      seesAll
        ? (sessionId
            ? prisma.$queryRaw<{ department: string; present: bigint; pending: bigint; left: bigint }[]>`
                SELECT m.department,
                       COUNT(*) FILTER (WHERE a.status = 'PRESENT')          AS present,
                       COUNT(*) FILTER (WHERE a.status = 'PENDING_SIGNOUT')  AS pending,
                       COUNT(*) FILTER (WHERE a.status = 'LEFT')             AS "left"
                FROM attendance a JOIN members m ON m.id = a.member_id
                WHERE a.session_id = ${sessionId}
                GROUP BY m.department ORDER BY m.department`
            : prisma.$queryRaw<{ department: string; present: bigint; pending: bigint; left: bigint }[]>`
                SELECT m.department,
                       COUNT(*) FILTER (WHERE a.status = 'PRESENT')          AS present,
                       COUNT(*) FILTER (WHERE a.status = 'PENDING_SIGNOUT')  AS pending,
                       COUNT(*) FILTER (WHERE a.status = 'LEFT')             AS "left"
                FROM attendance a JOIN members m ON m.id = a.member_id
                WHERE a.check_in_at >= ${day} AND a.check_in_at < ${nextDay}
                GROUP BY m.department ORDER BY m.department`)
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      scope: department ?? "ALL",
      rows,
      total,
      page,
      pageSize,
      counts: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      departments: byDepartment.map((d) => ({
        department: d.department,
        present: Number(d.present),
        pending: Number(d.pending),
        left: Number(d.left),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
