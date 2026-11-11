import { NextRequest, NextResponse } from "next/server";
import { requireMember, ApiError, handleApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentMember = await requireMember();
    const { id } = await params;

    // Check permission: member can view their own profile, or admins/leads can view any profile
    const isSelf = currentMember.id === id;
    const canViewOthers =
      can(currentMember.role, "members:manage") ||
      can(currentMember.role, "reports:export") ||
      can(currentMember.role, "live:all");

    if (!isSelf && !canViewOthers) {
      throw new ApiError(403, "You do not have permission to view this member profile");
    }

    // Fetch target member
    const targetMember = await prisma.member.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        studentId: true,
        email: true,
        department: true,
        designation: true,
        role: true,
        profilePhotoUrl: true,
        joinDate: true,
        isActive: true,
        createdAt: true,
        tempRole: true,
        tempRoleExpiresAt: true,
      },
    });

    if (!targetMember) {
      throw new ApiError(404, "Member not found");
    }

    // Parallel fetch attendance aggregation, recent history, and department leaderboard
    const [agg, totalCheckIns, recentAttendance, signoutCounts, deptAttendanceSum] =
      await Promise.all([
        // Aggregate completed volunteering minutes
        prisma.attendance.aggregate({
          where: { memberId: id, durationMinutes: { not: null } },
          _sum: { durationMinutes: true },
          _count: true,
        }),

        // Total check-in events
        prisma.attendance.count({
          where: { memberId: id },
        }),

        // Last 25 attendance sessions
        prisma.attendance.findMany({
          where: { memberId: id },
          orderBy: { checkInAt: "desc" },
          take: 25,
          include: {
            session: {
              select: {
                id: true,
                name: true,
                venue: true,
                startsAt: true,
                endsAt: true,
              },
            },
          },
        }),

        // Signout requests breakdown
        prisma.signoutRequest.groupBy({
          by: ["action"],
          where: { attendance: { memberId: id } },
          _count: { action: true },
        }),

        // Department leaderboard for rank calculation
        prisma.attendance.groupBy({
          by: ["memberId"],
          where: {
            member: { department: targetMember.department, isActive: true },
            durationMinutes: { not: null },
          },
          _sum: { durationMinutes: true },
          orderBy: { _sum: { durationMinutes: "desc" } },
        }),
      ]);

    // Count total members in the department
    const totalMembersInDept = await prisma.member.count({
      where: { department: targetMember.department, isActive: true },
    });

    // Calculate department rank based on volunteered minutes
    const targetMinutes = agg._sum.durationMinutes ?? 0;
    const deptRankIdx = deptAttendanceSum.findIndex((d) => d.memberId === id);
    const departmentRank =
      deptRankIdx !== -1
        ? deptRankIdx + 1
        : deptAttendanceSum.length + 1;

    // Format signout stats
    let approvedSignouts = 0;
    let rejectedSignouts = 0;
    let totalSignouts = 0;
    for (const sc of signoutCounts) {
      totalSignouts += sc._count.action;
      if (sc.action === "APPROVED") approvedSignouts += sc._count.action;
      if (sc.action === "REJECTED") rejectedSignouts += sc._count.action;
    }

    // Daily activity counts for heatmap (last 180 days)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);

    const heatmapRows = await prisma.attendance.findMany({
      where: {
        memberId: id,
        checkInAt: { gte: sixMonthsAgo },
      },
      select: {
        checkInAt: true,
        durationMinutes: true,
      },
    });

    return NextResponse.json({
      member: {
        id: targetMember.id,
        name: targetMember.name,
        studentId: targetMember.studentId,
        email: targetMember.email,
        department: targetMember.department,
        designation: targetMember.designation,
        role: targetMember.role,
        profilePhotoUrl: targetMember.profilePhotoUrl,
        joinDate: targetMember.joinDate.toISOString(),
        isActive: targetMember.isActive,
        tempRole: targetMember.tempRole,
        tempRoleExpiresAt: targetMember.tempRoleExpiresAt?.toISOString() ?? null,
      },
      stats: {
        totalMinutes: targetMinutes,
        completedSessions: agg._count ?? 0,
        totalCheckIns,
        departmentRank: {
          rank: departmentRank,
          totalInDepartment: Math.max(totalMembersInDept, deptAttendanceSum.length),
        },
        signoutStats: {
          approved: approvedSignouts,
          rejected: rejectedSignouts,
          total: totalSignouts,
        },
      },
      recentSessions: recentAttendance.map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        sessionName: r.session.name,
        venue: r.session.venue,
        checkInAt: r.checkInAt.toISOString(),
        checkOutRequestedAt: r.checkOutRequestedAt?.toISOString() ?? null,
        checkOutApprovedAt: r.checkOutApprovedAt?.toISOString() ?? null,
        status: r.status,
        method: r.method,
        durationMinutes: r.durationMinutes,
      })),
      activity: heatmapRows.map((r) => ({
        date: r.checkInAt.toISOString(),
        durationMinutes: r.durationMinutes ?? 0,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
