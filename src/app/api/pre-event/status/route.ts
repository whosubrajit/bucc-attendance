import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api-guards";

export const dynamic = "force-dynamic";

/**
 * GET /api/pre-event/status
 * Lightweight check: returns true if there is at least one upcoming session
 * that an admin/hrse/eb/gb has enabled as a pre-event.
 */
export async function GET() {
  try {
    const now = new Date();
    const activePreEvent = await prisma.session.findFirst({
      where: {
        isPreEvent: true,
        isActive: true,
        startsAt: { gt: now }, // Turns off just before actual meeting starts
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        name: true,
        venue: true,
        startsAt: true,
        endsAt: true,
      },
    });

    return NextResponse.json(
      {
        hasActivePreEvent: !!activePreEvent,
        session: activePreEvent,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
