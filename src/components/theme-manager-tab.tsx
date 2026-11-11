"use client";

import { useState, useRef } from "react";
import useSWR from "swr";
import {
  Palette,
  Upload,
  Sparkles,
  CheckCircle2,
  Trash2,
  FolderPlus,
  RefreshCw,
  Folder,
  Eye,
  Check,
  AlertCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { upload } from "@vercel/blob/client";

async function parseResponseJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (res.status === 413 || text.includes("Request Entity")) {
      throw new Error("File exceeds upload limit (Request Entity Too Large). Maximum size is 50MB.");
    }
    throw new Error(text || `Server returned ${res.status} ${res.statusText}`);
  }
}

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

export type ThemesResponse = {
  activePack: string;
  activePacks?: string[];
  livePacks?: ThemePack[];
  packs: ThemePack[];
  activeVariants: ThemeVariant[];
  updatedAt: string;
};

const COLOR_PRESETS = [
  { name: "Emerald", hex: "#10b981" },
  { name: "Forest", hex: "#059669" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Gold", hex: "#d97706" },
  { name: "Electric Cyan", hex: "#38bdf8" },
  { name: "Royal Purple", hex: "#a855f7" },
  { name: "Crimson", hex: "#ef4444" },
  { name: "Rose", hex: "#f43f5e" },
];

export function ThemeManagerTab() {
  const { data, mutate, isLoading } = useSWR<ThemesResponse>("/api/themes");

  const [activeTab, setActiveTab] = useState<"packs" | "upload">("packs");
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Upload state
  const [folderMode, setFolderMode] = useState<"existing" | "new">("existing");
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [newFolderName, setNewFolderName] = useState("");
  const [newPackName, setNewPackName] = useState("");
  const [variantName, setVariantName] = useState("");
  const [accentColor, setAccentColor] = useState("#10b981");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview modal
  const [previewVariant, setPreviewVariant] = useState<ThemeVariant | null>(null);

  const packs = data?.packs || [];
  const livePacks = packs.filter((p) => p.isLive);
  const activePack = livePacks[0] || packs[0];

  const effectiveFolder = folderMode === "new" ? newFolderName : (selectedFolder || packs[0]?.folder || "custom");

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast("error", "Please select an image file (PNG, WEBP, JPEG)");
        return;
      }
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setFilePreview(url);
    }
  }

  async function handleToggleLive(packId: string, currentLive: boolean) {
    setActivatingId(packId);
    try {
      const res = await fetch("/api/themes/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId, isLive: !currentLive }),
      });
      const json = await parseResponseJson(res);
      if (!res.ok) throw new Error(json.error || "Failed to update theme status");

      const packName = packs.find((p) => p.id === packId)?.name || packId;
      toast("success", !currentLive ? `Activated "${packName}" (Now Live)` : `Deactivated "${packName}"`);
      void mutate();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to toggle theme pack");
    } finally {
      setActivatingId(null);
    }
  }

  async function handleDeleteVariant(packId: string, variantId: string) {
    if (!confirm(`Are you sure you want to delete this theme variant?`)) return;
    setDeletingId(variantId);
    try {
      const res = await fetch("/api/themes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId, variantId }),
      });
      const json = await parseResponseJson(res);
      if (!res.ok) throw new Error(json.error || "Failed to delete theme variant");

      toast("success", "Theme variant deleted");
      void mutate();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      toast("error", "Please select an image file to upload");
      return;
    }
    if (!variantName.trim()) {
      toast("error", "Please provide a variant name");
      return;
    }
    if (!effectiveFolder.trim()) {
      toast("error", "Please specify a folder name");
      return;
    }

    setUploading(true);
    try {
      const sanitizedFolder = effectiveFolder.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      const sanitizedVariantId = variantName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      const ext = selectedFile.type.includes("png")
        ? "png"
        : selectedFile.type.includes("webp")
        ? "webp"
        : "jpg";
      const blobPath = `themes/${sanitizedFolder}/${sanitizedVariantId}.${ext}`;

      // 1. Direct browser-to-Blob upload via @vercel/blob/client
      // Bypasses Vercel's 4.5MB serverless payload limit, supporting full uncompressed files up to 50MB!
      const newBlob = await upload(blobPath, selectedFile, {
        access: "public",
        handleUploadUrl: "/api/themes/upload",
      });

      // 2. Register uploaded variant into themes config
      const regRes = await fetch("/api/themes/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder: effectiveFolder,
          packName: folderMode === "new" ? newPackName || newFolderName : "",
          name: variantName.trim(),
          accent: accentColor,
          fileUrl: newBlob.url,
        }),
      });

      const json = await parseResponseJson(regRes);
      if (!regRes.ok) throw new Error(json.error || "Failed to register theme variant");

      toast("success", `Uploaded "${variantName}" into folder "${effectiveFolder}"!`);
      // Reset form
      setVariantName("");
      setSelectedFile(null);
      setFilePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setActiveTab("packs");
      void mutate();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast(
        "error",
        msg.includes("Request Entity")
          ? "File exceeds upload limit (50MB). Please select a smaller image."
          : msg
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner: Active Live Theme info */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-navy-900 to-navy-950 p-5 shadow-lg backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white">Live Boarding Pass Collections</h3>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/40">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {livePacks.length} Active
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {livePacks.length === 0 ? (
                  <span className="text-amber-400">No theme pack active — attendees will see default theme</span>
                ) : (
                  <span>
                    Active Collections:{" "}
                    {livePacks.map((p, idx) => (
                      <span key={p.id}>
                        {idx > 0 && <span className="text-slate-500"> • </span>}
                        <span className="font-semibold text-emerald-400">{p.name}</span>{" "}
                        <code className="text-emerald-300/80 font-mono text-[11px]">(themes/{p.folder}/)</code>
                      </span>
                    ))}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void mutate()}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 transition"
              title="Refresh"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
              Refresh
            </button>
            <button
              onClick={() => setActiveTab(activeTab === "packs" ? "upload" : "packs")}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition shadow-sm",
                activeTab === "upload"
                  ? "bg-slate-700 text-white hover:bg-slate-600"
                  : "bg-emerald-600 text-white hover:bg-emerald-500"
              )}
            >
              {activeTab === "upload" ? (
                <>View Collections</>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" /> Upload New Theme
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Packs View or Upload View */}
      {activeTab === "upload" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-navy-700 dark:bg-navy-900">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-navy-700 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Upload className="h-5 w-5 text-emerald-500" /> Upload Theme to Vercel Blob
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Target structure: <code className="font-mono text-emerald-500">themes / folder_name / variant_name.png</code>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("packs")}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleUpload} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Folder / Collection Selection */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Folder / Theme Pack
                  </label>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setFolderMode("existing")}
                      className={cn(
                        "flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition",
                        folderMode === "existing"
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-100 text-slate-600 dark:bg-navy-800 dark:text-slate-400"
                      )}
                    >
                      Existing Folder
                    </button>
                    <button
                      type="button"
                      onClick={() => setFolderMode("new")}
                      className={cn(
                        "flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition",
                        folderMode === "new"
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-100 text-slate-600 dark:bg-navy-800 dark:text-slate-400"
                      )}
                    >
                      + Create New Folder
                    </button>
                  </div>

                  {folderMode === "existing" ? (
                    <select
                      value={selectedFolder || packs[0]?.folder || ""}
                      onChange={(e) => setSelectedFolder(e.target.value)}
                      className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-800 text-slate-900 dark:text-white"
                    >
                      {packs.map((p) => (
                        <option key={p.id} value={p.folder}>
                          {p.name} (folder: {p.folder})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Folder name (e.g. cyberpunk, orientation)"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-800 text-slate-900 dark:text-white"
                        required
                      />
                      <input
                        type="text"
                        placeholder="Display Name (e.g. Cyberpunk 2077 Pack)"
                        value={newPackName}
                        onChange={(e) => setNewPackName(e.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  )}
                </div>

                {/* Variant Name */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Theme Variant Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Golden Ascent, Neon Horizon"
                    value={variantName}
                    onChange={(e) => setVariantName(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-800 text-slate-900 dark:text-white"
                    required
                  />
                </div>

                {/* Accent Color */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Accent Color
                  </label>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="h-9 w-10 cursor-pointer rounded-lg border border-slate-300 p-0.5 dark:border-navy-700"
                    />
                    <input
                      type="text"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="h-9 w-28 rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-xs dark:border-navy-700 dark:bg-navy-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        type="button"
                        key={c.hex}
                        onClick={() => setAccentColor(c.hex)}
                        className={cn(
                          "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium border transition",
                          accentColor.toLowerCase() === c.hex.toLowerCase()
                            ? "border-white bg-slate-800 text-white shadow-sm"
                            : "border-slate-200 bg-slate-50 text-slate-700 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-300"
                        )}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.hex }} />
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Image Upload & Preview Box */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Boarding Pass Background Art (PNG / WEBP)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition min-h-[220px]",
                    filePreview
                      ? "border-emerald-500/50 bg-slate-950/20"
                      : "border-slate-300 hover:border-emerald-500/50 dark:border-navy-700 dark:hover:border-emerald-500/50"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/webp,image/jpeg"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {filePreview ? (
                    <div className="relative group w-full flex flex-col items-center">
                      <img
                        src={filePreview}
                        alt="Preview"
                        className="max-h-48 rounded-xl object-contain shadow-lg"
                      />
                      <span className="mt-3 text-xs font-medium text-emerald-500">
                        Click to change image ({selectedFile?.name} • {selectedFile ? (selectedFile.size / (1024 * 1024)).toFixed(1) : 0} MB)
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-500 mb-2">
                        <Upload className="h-6 w-6" />
                      </div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        Click to upload artwork
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        High-res transparent PNG recommended (~1920x800)
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-navy-700">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setActiveTab("packs")}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={uploading || !selectedFile || !variantName.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white min-w-[140px]"
              >
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" /> Uploading to Blob...
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Upload className="h-4 w-4" /> Save & Upload
                  </span>
                )}
              </Button>
            </div>
          </form>
        </div>
      ) : (
        /* Packs & Variants Grid */
        <div className="space-y-8">
          {packs.map((pack) => {
            const isLive = Boolean(pack.isLive);

            return (
              <div
                key={pack.id}
                className={cn(
                  "overflow-hidden rounded-2xl border transition shadow-sm",
                  isLive
                    ? "border-emerald-500/40 bg-slate-900/40 shadow-emerald-500/5 ring-1 ring-emerald-500/20"
                    : "border-slate-200 bg-white dark:border-navy-700 dark:bg-navy-900"
                )}
              >
                {/* Pack Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-b border-slate-200 dark:border-navy-800 bg-slate-50/50 dark:bg-navy-950/40">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl",
                        isLive ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-200 text-slate-600 dark:bg-navy-800 dark:text-slate-300"
                      )}
                    >
                      <Folder className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-base text-slate-900 dark:text-white">
                          {pack.name}
                        </h3>
                        {isLive ? (
                          <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/40">
                            Active / Live
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-200 dark:bg-navy-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1 font-mono">
                        Blob prefix: <span className="text-emerald-500">themes/{pack.folder}/</span> • {pack.variants.length} variant{pack.variants.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {isLive ? (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
                          <Check className="h-3.5 w-3.5 text-emerald-400" /> Serving to Attendees
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={activatingId === pack.id}
                          onClick={() => handleToggleLive(pack.id, isLive)}
                          className="border-slate-700 bg-slate-800/80 hover:bg-rose-500/10 hover:border-rose-500/40 text-slate-300 hover:text-rose-400 text-xs rounded-xl font-medium"
                          title="Deactivate this theme pack"
                        >
                          {activatingId === pack.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Deactivate"
                          )}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        disabled={activatingId === pack.id}
                        onClick={() => handleToggleLive(pack.id, isLive)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl shadow-sm"
                      >
                        {activatingId === pack.id ? (
                          <span className="flex items-center gap-1.5">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Activating...
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Make Theme Live
                          </span>
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Variants List */}
                <div className="p-5">
                  {pack.variants.length === 0 ? (
                    <div className="text-center py-8 text-sm text-slate-400">
                      No variants uploaded in this folder yet. Click &quot;Upload New Theme&quot; above to add one!
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      {pack.variants.map((v) => (
                        <div
                          key={v.id}
                          className="group relative flex flex-col rounded-xl border border-slate-200 dark:border-navy-700/80 bg-slate-900/60 overflow-hidden hover:border-emerald-500/50 transition shadow-sm"
                        >
                          {/* Image preview with dark backdrop */}
                          <div className="relative aspect-[16/10] bg-slate-950 flex items-center justify-center p-2 overflow-hidden">
                            <img
                              src={v.file}
                              alt={v.name}
                              className="max-h-full max-w-full object-contain filter drop-shadow group-hover:scale-105 transition-transform duration-200"
                            />
                            {/* Overlay action buttons */}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => setPreviewVariant(v)}
                                className="rounded-lg bg-white/20 p-2 text-white hover:bg-white/30 transition backdrop-blur-sm"
                                title="Zoom Preview"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                disabled={deletingId === v.id}
                                onClick={() => handleDeleteVariant(pack.id, v.id)}
                                className="rounded-lg bg-red-500/80 p-2 text-white hover:bg-red-500 transition backdrop-blur-sm"
                                title="Delete variant"
                              >
                                {deletingId === v.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Info footer */}
                          <div className="p-3 bg-slate-900/90 flex flex-col justify-between flex-1">
                            <div>
                              <div className="flex items-center justify-between gap-1">
                                <h4 className="font-semibold text-xs text-white truncate" title={v.name}>
                                  {v.name}
                                </h4>
                                <span
                                  className="h-3 w-3 shrink-0 rounded-full border border-white/20 shadow-sm"
                                  style={{ backgroundColor: v.accent }}
                                  title={`Accent: ${v.accent}`}
                                />
                              </div>
                              <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                                id: {v.id}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Image Preview Modal */}
      {previewVariant && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPreviewVariant(null)}
        >
          <div
            className="relative max-w-3xl w-full rounded-2xl bg-navy-950 p-4 border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ backgroundColor: previewVariant.accent }}
                />
                <h3 className="font-semibold text-white text-sm">{previewVariant.name}</h3>
              </div>
              <button
                onClick={() => setPreviewVariant(null)}
                className="text-slate-400 hover:text-white rounded-lg p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex items-center justify-center p-4 bg-slate-900 rounded-xl">
              <img
                src={previewVariant.file}
                alt={previewVariant.name}
                className="max-h-[60vh] object-contain drop-shadow-2xl"
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>URL: {previewVariant.file}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
