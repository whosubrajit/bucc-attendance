import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, ApiError, requireMember } from "@/lib/api-guards";

export const dynamic = "force-dynamic";

/**
 * GET /api/pre-event/member?studentId=...
 * Look up registered member info to auto-fill their boarding pass
 */
export async function GET(req: NextRequest) {
  try {
    const currentMember = await requireMember();
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId")?.trim();

    if (!studentId || studentId.length < 3) {
      throw new ApiError(400, "Please provide a valid Student ID");
    }
    if (studentId !== currentMember.studentId) {
      throw new ApiError(403, "You may only look up your own member profile");
    }

    // First check Member table
    const member = await prisma.member.findUnique({
      where: { id: currentMember.id },
      select: {
        id: true,
        name: true,
        studentId: true,
        department: true,
        designation: true,
        role: true,
        profilePhotoUrl: true,
      },
    });

    if (member) {
      return NextResponse.json({
        found: true,
        member: {
          id: member.id,
          name: member.name,
          studentId: member.studentId,
          dept: member.department,
          designation: member.designation,
          role: member.role,
        },
      });
    }

    // Check CentralMember table as fallback
    const central = await prisma.centralMember.findUnique({
      where: { studentId },
      select: {
        id: true,
        name: true,
        studentId: true,
        department: true,
        designation: true,
      },
    });

    if (central) {
      return NextResponse.json({
        found: true,
        member: {
          id: central.id,
          name: central.name,
          studentId: central.studentId,
          dept: central.department,
          designation: central.designation,
          role: "MEMBER",
        },
      });
    }

    return NextResponse.json({ found: false, message: "Member not found in directory" }, { status: 404 });
  } catch (err) {
    return handleApiError(err);
  }
}
