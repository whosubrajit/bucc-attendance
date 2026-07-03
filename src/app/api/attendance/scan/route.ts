/**
 * POST /api/attendance/scan  { token }
 *
 * One endpoint for both directions (per spec): the first valid scan of a
 * session QR checks the member in; a second scan initiates the sign-out
 * approval flow.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMember, handleApiError, assertSameOrigin, ApiError } from "@/lib/api-guards";
import { verifyQrToken } from "@/lib/qr";
import { rateLimit, ATTENDANCE_LIMIT } from "@/lib/rate-limit";
import { checkIn, requestSignout } from "@/lib/attendance-service";
import { getClientIp, getDeviceType } from "@/lib/utils";

const bodySchema = z.object({ token: z.string().min(10).max(500), sessionId: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const scanner = await requireMember();
    
    // Scanners must have the attendance:scan permission.
    if (!scanner.role || !["EB", "HR_SE", "HR_EB", "GB"].includes(scanner.role)) {
       throw new ApiError(403, "You do not have permission to scan member QRs.");
    }

    const { token, sessionId } = bodySchema.parse(await req.json());
    
    // Verify the member's QR token
    const targetMemberId = verifyQrToken(token);
    if (!targetMemberId) throw new ApiError(400, "Invalid or expired QR code.");
    
    const targetMember = await prisma.member.findUnique({ where: { id: targetMemberId } });
    if (!targetMember) throw new ApiError(404, "Member not found.");

    // The HR SE automatically gets attendance when they scan someone (or they can manually check in)
    // Let's just ensure the HR SE is checked into the session if they aren't already.
    try {
      await checkIn(scanner, sessionId, "MANUAL", {
        ip: getClientIp(req),
        deviceType: getDeviceType(req),
      });
    } catch (e) {
      // Ignore ALREADY_CHECKED_IN for the scanner
    }

    try {
      // Check the target member into the session
      const { session } = await checkIn(targetMember, sessionId, "QR", {
        ip: getClientIp(req),
        deviceType: getDeviceType(req),
      });
      return NextResponse.json({
        action: "checked_in",
        sessionName: session.name,
        message: `${targetMember.name} marked present! ✅`,
      });
    } catch (err) {
      // Second scan → switch to sign-out request
      if (err instanceof ApiError && err.message === "ALREADY_CHECKED_IN") {
        const request = await requestSignout(targetMember, sessionId);
        if (!request) {
          return NextResponse.json({
            action: "signout_approved",
            message: `${targetMember.name} signed out successfully.`,
          });
        }
        return NextResponse.json({
          action: "signout_requested",
          message: `${targetMember.name} sign-out requested.`,
        });
      }
      throw err;
    }
  } catch (err) {
    return handleApiError(err);
  }
}
