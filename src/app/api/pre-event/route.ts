import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError, ApiError, assertSameOrigin, requireMember, requirePermission } from "@/lib/api-guards";
import { getCurrentMember } from "@/lib/page-guards";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const rsvpPostSchema = z.object({
  name: z.string().min(2).max(120),
  dept: z.string().min(2).max(100),
  studentId: z.string().min(4).max(50),
  designation: z.string().min(2).max(100),
  status: z.enum(["Confirmed", "Cancelled"]),
  sessionId: z.string().min(1),
});

/**
 * GET /api/pre-event
 *
 * Rules:
 *  - Only sessions with isPreEvent === true AND endsAt > now are returned.
 *  - Old sessions can NEVER be pre-events.
 *  - Stats (confirmed, cancelled, total) are strictly scoped to the active session.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    const now = new Date();
    // Only upcoming sessions marked as pre-event by admin/hrse/eb/gb before actual meeting starts
    const sessions = await prisma.session.findMany({
      where: {
        isPreEvent: true,
        isActive: true,
        startsAt: { gt: now }, // Pre-event tracker turns off when meeting starts
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        name: true,
        venue: true,
        startsAt: true,
        endsAt: true,
        isActive: true,
        isPreEvent: true,
      },
    });

    const currentMember = await getCurrentMember();
    const canViewRoster = currentMember ? can(currentMember.role, "sessions:manage") : false;

    if (sessions.length === 0) {
      return NextResponse.json({
        hasActivePreEvent: false,
        sessions: [],
        activeSession: null,
        rsvps: [],
        userRsvp: null,
        currentMember: currentMember
          ? {
              id: currentMember.id,
              name: currentMember.name,
              studentId: currentMember.studentId,
              dept: currentMember.department,
              designation: currentMember.designation,
            }
          : null,
        stats: {
          total: 0,
          confirmed: 0,
          cancelled: 0,
          deptStats: {},
        },
      });
    }

    const activeSession = sessionId
      ? sessions.find((s) => s.id === sessionId) ?? sessions[0]
      : sessions[0];

    const targetSessionId = activeSession.id;

    // Fetch RSVPs strictly for this session
    const whereClause: { sessionId: string; studentId?: string } = { sessionId: targetSessionId };
    if (!canViewRoster) {
      const ownStudentId = currentMember?.studentId?.trim();
      if (ownStudentId) {
        whereClause.studentId = ownStudentId;
      } else {
        whereClause.studentId = "__no_public_roster__";
      }
    }

    const [rsvps, totalConfirmed, totalCancelled] = await Promise.all([
      prisma.preEventRsvp.findMany({
        where: whereClause,
        orderBy: [{ updatedAt: "desc" }],
        include: {
          session: {
            select: { id: true, name: true, venue: true, startsAt: true, endsAt: true },
          },
        },
      }),
      prisma.preEventRsvp.count({
        where: {
          sessionId: targetSessionId,
          status: "Confirmed",
        },
      }),
      prisma.preEventRsvp.count({
        where: {
          sessionId: targetSessionId,
          status: "Cancelled",
        },
      }),
    ]);

    // Breakdown by department for confirmed attendees
    const deptStats: Record<string, { confirmed: number; cancelled: number }> = {};
    if (canViewRoster) {
      for (const r of rsvps) {
        const d = r.dept || "Unknown";
        if (!deptStats[d]) deptStats[d] = { confirmed: 0, cancelled: 0 };
        if (r.status === "Confirmed") deptStats[d].confirmed++;
        else if (r.status === "Cancelled") deptStats[d].cancelled++;
      }
    }
    const visibleRsvps = canViewRoster
      ? rsvps
      : rsvps.map((r) => ({
          id: r.id,
          status: r.status,
          sessionId: r.sessionId,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }));

    // Check if user has an RSVP
    let userRsvp = null;
    const lookupStudentId = currentMember?.studentId?.trim();

    if (lookupStudentId && targetSessionId) {
      userRsvp = rsvps.find((r) => r.studentId === lookupStudentId) ?? null;
      if (!userRsvp) {
        userRsvp = await prisma.preEventRsvp.findUnique({
          where: {
            sessionId_studentId: {
              sessionId: targetSessionId,
              studentId: lookupStudentId,
            },
          },
        });
      }
    }

    const safeUserRsvp = userRsvp && !canViewRoster
      ? {
          id: userRsvp.id,
          status: userRsvp.status,
          sessionId: userRsvp.sessionId,
          createdAt: userRsvp.createdAt,
          updatedAt: userRsvp.updatedAt,
        }
      : userRsvp;

    return NextResponse.json({
      hasActivePreEvent: true,
      sessions,
      activeSession,
      rsvps: visibleRsvps,
      userRsvp: safeUserRsvp,
      currentMember: currentMember
        ? {
            id: currentMember.id,
            name: currentMember.name,
            studentId: currentMember.studentId,
            dept: currentMember.department,
            designation: currentMember.designation,
          }
        : null,
      stats: {
        total: totalConfirmed + totalCancelled,
        confirmed: totalConfirmed,
        cancelled: totalCancelled,
        deptStats,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/pre-event
 * Save or update member RSVP (Boarding Confirmed / Boarding Cancelled)
 * Real-time update: updates the single row per member per session, avoiding duplicates.
 */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const currentMember = await requireMember();
    const rawBody = await req.json();
    const body = rsvpPostSchema.parse(rawBody);

    // Verify session exists and is an ACTIVE upcoming pre-event
    const session = await prisma.session.findUnique({
      where: { id: body.sessionId },
      select: {
        id: true,
        name: true,
        venue: true,
        startsAt: true,
        endsAt: true,
        isPreEvent: true,
        isActive: true,
      },
    });
    if (!session) {
      throw new ApiError(404, "Scheduled meeting session not found");
    }
    if (!session.isPreEvent || !session.isActive) {
      throw new ApiError(400, "Pre-Event Pass is not enabled for this session");
    }
    if (new Date(session.startsAt) <= new Date()) {
      throw new ApiError(400, "Pre-Event RSVP has closed because the actual meeting is starting or in progress.");
    }

    // Prefer verified credentials from logged-in member to prevent duplicates
    const studentId = currentMember.studentId;
    const name = currentMember.name;
    const dept = currentMember.department;
    const designation = currentMember.designation;

    // Upsert member's pre-event RSVP
    const rsvp = await prisma.preEventRsvp.upsert({
      where: {
        sessionId_studentId: {
          sessionId: body.sessionId,
          studentId,
        },
      },
      create: {
        name,
        dept,
        studentId,
        designation,
        status: body.status,
        sessionId: body.sessionId,
      },
      update: {
        name,
        dept,
        designation,
        status: body.status, // Updates status in-place (No duplicate rows)
      },
      include: {
        session: {
          select: { id: true, name: true, venue: true, startsAt: true, endsAt: true },
        },
      },
    });

    // Query fresh counts for this session for immediate real-time sync
    const [confirmedCount, cancelledCount] = await Promise.all([
      prisma.preEventRsvp.count({ where: { sessionId: body.sessionId, status: "Confirmed" } }),
      prisma.preEventRsvp.count({ where: { sessionId: body.sessionId, status: "Cancelled" } }),
    ]);

    return NextResponse.json({
      ok: true,
      rsvp,
      stats: {
        confirmed: confirmedCount,
        cancelled: cancelledCount,
        total: confirmedCount + cancelledCount,
      },
      message: rsvp.status === "Confirmed" ? "Boarding Confirmed" : "Boarding Cancelled",
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * DELETE /api/pre-event?id=...
 * Admin removal of an RSVP entry
 */
export async function DELETE(req: NextRequest) {
  try {
    assertSameOrigin(req);
    await requirePermission("sessions:manage");
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError(400, "Missing RSVP ID");

    await prisma.preEventRsvp.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true, message: "RSVP removed" });
  } catch (err) {
    return handleApiError(err);
  }
}
