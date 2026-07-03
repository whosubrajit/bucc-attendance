/**
 * GET /api/attendance/qr — current rotating personal QR token.
 * The QR display component re-fetches this every ~50s.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireMember, handleApiError } from "@/lib/api-guards";
import { makeQrToken, QR_WINDOW_SECONDS } from "@/lib/qr";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const member = await requireMember();
    return NextResponse.json({
      token: makeQrToken(member.id),
      refreshSeconds: QR_WINDOW_SECONDS,
      memberId: member.id,
      name: member.name,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
