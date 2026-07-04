import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, handleApiError, assertSameOrigin } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({
  memberId: z.string().min(1),
  grant: z.boolean(),
});

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    // Requires GB or HR admin (members:manage is GB, but we also want HR_EB/HR_SE to grant this)
    // Actually, HR_EB and HR_SE don't have members:manage. We will check signout:approve instead,
    // and verify their department is Human Resources, OR they have members:manage.
    const admin = await requirePermission("signout:approve");
    
    // Ensure caller is HR Admin or GB
    if (!["HR_EB", "HR_SE", "GB"].includes(admin.role)) {
        return NextResponse.json({ error: "Only HR Admins or GB can grant temporary powers" }, { status: 403 });
    }

    const { memberId, grant } = schema.parse(await req.json());

    const target = await prisma.member.findUnique({ where: { id: memberId } });
    if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    if (target.department.toLowerCase() !== "human resources" && admin.role !== "GB") {
        return NextResponse.json({ error: "Only HR members can be granted temporary HR powers by HR" }, { status: 403 });
    }

    const tempRole = grant ? "HR_SE" : null;
    // 12 hours from now
    const expiresAt = grant ? new Date(Date.now() + 12 * 60 * 60 * 1000) : null;

    await prisma.member.update({
      where: { id: memberId },
      data: {
        tempRole: tempRole,
        tempRoleExpiresAt: expiresAt,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: grant ? "GRANTED_TEMP_POWER" : "REVOKED_TEMP_POWER",
        targetType: "member",
        targetId: memberId,
      },
    });

    return NextResponse.json({ ok: true, tempRoleExpiresAt: expiresAt });
  } catch (err) {
    return handleApiError(err);
  }
}
