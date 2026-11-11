/**
 * GET  /api/sessions — list sessions (any member; needed for manual check-in)
 * POST /api/sessions — create a session (GB only, per "sessions:manage")
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { requireMember, requirePermission, handleApiError, assertSameOrigin, ApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireMember();
    const sessions = await prisma.session.findMany({
      orderBy: { startsAt: "desc" },
      take: 50,
      select: {
        id: true, name: true, description: true, venue: true,
        startsAt: true, endsAt: true, isActive: true, recurrence: true,
        isPreEvent: true,
        _count: { select: { attendance: true } },
      },
    });
    return NextResponse.json({ sessions });
  } catch (err) {
    return handleApiError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().max(1000).optional(),
  venue: z.string().max(120).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  recurrence: z.literal("NONE").default("NONE"),
  requiresFeedback: z.boolean().default(false),
  isPreEvent: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const gb = await requirePermission("sessions:manage");
    const body = createSchema.parse(await req.json());
    if (new Date(body.endsAt) <= new Date(body.startsAt)) {
      throw new ApiError(400, "Session must end after it starts");
    }
    if (body.isPreEvent && new Date(body.endsAt) <= new Date()) {
      throw new ApiError(400, "Old/past sessions cannot be configured as a pre-event. Only upcoming sessions can have a pre-event pass.");
    }
    const session = await prisma.session.create({
      data: {
        name: body.name,
        description: body.description,
        venue: body.venue,
        recurrence: body.recurrence,
        requiresFeedback: body.requiresFeedback,
        isPreEvent: body.isPreEvent,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        qrSecret: randomBytes(24).toString("hex"),
        createdById: gb.id,
      },
    });
    await prisma.auditLog.create({
      data: { actorId: gb.id, action: "SESSION_CREATED", targetType: "session", targetId: session.id },
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.object({
  id: z.string().min(1),
  isPreEvent: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const manager = await requirePermission("sessions:manage");
    const body = patchSchema.parse(await req.json());

    const session = await prisma.session.findUnique({
      where: { id: body.id },
    });
    if (!session) {
      throw new ApiError(404, "Session not found");
    }

    // "old sessions cannot be pre-event, come on!"
    if (body.isPreEvent && new Date(session.endsAt) <= new Date()) {
      throw new ApiError(
        400,
        "Old/past sessions cannot be a pre-event. Only upcoming sessions can have a pre-event pass."
      );
    }

    const updated = await prisma.session.update({
      where: { id: body.id },
      data: { isPreEvent: body.isPreEvent },
    });

    await prisma.auditLog.create({
      data: {
        actorId: manager.id,
        action: body.isPreEvent ? "PRE_EVENT_ENABLED" : "PRE_EVENT_DISABLED",
        targetType: "session",
        targetId: body.id,
      },
    });

    return NextResponse.json({ ok: true, session: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const gb = await requirePermission("sessions:manage");
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError(400, "Missing session ID");

    // Must delete in order to satisfy foreign key constraints:
    // SignoutRequest -> Attendance -> Session
    await prisma.$transaction([
      prisma.signoutRequest.deleteMany({ where: { attendance: { sessionId: id } } }),
      prisma.attendance.deleteMany({ where: { sessionId: id } }),
      prisma.session.delete({ where: { id } }),
      prisma.auditLog.create({
        data: { actorId: gb.id, action: "SESSION_DELETED", targetType: "session", targetId: id },
      }),
    ]);
    return NextResponse.json({ message: "Session deleted" });
  } catch (err) {
    return handleApiError(err);
  }
}
