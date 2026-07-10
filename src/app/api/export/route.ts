import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  try {
    const viewer = await requirePermission("reports:export");
    const p = req.nextUrl.searchParams;
    const sessionId = p.get("sessionId") ?? undefined;
    const from = p.get("from") ? new Date(`${p.get("from")}T00:00:00`) : undefined;
    const to = p.get("to") ? new Date(`${p.get("to")}T23:59:59`) : undefined;

    const department = can(viewer.role, "live:all") ? undefined : viewer.department;

    let sessionName = "Attendance Export";
    let requiresFeedback = false;
    if (sessionId) {
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (session) {
        sessionName = session.name;
        requiresFeedback = session.requiresFeedback;
      }
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

    const lines = [];
    
    // Title pushed to the middle using commas
    lines.push(requiresFeedback ? `,,,,Attendance for ${sessionName},,,,` : `,,,Attendance for ${sessionName},,,`);
    
    // Headers
    const headers = ["Name", "Student ID", "BUCC Department", "BUCC Designation", "Check in", "Check out", "Forced Check"];
    if (requiresFeedback) headers.push("Feedback/Queries");
    lines.push(headers.join(","));

    for (const r of rows) {
      const checkInTime = r.checkInAt ? r.checkInAt.toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' }) : "";
      
      const isForcedOut = r.status === "LEFT_FORCED";
      const checkOutTime = (!isForcedOut && r.checkOutApprovedAt) 
        ? r.checkOutApprovedAt.toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' }) 
        : "";
      const forcedText = isForcedOut ? "forced" : "";

      const cols = [
        r.member.name,
        r.member.studentId,
        r.member.department,
        r.member.designation,
        checkInTime,
        checkOutTime,
        forcedText
      ];
      if (requiresFeedback) cols.push(r.notes ?? "");

      lines.push(cols.map(csvEscape).join(","));
    }

    await prisma.auditLog.create({
      data: {
        actorId: viewer.id, action: "REPORT_EXPORTED", targetType: "attendance",
        metadata: JSON.stringify({ sessionId: sessionId ?? null, from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, rows: rows.length }),
      },
    });

    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bucc-attendance-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
