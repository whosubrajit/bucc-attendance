import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError, assertSameOrigin } from "@/lib/api-guards";
import { getThemesConfig, deleteThemeVariant } from "@/lib/theme-manager";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getThemesConfig();
    const livePacks = config.packs.filter((p) => p.isLive);
    const activePacksList = livePacks.length > 0 ? livePacks : [config.packs[0]].filter(Boolean);
    const activePack = activePacksList[0];

    return NextResponse.json({
      activePack: activePack?.id || "",
      activePacks: activePacksList.map((p) => p.id),
      packs: config.packs,
      livePacks: activePacksList,
      activeVariants: activePack ? activePack.variants : [],
      updatedAt: config.updatedAt,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    assertSameOrigin(req);
    await requirePermission("sessions:manage");
    const { packId, variantId } = await req.json();
    if (!packId || !variantId) {
      return NextResponse.json({ error: "Missing packId or variantId" }, { status: 400 });
    }

    const updatedConfig = await deleteThemeVariant(packId, variantId);
    return NextResponse.json({ success: true, config: updatedConfig });
  } catch (err) {
    return handleApiError(err);
  }
}
