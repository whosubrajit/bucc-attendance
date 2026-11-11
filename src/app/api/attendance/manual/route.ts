/**
 * POST /api/attendance/manual  { sessionId }
 *
 * Self-marked check-in for the roles listed in SELF_ATTENDANCE_ROLES, plus
 * anyone returning to a session they previously signed out of. There is no
 * location check: client-reported GPS is spoofable anyway, so the controls
 * that matter are the role gate, the IP + device audit trail, and HR
 * oversight. QR remains the primary, stronger method.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMember, handleApiError, assertSameOrigin, ApiError } from "@/lib/api-guards";
import { rateLimit, ATTENDANCE_LIMIT } from "@/lib/rate-limit";
import { checkIn } from "@/lib/attendance-service";
import { getClientIp, getDeviceType } from "@/lib/utils";
import { SELF_ATTENDANCE_ROLES } from "@/lib/rbac";
import { Role } from "@/lib/enums";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  sessionId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const member = await requireMember();
    const { sessionId } = bodySchema.parse(await req.json());

    const prevAttendance = await prisma.attendance.findFirst({
      where: { memberId: member.id, sessionId },
      orderBy: { checkInAt: "desc" },
    });
    const isReturning = prevAttendance?.status === "LEFT" || prevAttendance?.status === "LEFT_FORCED";

    if (!SELF_ATTENDANCE_ROLES.includes(member.role as Role) && !isReturning) {
      throw new ApiError(403, "You must scan your QR code to check in. Manual check-in is restricted.");
    }

    const rl = await rateLimit(`attend:${member.id}`, ATTENDANCE_LIMIT);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${rl.retryAfterSeconds}s.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
      );
    }

    const { session } = await checkIn(member, sessionId, "MANUAL", {
      ip: getClientIp(req),
      deviceType: getDeviceType(req),
    });
    return NextResponse.json({
      action: "checked_in",
      sessionName: session.name,
      message: `Welcome, ${member.name}! Attendance marked ✅`,
    });
  } catch (err) {
    if (err instanceof ApiError && err.message === "ALREADY_CHECKED_IN") {
      return NextResponse.json({ error: "You are already checked in to this session." }, { status: 409 });
    }
    return handleApiError(err);
  }
}
