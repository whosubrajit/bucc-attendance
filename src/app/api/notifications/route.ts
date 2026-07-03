/**
 * GET   /api/notifications — latest notifications + unread count
 * PATCH /api/notifications — mark all read (or specific ids)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMember, handleApiError, assertSameOrigin } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const member = await requireMember();
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { memberId: member.id },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.notification.count({ where: { memberId: member.id, isRead: false } }),
    ]);
    return NextResponse.json({ notifications, unread });
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.object({ ids: z.array(z.string()).max(100).optional() });

export async function PATCH(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const member = await requireMember();
    const { ids } = patchSchema.parse(await req.json().catch(() => ({})));
    await prisma.notification.updateMany({
      where: { memberId: member.id, isRead: false, ...(ids ? { id: { in: ids } } : {}) },
      data: { isRead: true },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
