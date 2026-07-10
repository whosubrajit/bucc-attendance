import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const viewer = await requirePermission("reports:export");
    const p = req.nextUrl.searchParams;
    const sessionId = p.get("sessionId") ?? undefined;
    const from = p.get("from") ? new Date(`${p.get("from")}T00:00:00`) : undefined;
    const to = p.get("to") ? new Date(`${p.get("to")}T23:59:59`) : undefined;

    const department = can(viewer.role, "live:all") ? undefined : viewer.department;

    let sessionName = "Attendance Export";
    if (sessionId) {
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (session) sessionName = session.name;
    }

    const rows = await prisma.attendance.findMany({
      where: {
        ...(sessionId ? { sessionId } : {}),
        ...(from || to ? { checkInAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        ...(department ? { member: { department } } : {}),
        member: {
          designation: { in: ["Senior Executive", "Executive", "General Member"] }
        }
      },
      take: 10000,
      include: {
        member: { select: { name: true, studentId: true, department: true, designation: true } },
      },
    });

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

    rows.sort((a, b) => {
      if (a.member.department !== b.member.department) return a.member.department.localeCompare(b.member.department);
      const rankA = hierarchy[a.member.designation] || 99;
      const rankB = hierarchy[b.member.designation] || 99;
      if (rankA !== rankB) return rankA - rankB;
      return a.member.name.localeCompare(b.member.name);
    });

    let html = `
    <html xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head>
        <meta charset="utf-8">
        <style>
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #000; padding: 4px; text-align: center; vertical-align: middle; }
          th { font-weight: bold; background-color: #f3f4f6; }
          .title { font-size: 16px; font-weight: bold; border: none; background: none; }
        </style>
      </head>
      <body>
        <table>
          <tr>
            <td colspan="6" class="title" style="text-align: center; border: none;">Attendance for ${sessionName}</td>
          </tr>
          <tr>
            <th>Name</th>
            <th>Student ID</th>
            <th>BUCC Department</th>
            <th>BUCC Designation</th>
            <th>Check in</th>
            <th>Check out</th>
          </tr>
    `;

    for (const r of rows) {
      const checkInTime = r.checkInAt ? r.checkInAt.toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' }) : "";
      const checkOutTime = r.checkOutApprovedAt ? r.checkOutApprovedAt.toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' }) : "";

      html += `
          <tr>
            <td>${r.member.name}</td>
            <td>${r.member.studentId}</td>
            <td>${r.member.department}</td>
            <td>${r.member.designation}</td>
            <td>${checkInTime}</td>
            <td>${checkOutTime}</td>
          </tr>
      `;
    }

    html += `
        </table>
      </body>
    </html>
    `;

    await prisma.auditLog.create({
      data: {
        actorId: viewer.id, action: "REPORT_EXPORTED", targetType: "attendance",
        metadata: JSON.stringify({ sessionId: sessionId ?? null, from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, rows: rows.length }),
      },
    });

    return new NextResponse(html.trim(), {
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="bucc-attendance-${new Date().toISOString().slice(0, 10)}.xls"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
