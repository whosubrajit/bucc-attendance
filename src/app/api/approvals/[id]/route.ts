/**
 * POST /api/approvals/:id  { decision: "approve" | "reject", reason? }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, handleApiError, assertSameOrigin } from "@/lib/api-guards";
import { reviewSignout } from "@/lib/attendance-service";

const bodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(req);
    const approver = await requirePermission("signout:approve");
    const { decision, reason } = bodySchema.parse(await req.json());
    await reviewSignout(approver, params.id, decision, reason);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
