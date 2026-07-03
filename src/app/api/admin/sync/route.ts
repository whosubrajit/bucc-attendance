/**
 * POST /api/admin/sync — on-demand Central Member Database sync (GB only).
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError, assertSameOrigin } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { syncFromCentral } from "@/lib/central-db";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const gb = await requirePermission("members:manage");
    const result = await syncFromCentral();
    await prisma.auditLog.create({
      data: { actorId: gb.id, action: "CENTRAL_SYNC", targetType: "central_members", metadata: JSON.stringify(result) },
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
