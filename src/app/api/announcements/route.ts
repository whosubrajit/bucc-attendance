/**
 * GET    /api/announcements — active banners (any member)
 * POST   /api/announcements { message } — post banner (GB)
 * DELETE /api/announcements?id=... — retire banner (GB)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMember, requirePermission, handleApiError, assertSameOrigin } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireMember();
    const announcements = await prisma.announcement.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { createdBy: { select: { name: true } } },
    });
    return NextResponse.json({ announcements });
  } catch (err) {
    return handleApiError(err);
  }
}

const postSchema = z.object({ message: z.string().min(3).max(300) });

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const gb = await requirePermission("announcements:manage");
    const { message } = postSchema.parse(await req.json());
    const announcement = await prisma.announcement.create({
      data: { message, createdById: gb.id },
    });
    publish("dashboard", "dashboard_update");
    return NextResponse.json({ announcement }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    assertSameOrigin(req);
    await requirePermission("announcements:manage");
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await prisma.announcement.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
