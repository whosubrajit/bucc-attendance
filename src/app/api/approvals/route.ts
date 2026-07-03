/**
 * GET /api/approvals — pending sign-out requests visible to this approver.
 * EB/SE see their own department; HR_EB/HR_SE/GB see all (per spec).
 */
import { NextResponse } from "next/server";
import { requirePermission, handleApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { approvalScopeWhere } from "@/lib/attendance-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const approver = await requirePermission("signout:approve");
    const requests = await prisma.signoutRequest.findMany({
      where: { action: "PENDING", ...approvalScopeWhere(approver) },
      orderBy: { requestedAt: "asc" },
      include: {
        attendance: {
          include: {
            member: { select: { id: true, name: true, department: true, designation: true, profilePhotoUrl: true } },
            session: { select: { name: true } },
          },
        },
      },
    });
    return NextResponse.json({
      requests: requests.map((r) => ({
        id: r.id,
        requestedAt: r.requestedAt,
        isEscalated: r.isEscalated,
        member: r.attendance.member,
        sessionName: r.attendance.session.name,
        checkInAt: r.attendance.checkInAt,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
