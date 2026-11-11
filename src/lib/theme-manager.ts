import { put, del, list } from "@vercel/blob";

export type ThemeVariant = {
  id: string;
  name: string;
  fullName?: string;
  file: string;
  accent: string;
  glow?: string;
  border?: string;
};

export type ThemePack = {
  id: string;
  name: string;
  folder: string;
  isLive: boolean;
  variants: ThemeVariant[];
};

export type ThemesConfig = {
  activePack?: string;
  activePacks?: string[];
  packs: ThemePack[];
  updatedAt: string;
};

export const DEFAULT_THEMES_CONFIG: ThemesConfig = {
  activePack: "doom",
  activePacks: ["doom"],
  packs: [
    {
      id: "doom",
      name: "Doctor Doom Collection",
      folder: "doom",
      isLive: true,
      variants: [
        {
          id: "stained-glass",
          name: "Stained Glass",
          fullName: "Emerald Stained Glass",
          file: "/boarding-pass/doom-stained-glass.png",
          accent: "#10b981",
          glow: "from-emerald-600/30 via-teal-600/20 to-emerald-600/30",
          border: "border-emerald-500/30",
        },
        {
          id: "throne",
          name: "Imperial Throne",
          fullName: "Imperial Throne Room",
          file: "/boarding-pass/doom-throne.png",
          accent: "#059669",
          glow: "from-emerald-700/30 via-green-600/20 to-emerald-800/30",
          border: "border-emerald-600/30",
        },
        {
          id: "stairs",
          name: "Golden Ascent",
          fullName: "Golden Grand Staircase",
          file: "/boarding-pass/doom-stairs.png",
          accent: "#f59e0b",
          glow: "from-amber-600/30 via-emerald-600/20 to-yellow-600/30",
          border: "border-amber-500/30",
        },
        {
          id: "lightning",
          name: "Electric Storm",
          fullName: "Electric Storm & Gauntlet",
          file: "/boarding-pass/doom-lightning.png",
          accent: "#38bdf8",
          glow: "from-sky-600/30 via-blue-600/20 to-cyan-600/30",
          border: "border-sky-500/30",
        },
        {
          id: "mural",
          name: "Celestial Mural",
          fullName: "Celestial Mural & Arcane Sphere",
          file: "/boarding-pass/doom-mural.png",
          accent: "#d97706",
          glow: "from-amber-700/30 via-orange-600/20 to-amber-800/30",
          border: "border-amber-600/30",
        },
      ],
    },
  ],
  updatedAt: new Date().toISOString(),
};

function isAllowedThemeAssetUrl(fileUrl: string): boolean {
  try {
    const url = new URL(fileUrl);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".blob.vercel-storage.com") &&
      url.pathname.startsWith("/themes/")
    );
  } catch {
    return false;
  }
}

/**
 * Fetch themes configuration from Vercel Blob
 */
export async function getThemesConfig(): Promise<ThemesConfig> {
  try {
    const { blobs } = await list({ prefix: "themes/config.json" });
    const configBlob = blobs.find((b) => b.pathname === "themes/config.json");
    if (!configBlob) {
      return DEFAULT_THEMES_CONFIG;
    }

    const res = await fetch(configBlob.url, { cache: "no-store" });
    if (!res.ok) {
      return DEFAULT_THEMES_CONFIG;
    }
    const data = (await res.json()) as ThemesConfig;
    if (!data.activePacks) {
      data.activePacks = data.packs.filter((p) => p.isLive).map((p) => p.id);
      if (data.activePacks.length === 0 && data.activePack) {
        data.activePacks = [data.activePack];
      }
    }
    return data;
  } catch (err) {
    console.error("[theme-manager] Failed to load config from blob:", err);
    return DEFAULT_THEMES_CONFIG;
  }
}

/**
 * Save themes configuration to Vercel Blob
 */
