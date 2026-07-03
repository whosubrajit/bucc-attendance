/**
 * GET /api/export?sessionId=... | ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * CSV export of attendance. EB/SE exports are auto-scoped to their
 * department; HR/GB export everything.
 */
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

    const rows = await prisma.attendance.findMany({
      where: {
        ...(sessionId ? { sessionId } : {}),
        ...(from || to ? { checkInAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        ...(department ? { member: { department } } : {}),
      },
      orderBy: { checkInAt: "asc" },
      take: 10000,
      include: {
        member: { select: { name: true, studentId: true, email: true, department: true, designation: true } },
        session: { select: { name: true } },
      },
    });

    const header = [
      "Name", "Student ID", "Email", "Department", "Designation", "Session",
      "Check-in", "Sign-out Requested", "Sign-out Approved", "Status", "Method", "Duration (min)",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        r.member.name, r.member.studentId, r.member.email, r.member.department,
        r.member.designation, r.session.name,
        r.checkInAt.toISOString(), r.checkOutRequestedAt?.toISOString() ?? "",
        r.checkOutApprovedAt?.toISOString() ?? "", r.status, r.method,
        r.durationMinutes ?? "",
      ].map(csvEscape).join(","));
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
