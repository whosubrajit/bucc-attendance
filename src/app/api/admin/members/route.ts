/**
 * GET   /api/admin/members?q=&department=&page= — member management list (GB)
 * PATCH /api/admin/members { memberId, isActive } — activate/deactivate (GB)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, handleApiError, assertSameOrigin, ApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("members:manage");
    const p = req.nextUrl.searchParams;
    const q = p.get("q")?.trim();
    const department = p.get("department") ?? undefined;
    const page = Math.max(1, Number(p.get("page")) || 1);
    const pageSize = 50;

    const where = {
      ...(department ? { department } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { studentId: { contains: q } },
            ],
          }
        : {}),
    };
    const [members, total] = await Promise.all([
      prisma.member.findMany({
        where,
        orderBy: [{ department: "asc" }, { name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, name: true, email: true, studentId: true, department: true,
          designation: true, role: true, isActive: true, profilePhotoUrl: true, joinDate: true,
        },
      }),
      prisma.member.count({ where }),
    ]);
    return NextResponse.json({ members, total, page, pageSize });
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.object({ memberId: z.string().min(1), isActive: z.boolean() });

export async function PATCH(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const gb = await requirePermission("members:manage");
    const { memberId, isActive } = patchSchema.parse(await req.json());
    if (memberId === gb.id) throw new ApiError(400, "You cannot deactivate your own account");

    await prisma.member.update({ where: { id: memberId }, data: { isActive } });
    await prisma.auditLog.create({
      data: {
        actorId: gb.id,
        action: isActive ? "MEMBER_ACTIVATED" : "MEMBER_DEACTIVATED",
        targetType: "member",
        targetId: memberId,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