export async function saveThemesConfig(config: ThemesConfig): Promise<string> {
  config.updatedAt = new Date().toISOString();
  const blob = await put("themes/config.json", JSON.stringify(config, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return blob.url;
}

/**
 * Toggle or set which theme pack is live (allows multiple active theme packs)
 */
export async function toggleThemePackLive(packId: string, setLive?: boolean): Promise<ThemesConfig> {
  const config = await getThemesConfig();
  const pack = config.packs.find((p) => p.id === packId);
  if (!pack) {
    throw new Error(`Theme pack "${packId}" does not exist.`);
  }

  const newStatus = setLive !== undefined ? setLive : !pack.isLive;
  pack.isLive = newStatus;

  config.activePacks = config.packs.filter((p) => p.isLive).map((p) => p.id);
  config.activePack = config.activePacks[0] || "";

  await saveThemesConfig(config);
  return config;
}

/**
 * Backwards compatible setter for active theme pack
 */
export async function setActiveThemePack(packId: string, isLive?: boolean): Promise<ThemesConfig> {
  return toggleThemePackLive(packId, isLive);
}

/**
/**
 * Register a theme variant into config (e.g. after direct client upload to Vercel Blob)
 */
export async function registerThemeVariant({
  folder,
  packName,
  variantName,
  accent,
  fileUrl,
}: {
  folder: string;
  packName?: string;
  variantName: string;
  accent: string;
  fileUrl: string;
}): Promise<{ config: ThemesConfig; variant: ThemeVariant }> {
  const sanitizedFolder = folder.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const sanitizedVariantId = variantName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  if (!isAllowedThemeAssetUrl(fileUrl)) {
    throw new Error("Theme asset must be an HTTPS Vercel Blob URL under /themes/");
  }

  const config = await getThemesConfig();

  // Find or create pack
  let pack = config.packs.find((p) => p.id === sanitizedFolder);
  if (!pack) {
    pack = {
      id: sanitizedFolder,
      name: packName?.trim() || sanitizedFolder.toUpperCase(),
      folder: sanitizedFolder,
      isLive: false,
      variants: [],
    };
    config.packs.push(pack);
  }

  // Create or update variant
  const newVariant: ThemeVariant = {
    id: sanitizedVariantId,
    name: variantName.trim(),
    fullName: `${pack.name} - ${variantName.trim()}`,
    file: fileUrl,
    accent: accent || "#10b981",
    glow: "from-emerald-600/30 via-teal-600/20 to-emerald-600/30",
    border: "border-emerald-500/30",
  };

  const existingVariantIdx = pack.variants.findIndex((v) => v.id === sanitizedVariantId);
  if (existingVariantIdx >= 0) {
    pack.variants[existingVariantIdx] = newVariant;
  } else {
    pack.variants.push(newVariant);
  }

  await saveThemesConfig(config);
  return { config, variant: newVariant };
}

/**
 * Upload a new theme variant to Vercel Blob (server-side buffer upload)
 */
export async function uploadThemeVariant({
  folder,
  packName,
  variantName,
  accent,
  file,
  contentType,
}: {
  folder: string;
  packName?: string;
  variantName: string;
  accent: string;
  file: Buffer;
  contentType: string;
}): Promise<{ config: ThemesConfig; variant: ThemeVariant }> {
  const sanitizedFolder = folder.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const sanitizedVariantId = variantName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const blobPath = `themes/${sanitizedFolder}/${sanitizedVariantId}.${ext}`;

  // Upload image to Vercel Blob
  const blob = await put(blobPath, file, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
  });

  return registerThemeVariant({
    folder: sanitizedFolder,
    packName,
    variantName,
    accent,
    fileUrl: blob.url,
  });
}

/**
 * Delete a theme variant from Vercel Blob and config
 */
export async function deleteThemeVariant(packId: string, variantId: string): Promise<ThemesConfig> {
  const config = await getThemesConfig();
  const pack = config.packs.find((p) => p.id === packId);
  if (!pack) {
    throw new Error(`Theme pack "${packId}" not found`);
  }

  const variant = pack.variants.find((v) => v.id === variantId);
  if (variant && variant.file.includes("vercel-storage.com")) {
    try {
      await del(variant.file);
    } catch (e) {
      console.warn("Could not delete blob file:", variant.file, e);
    }
  }

  pack.variants = pack.variants.filter((v) => v.id !== variantId);

  // If pack has no more variants and is not the active pack or doom default, remove it
  if (pack.variants.length === 0 && pack.id !== "doom" && pack.id !== config.activePack) {
    config.packs = config.packs.filter((p) => p.id !== packId);
  }

  await saveThemesConfig(config);
  return config;
}
