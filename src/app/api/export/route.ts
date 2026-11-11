import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError, ApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { AttendanceStatus } from "@/lib/enums";

export const dynamic = "force-dynamic";
const MAX_EXPORT_ROWS = 10000;

function csvEscape(v: unknown): string {
  let s = String(v ?? "");
  // Prevent spreadsheet applications from interpreting user-controlled values
  // as formulas when an exported CSV is opened.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  try {
    const viewer = await requirePermission("reports:export");
    const p = req.nextUrl.searchParams;
    const type = p.get("type");
    const sessionId = p.get("sessionId") ?? undefined;

    if (type === "pre-event") {
      const preEventWhere = {
        ...(sessionId ? { sessionId } : {}),
        ...(!can(viewer.role, "live:all") ? { dept: viewer.department } : {}),
      };
      const preEventCount = await prisma.preEventRsvp.count({ where: preEventWhere });
      if (preEventCount > MAX_EXPORT_ROWS) {
        throw new ApiError(413, `Export contains ${preEventCount} rows; narrow it to at most ${MAX_EXPORT_ROWS} rows`);
      }
      const rsvps = await prisma.preEventRsvp.findMany({
        where: preEventWhere,
        include: { session: { select: { name: true, startsAt: true } } },
        orderBy: [{ dept: "asc" }, { name: "asc" }],
      });
      const lines = [
        ["Name", "Student ID", "Department", "Designation", "Status", "Meeting Session", "RSVP Date"].join(","),
        ...rsvps.map((r) =>
          [
            r.name,
            r.studentId,
            r.dept,
            r.designation,
            r.status,
            r.session?.name ?? "Scheduled Meeting",
            r.updatedAt.toISOString().slice(0, 19).replace("T", " "),
          ]
            .map(csvEscape)
            .join(",")
        ),
      ];
      return new NextResponse(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="pre-event-rsvps-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const fromValue = p.get("from");
    const toValue = p.get("to");
    if ((fromValue && !/^\d{4}-\d{2}-\d{2}$/.test(fromValue)) || (toValue && !/^\d{4}-\d{2}-\d{2}$/.test(toValue))) {
      return NextResponse.json({ error: "Invalid export date" }, { status: 400 });
    }
    const from = fromValue ? new Date(`${fromValue}T00:00:00`) : undefined;
    const to = toValue ? new Date(`${toValue}T23:59:59.999`) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      return NextResponse.json({ error: "Invalid export date" }, { status: 400 });
    }
    if (from && to && from > to) {
      return NextResponse.json({ error: "Export start date must be on or before the end date" }, { status: 400 });
    }

    const requestedDepartment = p.get("department")?.trim() || undefined;
    const department = can(viewer.role, "live:all")
      ? requestedDepartment
      : viewer.department;

    let sessionName = "Attendance Export";
    let requiresFeedback = false;
    if (sessionId) {
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (session) {
        sessionName = session.name;
        requiresFeedback = session.requiresFeedback;
      }
    }

    const exportWhere = {
      ...(sessionId ? { sessionId } : {}),
      ...(from || to ? { checkInAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      member: {
        ...(department ? { department } : {}),
      },
    };
    const exportCount = await prisma.attendance.count({ where: exportWhere });
    if (exportCount > MAX_EXPORT_ROWS) {
      throw new ApiError(413, `Export contains ${exportCount} rows; narrow it to at most ${MAX_EXPORT_ROWS} rows`);
    }
    const rows = await prisma.attendance.findMany({
      where: exportWhere,
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
      
      const isForcedOut = r.status === AttendanceStatus.LEFT_FORCED;
      const effectiveCheckOut = r.checkOutRequestedAt || r.checkOutApprovedAt;
      const checkOutTime = (!isForcedOut && effectiveCheckOut) 
        ? effectiveCheckOut.toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' }) 
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
