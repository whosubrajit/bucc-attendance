import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  try {
    const viewer = await requirePermission("reports:export");
    const p = req.nextUrl.searchParams;
    const sessionId = p.get("sessionId");

    if (!sessionId) throw new Error("Missing sessionId");

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error("Session not found");

    const includeAllDepartments = ["GB", "EB", "HR_EB", "HR_SE"].includes(viewer.role);
    const departmentFilter = includeAllDepartments ? undefined : viewer.department;

    const members = await prisma.member.findMany({
      where: {
        designation: { in: ["Senior Executive", "Executive", "General Member"] },
        isActive: true,
        ...(departmentFilter ? { department: departmentFilter } : {}),
      },
    });

    const hierarchy: Record<string, number> = {
      "Senior Executive": 1,
      "Executive": 2,
      "General Member": 3,
    };

    members.sort((a, b) => {
      if (a.department !== b.department) return a.department.localeCompare(b.department);
      const rankA = hierarchy[a.designation] || 99;
      const rankB = hierarchy[b.designation] || 99;
      if (rankA !== rankB) return rankA - rankB;
      return a.name.localeCompare(b.name);
    });

    const lines = [];
    lines.push(csvEscape(`Attendance for ${session.name}`));
    lines.push("");
    lines.push("Name,Student ID,BUCC Department,BUCC Designation,Check in,Check out");

    for (const m of members) {
      lines.push(
        [
          m.name,
          m.studentId,
          m.department,
          m.designation,
          "",
          "",
        ]
          .map(csvEscape)
          .join(",")
      );
    }

    await prisma.auditLog.create({
      data: {
        actorId: viewer.id,
        action: "REPORT_EXPORTED",
        targetType: "blank_sheet",
        metadata: JSON.stringify({ sessionId, membersCount: members.length }),
      },
    });

    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="blank-sheet-${session.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
