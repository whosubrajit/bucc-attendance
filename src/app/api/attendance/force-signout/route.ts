import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, handleApiError, assertSameOrigin } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({
  attendanceId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    // Requires signout:approve to forcibly sign out users.
    const admin = await requirePermission("signout:approve");

    const body = schema.parse(await req.json());
    
    // Find the attendance record
    const attendance = await prisma.attendance.findUnique({
      where: { id: body.attendanceId },
      include: { member: true },
    });

    if (!attendance) {
      return NextResponse.json({ error: "Attendance record not found" }, { status: 404 });
    }

    if (attendance.status === "LEFT" || attendance.status === "LEFT_FORCED") {
      return NextResponse.json({ error: "User has already left" }, { status: 400 });
    }

    // Force sign out
    await prisma.$transaction([
      prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          status: "LEFT_FORCED",
          checkOutApprovedAt: new Date(),
          approvedById: admin.id,
        },
      }),
      // Complete any pending sign-out requests if they existed
      prisma.signoutRequest.updateMany({
        where: { attendanceId: attendance.id, action: "PENDING" },
        data: {
          action: "APPROVED",
          reviewedAt: new Date(),
          reviewedById: admin.id,
        },
      }),
      prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: "FORCED_SIGNOUT",
          targetType: "attendance",
          targetId: attendance.id,
          metadata: JSON.stringify({ memberId: attendance.memberId }),
        },
      }),
    ]);

    return NextResponse.json({ message: `Forcibly signed out ${attendance.member.name}` });
  } catch (err) {
    return handleApiError(err);
  }
}
