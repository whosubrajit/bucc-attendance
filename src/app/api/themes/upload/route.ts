import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requirePermission, handleApiError, assertSameOrigin } from "@/lib/api-guards";
import { uploadThemeVariant, registerThemeVariant } from "@/lib/theme-manager";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const contentType = req.headers.get("content-type") || "";

    // 1. JSON Request: either generating client upload token or registering uploaded variant
    if (contentType.includes("application/json")) {
      const body = await req.json();

      // Vercel Blob client upload token generation
      if (body?.type === "blob.generate-client-token") {
        const jsonResponse = await handleUpload({
          body: body as HandleUploadBody,
          request: req,
          onBeforeGenerateToken: async (pathname) => {
            await requirePermission("sessions:manage");
            return {
              allowedContentTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
              maximumSizeInBytes: 50 * 1024 * 1024, // 50MB max upload
            };
          },
        });
        return NextResponse.json(jsonResponse);
      }

      // Variant registration after client-side upload
      if (body?.fileUrl) {
        await requirePermission("sessions:manage");
        const { folder, packName, name: variantName, accent, fileUrl } = body;
        if (!folder || !variantName || !fileUrl) {
          return NextResponse.json(
            { error: "Folder name, variant name, and file URL are required" },
            { status: 400 }
          );
        }

        const result = await registerThemeVariant({
          folder,
          packName,
          variantName,
          accent: accent || "#10b981",
          fileUrl,
        });

        return NextResponse.json({
          success: true,
          variant: result.variant,
          config: result.config,
        });
      }

      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    // 2. Multipart form fallback: server-side upload
    await requirePermission("sessions:manage");
    const formData = await req.formData();
    const folder = formData.get("folder") as string;
    const packName = (formData.get("packName") as string) || folder;
    const variantName = formData.get("name") as string;
    const accent = (formData.get("accent") as string) || "#10b981";
    const file = formData.get("file") as File | null;

    if (!folder || !variantName || !file) {
      return NextResponse.json(
        { error: "Folder name, variant name, and image file are required" },
        { status: 400 }
      );
    }

    // Validate mime type
    const validTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only PNG, JPEG, WEBP, and SVG are supported." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await uploadThemeVariant({
      folder,
      packName,
      variantName,
      accent,
      file: buffer,
      contentType: file.type,
    });

    return NextResponse.json({
      success: true,
      variant: result.variant,
      config: result.config,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
