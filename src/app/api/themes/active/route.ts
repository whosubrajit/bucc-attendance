import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError, assertSameOrigin } from "@/lib/api-guards";
import { toggleThemePackLive } from "@/lib/theme-manager";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    await requirePermission("sessions:manage");
    const body = await req.json();
    const packId = body.packId || body.activePackId;
    const isLive = body.isLive !== undefined ? Boolean(body.isLive) : undefined;

    if (!packId) {
      return NextResponse.json({ error: "Missing packId" }, { status: 400 });
    }

    const updatedConfig = await toggleThemePackLive(packId, isLive);
    return NextResponse.json({ success: true, config: updatedConfig });
  } catch (err) {
    return handleApiError(err);
  }
}
