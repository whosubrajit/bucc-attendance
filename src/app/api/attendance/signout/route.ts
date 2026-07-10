/**
 * POST /api/attendance/signout  { sessionId }
 * Button-based "Sign Out from Volunteering" → creates an approval request.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMember, handleApiError, assertSameOrigin } from "@/lib/api-guards";
import { rateLimit, ATTENDANCE_LIMIT } from "@/lib/rate-limit";
import { requestSignout } from "@/lib/attendance-service";

const bodySchema = z.object({ sessionId: z.string().min(1), notes: z.string().optional() });

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const member = await requireMember();

    const rl = rateLimit(`attend:${member.id}`, ATTENDANCE_LIMIT);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${rl.retryAfterSeconds}s.` },
        { status: 429 },
      );
    }

    const { sessionId, notes } = bodySchema.parse(await req.json());
    const request = await requestSignout(member, sessionId, notes);
    if (!request) {
      return NextResponse.json({ message: "Signed out successfully." });
    }
    return NextResponse.json({ message: "Sign-out request submitted. Awaiting approval." });
  } catch (err) {
    return handleApiError(err);
  }
}
