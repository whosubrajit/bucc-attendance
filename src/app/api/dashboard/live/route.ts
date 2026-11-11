/**
 * GET /api/dashboard/live?department=&status=&q=&date=&page=&pageSize=
 *
 * Live attendance board. Scope is enforced server-side:
 *  - HR_EB / HR_SE / GB → all departments (optionally filtered)
 *  - EB / SE            → own department only, regardless of query params
 *  - MEMBER             → 403
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { AttendanceStatus } from "@/lib/enums";
import { requirePermission, handleApiError, ApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";
const MAX_LIVE_ROWS = 5000;

export async function GET(req: NextRequest) {
  try {
    const viewer = await requirePermission("live:department");
    const p = req.nextUrl.searchParams;

    const seesAll = can(viewer.role, "live:all");
    // Server-side scoping — client-sent department is ignored for EB/SE.
    const department = seesAll ? p.get("department") || undefined : viewer.department;

    const requestedStatus = p.get("status") as AttendanceStatus | null;
    const status = requestedStatus && Object.values(AttendanceStatus).includes(requestedStatus)
      ? requestedStatus
      : undefined;
    const q = p.get("q")?.trim();
    const dateStr = p.get("date"); // YYYY-MM-DD, defaults to today
    const sessionId = p.get("sessionId");
    const page = Math.max(1, Number(p.get("page")) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(p.get("pageSize")) || 50));

    if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new ApiError(400, "Invalid date filter");
    }
    const day = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date(new Date().setHours(0, 0, 0, 0));
    if (Number.isNaN(day.getTime())) {
      throw new ApiError(400, "Invalid date filter");
    }
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);

    const where = {
      ...(sessionId ? { sessionId } : { checkInAt: { gte: day, lt: nextDay } }),
      ...(status ? { status } : {}),
      member: {
        ...(department ? { department } : {}),
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
    };

    const [rows, total, byStatus, byDepartment] = await Promise.all([
      prisma.attendance.findMany({
        where,
        take: MAX_LIVE_ROWS + 1,
        select: {
          id: true,
          checkInAt: true,
          checkOutApprovedAt: true,
          checkOutRequestedAt: true,
          status: true,
          member: { select: { name: true, department: true, designation: true } },
          session: { select: { name: true } },
        },
      }),
      prisma.attendance.count({ where }),
      prisma.attendance.groupBy({
        by: ["status"],
        where,
        _count: true,
      }),
      // Per-department breakdown (only meaningful for global viewers)
      seesAll
        ? (sessionId
            ? prisma.$queryRaw<{ department: string; present: bigint; pending: bigint; left: bigint }[]>(Prisma.sql`
                SELECT m.department,
                       COUNT(*) FILTER (WHERE a.status = 'PRESENT')          AS present,
                       COUNT(*) FILTER (WHERE a.status = 'PENDING_SIGNOUT')  AS pending,
                       COUNT(*) FILTER (WHERE a.status IN ('LEFT', 'LEFT_FORCED')) AS "left"
                FROM attendance a JOIN members m ON m.id = a.member_id
                WHERE a.session_id = ${sessionId}
                  ${department ? Prisma.sql`AND m.department = ${department}` : Prisma.empty}
                  ${q ? Prisma.sql`AND m.name ILIKE ${`%${q}%`}` : Prisma.empty}
                  ${status ? Prisma.sql`AND a.status = ${status}` : Prisma.empty}
                GROUP BY m.department ORDER BY m.department`)
            : prisma.$queryRaw<{ department: string; present: bigint; pending: bigint; left: bigint }[]>(Prisma.sql`
                SELECT m.department,
                       COUNT(*) FILTER (WHERE a.status = 'PRESENT')          AS present,
                       COUNT(*) FILTER (WHERE a.status = 'PENDING_SIGNOUT')  AS pending,
                       COUNT(*) FILTER (WHERE a.status IN ('LEFT', 'LEFT_FORCED')) AS "left"
                FROM attendance a JOIN members m ON m.id = a.member_id
                WHERE a.check_in_at >= ${day} AND a.check_in_at < ${nextDay}
                  ${department ? Prisma.sql`AND m.department = ${department}` : Prisma.empty}
                  ${q ? Prisma.sql`AND m.name ILIKE ${`%${q}%`}` : Prisma.empty}
                  ${status ? Prisma.sql`AND a.status = ${status}` : Prisma.empty}
                GROUP BY m.department ORDER BY m.department`))
        : Promise.resolve([]),
    ]);
    if (total > MAX_LIVE_ROWS) {
      throw new ApiError(413, `Live Board contains ${total} rows; narrow the filters before loading it`);
    }

    let finalRows = rows;
    const hierarchy: Record<string, number> = {
      "Governing Body": 1,
      "President": 1,
      "Vice President": 1,
      "General Secretary": 1,
      "Treasurer": 1,
      "Director": 2,
      "Assistant Director": 3,
      "Senior Executive": 4,
      "Executive": 5,
      "General Member": 6,
    };

    finalRows.sort((a, b) => {
      if (a.member.department !== b.member.department) return a.member.department.localeCompare(b.member.department);
      const rankA = hierarchy[a.member.designation] || 99;
      const rankB = hierarchy[b.member.designation] || 99;
      if (rankA !== rankB) return rankA - rankB;
      return a.member.name.localeCompare(b.member.name);
    });

    const paginatedRows = finalRows.slice((page - 1) * pageSize, page * pageSize);

    return NextResponse.json({
      scope: department ?? "ALL",
      rows: paginatedRows,
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
