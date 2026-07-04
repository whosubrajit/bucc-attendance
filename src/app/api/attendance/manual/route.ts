/**
 * POST /api/attendance/manual  { sessionId, lat?, lng? }
 *
 * Manual check-in with optional geofence validation. If CAMPUS_RADIUS_M
 * is configured, the member's reported coordinates must fall within that
 * radius of campus. (Client-reported GPS is spoofable — the IP + device
 * audit trail plus HR oversight covers abuse; QR remains the primary,
 * stronger method.)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMember, handleApiError, assertSameOrigin, ApiError } from "@/lib/api-guards";
import { rateLimit, ATTENDANCE_LIMIT } from "@/lib/rate-limit";
import { checkIn } from "@/lib/attendance-service";
import { distanceMeters, getClientIp, getDeviceType } from "@/lib/utils";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const member = await requireMember();
    const { sessionId, lat, lng } = bodySchema.parse(await req.json());

    if (!["HR_SE", "HR_EB", "GB"].includes(member.role)) {
      const prevAttendance = await prisma.attendance.findFirst({
        where: { memberId: member.id, sessionId },
        orderBy: { checkInAt: "desc" },
      });
      if (!prevAttendance || prevAttendance.status !== "LEFT") {
        throw new ApiError(403, "You must scan your QR code to check in. Manual check-in is restricted.");
      }
    }

    const rl = rateLimit(`attend:${member.id}`, ATTENDANCE_LIMIT);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${rl.retryAfterSeconds}s.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
      );
    }



    const radius = Number(process.env.CAMPUS_RADIUS_M);
    if (radius > 0) {
      if (lat === undefined || lng === undefined) {
        throw new ApiError(400, "Location access is required for manual check-in. Enable it or scan the QR code instead.");
      }
      const d = distanceMeters(lat, lng, Number(process.env.CAMPUS_LAT), Number(process.env.CAMPUS_LNG));
      if (d > radius) {
        throw new ApiError(403, "You appear to be outside campus. Manual check-in requires being on campus — or scan the session QR code.");
      }
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
