"use client";

import { useState, useEffect, useRef } from "react";
import useSWR, { mutate } from "swr";
import confetti from "canvas-confetti";
import { format } from "date-fns";
import {
  CheckCircle2,
  XCircle,
  PlaneTakeoff,
  PlaneLanding,
  Calendar,
  MapPin,
  Clock,
  User,
  Building,
  Award,
  Sparkles,
  Share2,
  Printer,
  ChevronDown,
  RefreshCw,
  Check,
  AlertCircle,
  QrCode as QrIcon,
  Download,
  Palette,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

export type SessionInfo = {
  id: string;
  name: string;
  venue: string | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

export type MemberInfo = {
  id?: string;
  name: string;
  studentId: string;
  dept: string;
  designation: string;
  role?: string;
};

export const DOOM_VARIANTS = [
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
] as const;

export type DoomVariantId = typeof DOOM_VARIANTS[number]["id"];

export type RsvpStatus = "Confirmed" | "Cancelled" | null;

interface BoardingPassProps {
  initialSession?: SessionInfo | null;
  availableSessions?: SessionInfo[];
  currentMember?: MemberInfo | null;
  initialStatus?: RsvpStatus;
  onStatusChange?: (status: "Confirmed" | "Cancelled", member: MemberInfo) => void;
}

export function BoardingPass({
  initialSession,
  availableSessions = [],
  currentMember,
  initialStatus = null,
  onStatusChange,
}: BoardingPassProps) {
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(
    initialSession || availableSessions[0] || null
  );
  const [member, setMember] = useState<MemberInfo | null>(currentMember || null);
  const [status, setStatus] = useState<RsvpStatus>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [passTheme, setPassTheme] = useState<string>("doom");
  const [selectedVariantId, setSelectedVariantId] = useState<string>("stained-glass");
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [mobilePassModalUrl, setMobilePassModalUrl] = useState<string | null>(null);

  type ThemeVariantItem = {
    id: string;
    name: string;
    fullName?: string;
    file: string;
    accent: string;
    glow?: string;
    border?: string;
  };

  type ThemePackItem = {
    id: string;
    name: string;
    folder: string;
    isLive: boolean;
    variants: ThemeVariantItem[];
  };

  // Fetch dynamic themes from Vercel Blob
  const { data: themesData } = useSWR<{
    activePack: string;
    activePacks?: string[];
    livePacks?: ThemePackItem[];
    packs: ThemePackItem[];
    activeVariants: ThemeVariantItem[];
  }>("/api/themes");

  const fallbackPacks: ThemePackItem[] = [
    {
      id: "doom",
      name: "Doctor Doom Collection",
      folder: "doom",
      isLive: true,
      variants: DOOM_VARIANTS as unknown as ThemeVariantItem[],
    },
  ];

  // All live packs currently active
  const livePacks: ThemePackItem[] =
    themesData?.livePacks && themesData.livePacks.length > 0
      ? themesData.livePacks
      : themesData?.packs?.filter((p) => p.isLive && p.variants?.length > 0).length
      ? themesData.packs.filter((p) => p.isLive && p.variants?.length > 0)
      : fallbackPacks;

  // Selected pack (defaults to first live pack or selected passTheme)
  const currentPack: ThemePackItem =
    livePacks.find((p) => p.id === passTheme) ||
    livePacks.find((p) => p.id === themesData?.activePack) ||
    livePacks[0] ||
    fallbackPacks[0];

  const variants =
    currentPack?.variants && currentPack.variants.length > 0
      ? currentPack.variants
      : fallbackPacks[0].variants;

  // Auto-switch passTheme if current pack is no longer in livePacks
  useEffect(() => {
    if (passTheme !== "classic" && livePacks.length > 0 && !livePacks.some((p) => p.id === passTheme)) {
      // The selected pack is user state that must be reset when an admin removes it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPassTheme(livePacks[0].id);
    }
  }, [livePacks, passTheme]);

  // Auto-select first variant if current selection is not present in active pack
  useEffect(() => {
    if (variants.length > 0 && !variants.some((v) => v.id === selectedVariantId)) {
      // The selected variant is user state that must follow the active pack.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedVariantId(variants[0].id);
    }
  }, [variants, selectedVariantId]);

  // Sync session if initial changes
  useEffect(() => {
    if (initialSession) {
      // Keep the controlled initial session synchronized when its parent changes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedSession(initialSession);
    }
  }, [initialSession]);

  // Sync member if currentMember changes
  useEffect(() => {
    if (currentMember) {
      // Keep the local editable member form synchronized with the authenticated member.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMember(currentMember);
    }
  }, [currentMember]);

  // Fetch member's status whenever session or member changes
  const selectedSessionId = selectedSession?.id;
  useEffect(() => {
    if (!selectedSessionId || !member?.studentId) return;

    let cancelled = false;
    async function checkStatus() {
      try {
          const res = await fetch(`/api/pre-event?sessionId=${selectedSessionId}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.userRsvp) {
            setStatus(data.userRsvp.status);
            setLastUpdated(new Date(data.userRsvp.updatedAt));
          } else {
            setStatus(null);
          }
        }
      } catch (err) {
        // silent fallback
      }
    }
    checkStatus();
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId, member?.studentId]);

  // Handle RSVP submission
  async function handleRsvp(newStatus: "Confirmed" | "Cancelled") {
    if (!member) {
      toast("error", "Please provide your Student ID or log in to RSVP");
      return;
    }
    if (!selectedSession) {
      toast("error", "No scheduled meeting selected");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/pre-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: member.name,
          dept: member.dept,
          studentId: member.studentId,
          designation: member.designation,
          status: newStatus,
          sessionId: selectedSession.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update RSVP");

      setStatus(newStatus);
      setLastUpdated(new Date());

      // Trigger immediate real-time synchronization across all tabs and components
      void mutate((key) => typeof key === "string" && key.startsWith("/api/pre-event"));

      if (newStatus === "Confirmed") {
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.6 },
          colors: ["#10b981", "#3b82f6", "#f59e0b", "#6366f1"],
        });
        toast("success", "Boarding Confirmed! See you at the session.");
      } else {
        toast("info", "Boarding Cancelled. Your RSVP has been updated.");
      }

      onStatusChange?.(newStatus, member);
    } catch (err: any) {
      toast("error", err.message || "Something went wrong saving to Neon database");
    } finally {
      setLoading(false);
    }
  }

  function handleShare() {
    const url = new URL(window.location.href);
    if (selectedSession) url.searchParams.set("session", selectedSession.id);
    if (member?.studentId) url.searchParams.set("studentId", member.studentId);
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    toast("success", "Boarding Pass link copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  }

  function handlePrint() {
    window.print();
  }

  function formatPassengerName(name?: string | null): string {
    if (!name) return "PASSENGER/GUEST";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].toUpperCase();
    const lastName = parts[parts.length - 1].toUpperCase();
    const firstNames = parts.slice(0, parts.length - 1).join(" ").toUpperCase();
    return `${lastName}/${firstNames}`;
  }

  function handleDownloadPass() {
    setDownloading(true);
    // 3x Super Retina High-Definition Export (3072 x 1305) for crisp, razor-sharp zoom
    const scale = 3;
    const canvas = document.createElement("canvas");
    canvas.width = 1024 * scale;
    canvas.height = 435 * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setDownloading(false);
      return;
    }

    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const activeVariant = variants.find((v) => v.id === selectedVariantId) || variants[0];
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = activeVariant.file;

    const timeout = setTimeout(() => {
      setDownloading(false);
      toast("error", "Generating pass took too long. Please try again.");
    }, 20000);

    img.onload = () => {
      try {
      ctx.drawImage(img, 0, 0, 1024, 435);

      const passName = formatPassengerName(member?.name);
      const passId = member?.studentId || "—";
      const passDesig = (member?.designation || "MEMBER").toUpperCase();
      const roomNo = (venue || "UB20401").toUpperCase();
      const passFlight = flightCode;
      const sessionTitle = (selectedSession?.name || "GENERAL MEETING").toUpperCase();

      ctx.textBaseline = "alphabetic";

      const drawTextWithShadow = (
        text: string,
        x: number,
        y: number,
        font: string,
        fill: string,
        shadowColor = "rgba(0,0,0,0.85)",
        ox = 1.5,
        oy = 1.5
      ) => {
        ctx.font = font;
        ctx.fillStyle = shadowColor;
        ctx.fillText(text, x + ox, y + oy);
        ctx.fillStyle = fill;
        ctx.fillText(text, x, y);
      };

      const drawTrackedText = (
        text: string,
        x: number,
        y: number,
        font: string,
        fill: string,
        letterSpacing = 2
      ) => {
        ctx.font = font;
        let currX = x;
        for (const ch of text) {
          ctx.fillStyle = "rgba(0,0,0,0.85)";
          ctx.fillText(ch, currX + 1, y + 1);
          ctx.fillStyle = fill;
          ctx.fillText(ch, currX, y);
          currX += ctx.measureText(ch).width + letterSpacing;
        }
      };

      // ── LEFT TICKET (0..640) ──
      // 1. Left FROM: BUCC & Full Form
      drawTextWithShadow("FROM:", 75, 88, "bold 9px 'League Spartan', sans-serif", "#94A3B8");
      drawTextWithShadow("BUCC", 75, 142, "bold 53px 'League Spartan', Montserrat, sans-serif", "#FFFFFF");
      drawTrackedText("BRAC UNIVERSITY COMPUTER CLUB", 75, 160, "bold 13px 'League Spartan', Montserrat, sans-serif", "#FFFFFF", 2.0);

      // 2. Left TO: Room No / Place & Subtitle (never crosses separating line at 640)
      const leftRoomFontSize = roomNo.length <= 7 ? 53 : roomNo.length <= 11 ? 38 : 30;
      drawTextWithShadow("TO:", 370, 88, "bold 9px 'League Spartan', sans-serif", "#94A3B8");
      drawTextWithShadow(roomNo, 370, 142, `bold ${leftRoomFontSize}px 'League Spartan', Montserrat, sans-serif`, "#FFFFFF");
      drawTrackedText("BRAC UNIVERSITY", 370, 160, "bold 13px 'League Spartan', Montserrat, sans-serif", "#FFFFFF", 2.0);

      // 3. Left Passenger Details
      const leftPassName = (member?.name || "GUEST VOLUNTEER").toUpperCase();
      const leftNameFontSize = leftPassName.length <= 18 ? 16 : leftPassName.length <= 24 ? 13.5 : 12;
      drawTextWithShadow("PASSENGER", 75, 302, "bold 9px 'League Spartan', sans-serif", "#94A3B8");
      drawTextWithShadow(leftPassName, 75, 322, `bold ${leftNameFontSize}px 'League Spartan', Montserrat, sans-serif`, "#FFFFFF");

      drawTextWithShadow("STUDENT ID", 335, 302, "bold 9px 'League Spartan', sans-serif", "#94A3B8");
      drawTextWithShadow(passId, 335, 322, "bold 16px 'League Spartan', monospace, sans-serif", "#6EE7B7");

      const desigFontSize = passDesig.length <= 18 ? 16 : passDesig.length <= 24 ? 13.5 : 12;
      drawTextWithShadow("DESIGNATION", 445, 302, "bold 9px 'League Spartan', sans-serif", "#94A3B8");
      drawTextWithShadow(passDesig, 445, 322, `bold ${desigFontSize}px 'League Spartan', Montserrat, sans-serif`, "#FFFFFF");

      // 4. Left Bottom Details:
      drawTextWithShadow("BOARDING DATE & TIME", 75, 350, "bold 9px 'League Spartan', sans-serif", "#94A3B8");
      drawTextWithShadow(`${meetingDate} · ${meetingTime}`, 75, 368, "bold 11px 'League Spartan', sans-serif", "#FCD34D");

      drawTextWithShadow("SESSION", 370, 350, "bold 9px 'League Spartan', sans-serif", "#94A3B8");
      drawTextWithShadow(sessionTitle, 370, 368, "bold 11px 'League Spartan', sans-serif", "#FFFFFF");

      // ── RIGHT STUB (640..1024) ──
      // 5. Right FROM: BUCC & Subtitle
      drawTextWithShadow("FROM:", 670, 88, "bold 9px 'League Spartan', sans-serif", "#94A3B8");
      drawTextWithShadow("BUCC", 670, 142, "bold 53px 'League Spartan', Montserrat, sans-serif", "#FFFFFF");
      drawTrackedText("BRAC UNIVERSITY", 670, 156, "bold 9px 'League Spartan', sans-serif", "#FFFFFF", 0.8);
      drawTrackedText("COMPUTER CLUB", 670, 166, "bold 9px 'League Spartan', sans-serif", "#FFFFFF", 0.8);

      // 6. Right TO: Room No & Subtitle
      const rightRoomFontSize = roomNo.length <= 7 ? 34 : 23;
      drawTextWithShadow("TO:", 835, 88, "bold 9px 'League Spartan', sans-serif", "#94A3B8");
      drawTextWithShadow(roomNo, 835, 142, `bold ${rightRoomFontSize}px 'League Spartan', Montserrat, sans-serif`, "#FFFFFF");
      drawTrackedText("BRAC UNIVERSITY", 835, 160, "bold 11px 'League Spartan', sans-serif", "#FFFFFF", 1.0);

      // 7. Right Passenger (LAST/FIRST) & Flight
      const rightPassName = formatPassengerName(member?.name);
      const rightNameFontSize = rightPassName.length <= 18 ? 13 : 11;
      drawTextWithShadow("PASSENGER:", 670, 330, "bold 9px 'League Spartan', sans-serif", "#94A3B8");
      drawTextWithShadow(rightPassName, 670, 344, `bold ${rightNameFontSize}px 'League Spartan', sans-serif`, "#FFFFFF");

      drawTextWithShadow("FLIGHT:", 880, 330, "bold 9px 'League Spartan', sans-serif", "#94A3B8");
      drawTextWithShadow(passFlight, 880, 344, "bold 13px 'League Spartan', monospace, sans-serif", "#6EE7B7");

      const finishDownload = () => {
        clearTimeout(timeout);
        const isIOS =
          typeof navigator !== "undefined" &&
          (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

        const isMobile =
          typeof navigator !== "undefined" &&
          (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

        const filename = `BUCC-BoardingPass-${activeVariant.id}-${passId !== "—" ? passId : "Doom"}.png`;

        canvas.toBlob(
          async (blob) => {
            if (!blob) {
              const dataUrl = canvas.toDataURL("image/png");
              if (isIOS) {
                setMobilePassModalUrl(dataUrl);
              } else {
                const link = document.createElement("a");
                link.download = filename;
                link.href = dataUrl;
                document.body.appendChild(link);
                link.click();
                setTimeout(() => document.body.removeChild(link), 200);
              }
              setDownloading(false);
              return;
            }

            // Only on mobile devices (iOS / Android) use the mobile Share Sheet ("Save Image to Photos")
            const file = new File([blob], filename, { type: "image/png" });
            if (
              isMobile &&
              typeof navigator !== "undefined" &&
              typeof navigator.share === "function" &&
              navigator.canShare &&
              navigator.canShare({ files: [file] })
            ) {
              try {
                await navigator.share({
                  files: [file],
                  title: "BUCC Airways Boarding Pass",
                  text: "My official BUCC Airways Boarding Pass",
                });
                toast("success", "Saved to Photos / Shared!");
                setDownloading(false);
                return;
              } catch (shareErr: unknown) {
                if (shareErr instanceof Error && shareErr.name === "AbortError") {
                  setDownloading(false);
                  return;
                }
                console.warn("Share failed, falling back to modal", shareErr);
              }
            }

            // On iOS if share was dismissed or unavailable (e.g. in-app browser)
            if (isIOS) {
              const dataUrl = canvas.toDataURL("image/png");
              setMobilePassModalUrl(dataUrl);
              setDownloading(false);
              return;
            }

            // Standard desktop download
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.download = filename;
            link.href = blobUrl;
            document.body.appendChild(link);
            link.click();
            setTimeout(() => {
              document.body.removeChild(link);
              URL.revokeObjectURL(blobUrl);
            }, 2000);

            toast("success", `Boarding pass (${activeVariant.name}) downloaded!`);
            setDownloading(false);
          },
          "image/png"
        );
      };

      const qrSvg = document.getElementById("doom-qr-svg");
      if (qrSvg) {
        const clonedSvg = qrSvg.cloneNode(true) as SVGSVGElement;
        const bgPath = clonedSvg.querySelector("path:first-child");
        if (bgPath) bgPath.setAttribute("fill", "none");
        if (!clonedSvg.getAttribute("xmlns")) {
          clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        }
        clonedSvg.setAttribute("width", "344");
        clonedSvg.setAttribute("height", "344");
        const xml = new XMLSerializer().serializeToString(clonedSvg);
        const qrImg = new Image();
        qrImg.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
        qrImg.onload = () => {
          // 1. Draw QR code with dark drop-shadow so it pops against bright backgrounds
          ctx.save();
          ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 2;
          ctx.drawImage(qrImg, 790, 174, 84, 84);
          ctx.restore();

          // 2. Draw perfectly centered "SCAN TO VERIFY PASS" with breathing gap
          ctx.save();
          ctx.textAlign = "center";
          drawTextWithShadow("SCAN TO VERIFY PASS", 832, 274, "bold 7.5px 'League Spartan', sans-serif", "#FFFFFF", "rgba(0,0,0,0.95)", 1, 1);
          ctx.restore();

          finishDownload();
        };
        qrImg.onerror = () => finishDownload();
      } else {
        finishDownload();
      }
    } catch (drawErr) {
      clearTimeout(timeout);
      console.error("Canvas draw error:", drawErr);
      toast("error", "Error creating pass. Please try again.");
      setDownloading(false);
    }
  };

  img.onerror = () => {
    clearTimeout(timeout);
    toast("error", "Failed to load template image for download");
    setDownloading(false);
  };
}

  const activeVariant = variants.find((v) => v.id === selectedVariantId) || variants[0];

  const meetingDate = selectedSession?.startsAt
    ? format(new Date(selectedSession.startsAt), "EEE, d MMMM yyyy")
    : "TBD Date";
  const meetingTime = selectedSession?.startsAt
    ? `${format(new Date(selectedSession.startsAt), "hh:mm a")} – ${selectedSession.endsAt ? format(new Date(selectedSession.endsAt), "hh:mm a") : "End"
    }`
    : "TBD Time";
  const venue = selectedSession?.venue || "Club Room 3";
  const roomText = (venue || "Club Room 3").toUpperCase();
  const flightCode = selectedSession
    ? `BUCC-${selectedSession.id.slice(-4).toUpperCase()}`
    : "BUCC-2026";

  const qrPayload = typeof window !== "undefined"
    ? `${window.location.origin}/pre-event?session=${selectedSession?.id || ""}&studentId=${encodeURIComponent(member?.studentId || "")}`
    : `BUCC-PASS-${member?.studentId || "GUEST"}`;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Session Selector & Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/70 dark:bg-navy-900/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-navy-800 shadow-sm print:hidden">
        <div className="flex items-center gap-2">
          <PlaneTakeoff className="h-5 w-5 text-electric-600 dark:text-electric-400" />
          <span className="text-sm font-semibold text-slate-900 dark:text-white">
            Scheduled Meeting:
          </span>
          {availableSessions.length > 1 ? (
            <div className="relative">
              <select
                aria-label="Select meeting session"
                value={selectedSession?.id || ""}
                onChange={(e) => {
                  const s = availableSessions.find((x) => x.id === e.target.value);
                  if (s) setSelectedSession(s);
                }}
                className="appearance-none rounded-xl bg-slate-100 dark:bg-navy-800 border border-slate-200 dark:border-navy-700 px-3 py-1.5 pr-8 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric-500"
              >
                {availableSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({format(new Date(s.startsAt), "d MMM")})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            </div>
          ) : (
            <span className="text-sm font-bold text-electric-600 dark:text-electric-400">
              {selectedSession?.name || "Upcoming Session"}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Theme switcher */}
          <div className="flex flex-wrap items-center bg-slate-100 dark:bg-navy-800 p-0.5 rounded-xl border border-slate-200 dark:border-navy-700">
            {livePacks.map((pack) => {
              const isSelected = passTheme === pack.id;
              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => setPassTheme(pack.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                    isSelected
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <Sparkles className="h-3 w-3 text-emerald-300" />
                  {pack.name}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPassTheme("classic")}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
                passTheme === "classic"
                  ? "bg-electric-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              Classic
            </button>
          </div>

          <Button variant="secondary" size="sm" onClick={handleDownloadPass} loading={downloading} className="gap-1.5 flex">
            <Download className="h-3.5 w-3.5 text-emerald-500" />
            <span>Download PNG</span>
          </Button>

          <Button variant="secondary" size="sm" onClick={handleShare} className="gap-1.5">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Share2 className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Share"}
          </Button>
          <Button variant="secondary" size="sm" onClick={handlePrint} className="gap-1.5 hidden md:flex">
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        </div>
      </div>

      {/* RSVP requires an authenticated member identity. */}
      {!member && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-slate-800 dark:text-slate-200 print:hidden">
          <p className="font-semibold text-sm flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-4 w-4" /> Sign in to manage your Boarding Pass
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            RSVP changes are restricted to your authenticated club account.
          </p>
        </div>
      )}

      {/* ── THE BOARDING PASS TICKET ───────────────────────────────────── */}
      {passTheme !== "classic" ? (
        <div className="space-y-4">
          {/* Active Theme Variant Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-white/70 dark:bg-navy-900/70 backdrop-blur-md border border-slate-200/80 dark:border-navy-800 shadow-sm print:hidden">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                {currentPack?.name || "Theme"} Style:
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {variants.map((v) => {
                const active = selectedVariantId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVariantId(v.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200",
                      active
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md scale-[1.02]"
                        : "bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70"
                    )}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full ring-2 ring-white/20"
                      style={{ backgroundColor: v.accent }}
                    />
                    <span>{v.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* DOCTOR DOOM THEMED BUCC AIRWAYS BOARDING PASS */}
          <div className="relative group transition-all duration-300">
            <div
              className={cn(
                "absolute -inset-1 rounded-3xl blur-xl opacity-80 group-hover:opacity-100 transition duration-500 pointer-events-none bg-gradient-to-r",
                activeVariant.glow
              )}
            />
            <div className="relative aspect-[1024/435] w-full select-none filter drop-shadow-[0_16px_32px_rgba(0,0,0,0.6)]">
              <img
                crossOrigin="anonymous"
                src={activeVariant.file}
                alt={`BUCC Airways Boarding Pass - ${activeVariant.fullName}`}
                className="w-full h-full object-contain pointer-events-none"
              />
              <svg
                viewBox="0 0 1024 435"
                className="absolute inset-0 w-full h-full pointer-events-none font-sans"
                style={{ fontFamily: "var(--font-league-spartan), 'League Spartan', Montserrat, Inter, system-ui, sans-serif" }}
              >
                <defs>
                  <filter id="doomShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="1.5" dy="1.5" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.95" />
                  </filter>
                </defs>

                {/* ── LEFT TICKET PLACEHOLDERS ── */}
                {/* ── LEFT TICKET PLACEHOLDERS (0..640) ── */}
                {/* 1. Left FROM: BUCC & Full Form (League Spartan 52.8 & 12.6) */}
                <text x="75" y="88" fontSize="9" fontWeight="700" fill="#94A3B8" letterSpacing="0.08em">
                  FROM:
                </text>
                <text x="75" y="142" fontSize="53" fontWeight="800" fill="#FFFFFF" filter="url(#doomShadow)">
                  BUCC
                </text>
                <text x="75" y="160" fontSize="13" fontWeight="800" fill="#FFFFFF" letterSpacing="0.14em" filter="url(#doomShadow)">
                  BRAC UNIVERSITY COMPUTER CLUB
                </text>

                {/* 2. Left TO: Room No / Place (Positioned at 370, never crosses separating line at x=640) */}
                <text x="370" y="88" fontSize="9" fontWeight="700" fill="#94A3B8" letterSpacing="0.08em">
                  TO:
                </text>
                <text
                  x="370"
                  y="142"
                  fontSize={roomText.length <= 7 ? "53" : roomText.length <= 11 ? "38" : "30"}
                  textLength={roomText.length > 7 ? "240" : undefined}
                  lengthAdjust={roomText.length > 7 ? "spacingAndGlyphs" : undefined}
                  fontWeight="800"
                  fill="#FFFFFF"
                  filter="url(#doomShadow)"
                >
                  {roomText}
                </text>
                <text x="370" y="160" fontSize="13" fontWeight="800" fill="#FFFFFF" letterSpacing="0.14em" filter="url(#doomShadow)">
                  BRAC UNIVERSITY
                </text>

                {/* 3. Left Passenger Details */}
                <text x="75" y="302" fontSize="9" fontWeight="700" fill="#94A3B8" letterSpacing="0.06em">
                  PASSENGER
                </text>
                <text
                  x="75"
                  y="322"
                  fontSize={
                    (member?.name || "").length <= 18
                      ? "16"
                      : (member?.name || "").length <= 24
                      ? "13.5"
                      : "12"
                  }
                  textLength={(member?.name || "").length > 24 ? "245" : undefined}
                  lengthAdjust={(member?.name || "").length > 24 ? "spacingAndGlyphs" : undefined}
                  fontWeight="800"
                  fill="#FFFFFF"
                  filter="url(#doomShadow)"
                >
                  {(member?.name || "GUEST VOLUNTEER").toUpperCase()}
                </text>

                <text x="335" y="302" fontSize="9" fontWeight="700" fill="#94A3B8" letterSpacing="0.06em">
                  STUDENT ID
                </text>
                <text x="335" y="322" fontSize="16" fontWeight="800" fill="#6EE7B7" filter="url(#doomShadow)">
                  {member?.studentId || "—"}
                </text>

                <text x="445" y="302" fontSize="9" fontWeight="700" fill="#94A3B8" letterSpacing="0.06em">
                  DESIGNATION
                </text>
                <text
                  x="445"
                  y="322"
                  fontSize={(member?.designation || "").length <= 18 ? "16" : "13.5"}
                  textLength={(member?.designation || "").length > 18 ? "165" : undefined}
                  lengthAdjust={(member?.designation || "").length > 18 ? "spacingAndGlyphs" : undefined}
                  fontWeight="800"
                  fill="#FFFFFF"
                  filter="url(#doomShadow)"
                >
                  {(member?.designation || "MEMBER").toUpperCase()}
                </text>

                {/* 4. Left Bottom Details (Venue & Date/Time & Session) */}
                <text x="75" y="350" fontSize="9" fontWeight="700" fill="#94A3B8" letterSpacing="0.05em">
                  BOARDING DATE &amp; TIME
                </text>
                <text x="75" y="368" fontSize="11" fontWeight="800" fill="#FCD34D" filter="url(#doomShadow)">
                  {meetingDate} · {meetingTime}
                </text>

                <text x="370" y="350" fontSize="9" fontWeight="700" fill="#94A3B8" letterSpacing="0.05em">
                  SESSION
                </text>
                <text x="370" y="368" fontSize="11" fontWeight="800" fill="#FFFFFF" filter="url(#doomShadow)">
                  {(selectedSession?.name || "GENERAL MEETING").toUpperCase()}
                </text>

                {/* ── RIGHT STUB PLACEHOLDERS (640..1024) ── */}
                {/* 5. Right FROM: BUCC & Subtitle (Full form under BUCC) */}
                <text x="670" y="88" fontSize="9" fontWeight="700" fill="#94A3B8" letterSpacing="0.08em">
                  FROM:
                </text>
                <text x="670" y="142" fontSize="53" fontWeight="800" fill="#FFFFFF" filter="url(#doomShadow)">
                  BUCC
                </text>
                <text x="670" y="156" fontSize="9" fontWeight="800" fill="#FFFFFF" letterSpacing="0.06em" filter="url(#doomShadow)">
                  BRAC UNIVERSITY
                </text>
                <text x="670" y="166" fontSize="9" fontWeight="800" fill="#FFFFFF" letterSpacing="0.06em" filter="url(#doomShadow)">
                  COMPUTER CLUB
                </text>

                {/* 6. Right TO: Room No / Place */}
                <text x="835" y="88" fontSize="9" fontWeight="700" fill="#94A3B8" letterSpacing="0.08em">
                  TO:
                </text>
                <text
                  x="835"
                  y="142"
                  fontSize={roomText.length <= 7 ? "34" : "23"}
                  textLength={roomText.length > 7 ? "155" : undefined}
                  lengthAdjust={roomText.length > 7 ? "spacingAndGlyphs" : undefined}
                  fontWeight="800"
                  fill="#FFFFFF"
                  filter="url(#doomShadow)"
                >
                  {roomText}
                </text>
                <text x="835" y="160" fontSize="11" fontWeight="800" fill="#FFFFFF" letterSpacing="0.08em" filter="url(#doomShadow)">
                  BRAC UNIVERSITY
                </text>

                {/* 7. Right Passenger: LAST/FIRST format on right stub */}
                <text x="670" y="330" fontSize="9" fontWeight="700" fill="#94A3B8" letterSpacing="0.06em">
                  PASSENGER:
                </text>
                <text
                  x="670"
                  y="344"
                  fontSize={formatPassengerName(member?.name).length <= 18 ? "13" : "11"}
                  textLength={formatPassengerName(member?.name).length > 18 ? "190" : undefined}
                  lengthAdjust={formatPassengerName(member?.name).length > 18 ? "spacingAndGlyphs" : undefined}
                  fontWeight="800"
                  fill="#FFFFFF"
                  filter="url(#doomShadow)"
                >
                  {formatPassengerName(member?.name)}
                </text>

                {/* 8. Right Flight */}
                <text x="880" y="330" fontSize="9" fontWeight="700" fill="#94A3B8" letterSpacing="0.06em">
                  FLIGHT:
                </text>
                <text x="880" y="344" fontSize="13" fontWeight="800" fill="#6EE7B7" filter="url(#doomShadow)">
                  {flightCode}
                </text>
              </svg>

              {/* Transparent Boarding Pass QR Code on Right Stub (Centered at 81.25%) */}
              <div
                className="absolute pointer-events-none flex flex-col items-center justify-center select-none"
                style={{ left: "81.25%", top: "51.5%", transform: "translate(-50%, -50%)" }}
              >
                <QRCodeSVG
                  id="doom-qr-svg"
                  value={qrPayload}
                  size={86}
                  level="M"
                  fgColor="#ffffff"
                  bgColor="none"
                  className="w-16 h-16 sm:w-20 sm:h-20 drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]"
                />
                <span className="text-[7.5px] font-bold text-white mt-1 tracking-wider uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] whitespace-nowrap">
                  SCAN TO VERIFY PASS
                </span>
              </div>
            </div>
          </div>

          {/* RSVP Status Dock for Doom Edition */}
          <div className="bg-slate-900/90 border border-emerald-500/30 backdrop-blur-md rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl text-white">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono tracking-widest text-emerald-400/80 uppercase">
                LIVE STATUS:
              </span>
              {status === "Confirmed" ? (
                <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 px-3.5 py-1.5 text-emerald-400 font-black text-xs sm:text-sm tracking-wide shadow-lg shadow-emerald-500/10">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  BOARDING CONFIRMED
                </div>
              ) : status === "Cancelled" ? (
                <div className="inline-flex items-center gap-2 rounded-xl bg-rose-500/20 border border-rose-500/40 px-3.5 py-1.5 text-rose-400 font-black text-xs sm:text-sm tracking-wide shadow-lg shadow-rose-500/10">
                  <XCircle className="h-4 w-4 text-rose-400" />
                  BOARDING CANCELLED
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-xl bg-amber-500/20 border border-amber-500/40 px-3.5 py-1.5 text-amber-300 font-semibold text-xs sm:text-sm tracking-wide animate-pulse">
                  <Clock className="h-4 w-4 text-amber-400" />
                  RSVP PENDING
                </div>
              )}
              {lastUpdated && (
                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                  (Saved {format(lastUpdated, "hh:mm a")})
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleDownloadPass}
                disabled={downloading}
                className="flex sm:hidden flex-1 items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all duration-200 shadow-md active:scale-[0.98]"
              >
                <Download className="h-4 w-4 text-emerald-400" />
                <span>Save Pass</span>
              </button>

              <button
                onClick={() => handleRsvp("Confirmed")}
                disabled={loading || !member}
                className={cn(
                  "flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 shadow-md",
                  status === "Confirmed"
                    ? "bg-emerald-500 text-white ring-2 ring-emerald-400 ring-offset-2 ring-offset-navy-950 shadow-emerald-500/30"
                    : "bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98]",
                  (loading || !member) && "opacity-50 cursor-not-allowed"
                )}
              >
                <PlaneTakeoff className="h-4 w-4" />
                <span>Coming</span>
              </button>

              <button
                onClick={() => handleRsvp("Cancelled")}
                disabled={loading || !member}
                className={cn(
                  "flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
                  status === "Cancelled"
                    ? "bg-rose-500/25 text-rose-300 border border-rose-500/60 ring-2 ring-rose-500/30"
                    : "bg-white/5 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-white/10 hover:border-rose-500/40",
                  (loading || !member) && "opacity-50 cursor-not-allowed"
                )}
              >
                <PlaneLanding className="h-4 w-4" />
                <span>Not Coming</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* CLASSIC CSS CARD */
        <div className="relative group transition-all duration-300">
          {/* Glow halo in background */}
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-blue-600/20 via-indigo-600/20 to-purple-600/20 blur-xl opacity-75 group-hover:opacity-100 transition duration-500 pointer-events-none" />

          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-navy-950 via-slate-900 to-navy-900 border border-slate-700/60 shadow-2xl text-white">
            {/* Top Aerospace Ribbon */}
            <div className="bg-gradient-to-r from-electric-700 via-indigo-600 to-navy-800 px-6 py-3.5 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
                  <img src="/bucc-logo.png" alt="BUCC" className="h-6 w-auto object-contain" />
                </div>
                <div>
                  <p className="text-xs font-black tracking-widest text-white uppercase">
                    BUCC AIRWAYS · PRE-EVENT PASS
                  </p>
                  <p className="text-[10px] tracking-wider text-white/80 font-mono">
                    BRAC UNIVERSITY COMPUTER CLUB
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] uppercase font-mono tracking-wider text-slate-300">
                    FLIGHT NO.
                  </p>
                  <p className="text-xs font-black tracking-widest text-amber-400 font-mono">
                    {flightCode}
                  </p>
                </div>
                <span className="rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold tracking-wider uppercase backdrop-blur-md border border-white/20 text-white shadow-sm">
                  PRIORITY BOARDING
                </span>
              </div>
            </div>

            {/* Ticket Body Layout: Left Main Section + Perforation + Right Stub */}
            <div className="flex flex-col lg:flex-row relative">
              {/* ── MAIN BOARDING SECTION (LEFT) ── */}
              <div className="flex-1 p-6 sm:p-8 space-y-6">
                {/* Route & Session Name */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
                  <div>
                    <span className="text-[10px] font-mono tracking-widest text-electric-400 uppercase font-semibold">
                      DESTINATION MEETING
                    </span>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-0.5">
                      {selectedSession?.name || "Scheduled BUCC Meeting"}
                    </h2>
                  </div>

                  {/* Simulated Airport Route: BRACU ✈ CLUB */}
                  <div className="flex items-center gap-3 self-start sm:self-center bg-white/5 border border-white/10 rounded-2xl px-4 py-2">
                    <div className="text-center">
                      <p className="text-xs font-mono font-bold tracking-wider text-slate-400">DEP</p>
                      <p className="text-sm font-black text-white">BRACU</p>
                    </div>
                    <div className="flex flex-col items-center px-1">
                      <PlaneTakeoff className="h-4 w-4 text-electric-400 animate-pulse" />
                      <div className="w-12 border-t border-dashed border-white/30 my-1" />
                      <span className="text-[9px] font-mono text-slate-400">NON-STOP</span>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-mono font-bold tracking-wider text-slate-400">ARR</p>
                      <p className="text-sm font-black text-amber-400">SESSION</p>
                    </div>
                  </div>
                </div>

                {/* Passenger Credentials Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
                  <div className="col-span-2">
                    <p className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
                      PASSENGER NAME
                    </p>
                    <p className="text-base sm:text-lg font-black tracking-wide text-white uppercase truncate">
                      {member ? member.name : "GUEST VOLUNTEER"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
                      STUDENT ID
                    </p>
                    <p className="text-sm sm:text-base font-bold font-mono tracking-wider text-electric-300">
                      {member ? member.studentId : "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
                      CABIN / DEPT
                    </p>
                    <p className="text-sm sm:text-base font-bold text-white truncate">
                      {member ? member.dept : "BUCC Club"}
                    </p>
                  </div>

                  <div className="col-span-1 sm:col-span-2">
                    <p className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
                      DESIGNATION
                    </p>
                    <p className="text-sm font-semibold text-slate-300 truncate">
                      {member ? member.designation : "Member"}
                    </p>
                  </div>

                  <div className="col-span-1 sm:col-span-2">
                    <p className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
                      GATE / VENUE
                    </p>
                    <p className="text-sm font-bold text-white flex items-center gap-1 truncate">
                      <MapPin className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                      {venue}
                    </p>
                  </div>

                  <div className="col-span-2 sm:col-span-4 pt-1">
                    <p className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
                      BOARDING DATE & TIME
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-200 mt-0.5">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-white font-bold">
                        <Calendar className="h-3.5 w-3.5 text-electric-400 shrink-0" />
                        <span>{meetingDate}</span>
                      </span>
                      <span className="text-slate-500 font-bold">·</span>
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-amber-300 font-medium">
                        <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <span>{meetingTime}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Stamp & Interaction Row */}
                <div className="pt-4 border-t border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Live Boarding Status Badge */}
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
                      STATUS:
                    </span>
                    {status === "Confirmed" ? (
                      <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 px-3.5 py-1.5 text-emerald-400 font-black text-xs sm:text-sm tracking-wide shadow-lg shadow-emerald-500/10 animate-in fade-in zoom-in-95 duration-200">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        BOARDING CONFIRMED
                      </div>
                    ) : status === "Cancelled" ? (
                      <div className="inline-flex items-center gap-2 rounded-xl bg-rose-500/20 border border-rose-500/40 px-3.5 py-1.5 text-rose-400 font-black text-xs sm:text-sm tracking-wide shadow-lg shadow-rose-500/10 animate-in fade-in zoom-in-95 duration-200">
                        <XCircle className="h-4 w-4 text-rose-400" />
                        BOARDING CANCELLED
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2 rounded-xl bg-amber-500/20 border border-amber-500/40 px-3.5 py-1.5 text-amber-300 font-semibold text-xs sm:text-sm tracking-wide animate-pulse">
                        <Clock className="h-4 w-4 text-amber-400" />
                        RSVP PENDING
                      </div>
                    )}
                    {lastUpdated && (
                      <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                        (Saved {format(lastUpdated, "hh:mm a")})
                      </span>
                    )}
                  </div>

                  {/* RSVP Action Buttons */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleRsvp("Confirmed")}
                      disabled={loading || !member}
                      className={cn(
                        "flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 shadow-md",
                        status === "Confirmed"
                          ? "bg-emerald-500 text-white ring-2 ring-emerald-400 ring-offset-2 ring-offset-navy-950 shadow-emerald-500/30"
                          : "bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98]",
                        (loading || !member) && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <PlaneTakeoff className="h-4 w-4" />
                      <span>Coming</span>
                    </button>

                    <button
                      onClick={() => handleRsvp("Cancelled")}
                      disabled={loading || !member}
                      className={cn(
                        "flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
                        status === "Cancelled"
                          ? "bg-rose-500/25 text-rose-300 border border-rose-500/60 ring-2 ring-rose-500/30"
                          : "bg-white/5 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-white/10 hover:border-rose-500/40",
                        (loading || !member) && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <PlaneLanding className="h-4 w-4" />
                      <span>Not Coming</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* ── PERFORATION DIVIDER & NOTCHES ── */}
              <div className="relative flex lg:flex-col items-center justify-between">
                {/* Top notch cutout */}
                <div className="hidden lg:block absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-slate-100 dark:bg-navy-950 border border-slate-700/60 shadow-inner z-10" />
                {/* Bottom notch cutout */}
                <div className="hidden lg:block absolute -bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-slate-100 dark:bg-navy-950 border border-slate-700/60 shadow-inner z-10" />

                {/* Dashed Perforated Line */}
                <div className="w-full lg:w-0 lg:h-full border-t lg:border-t-0 lg:border-l-2 border-dashed border-white/20 my-2 lg:my-0 lg:mx-0" />
              </div>

              {/* ── TEAR-OFF BOARDING STUB (RIGHT) ── */}
              <div className="w-full lg:w-72 bg-white/[0.03] p-6 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase">
                      BOARDING STUB
                    </span>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      {flightCode}
                    </span>
                  </div>

                  {/* Passenger Stub info */}
                  <div>
                    <p className="text-[9px] font-mono text-slate-400 uppercase">PASSENGER</p>
                    <p className="text-sm font-bold text-white uppercase truncate">
                      {member ? member.name : "GUEST"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-[9px] font-mono text-slate-400 uppercase">STUDENT ID</p>
                      <p className="font-mono font-bold text-slate-200">{member ? member.studentId : "—"}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-mono text-slate-400 uppercase">ZONE</p>
                      <p className="font-bold text-white">PRIORITY A</p>
                    </div>
                  </div>

                  {/* QR Code Container */}
                  <div className="p-3 bg-white rounded-2xl flex flex-col items-center justify-center shadow-md">
                    <QRCodeSVG
                      value={qrPayload}
                      size={110}
                      level="M"
                      fgColor="#0a0f1d"
                      bgColor="#ffffff"
                    />
                    <p className="text-[9px] font-mono font-bold text-slate-600 mt-1.5 tracking-wider uppercase">
                      SCAN TO VERIFY PASS
                    </p>
                  </div>
                </div>

                {/* Barcode line aesthetic */}
                <div className="space-y-1">
                  <div className="h-7 w-full flex items-center justify-between gap-0.5 overflow-hidden opacity-75">
                    {Array.from({ length: 48 }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-full bg-white",
                          i % 7 === 0 ? "w-1.5" : i % 3 === 0 ? "w-1" : "w-0.5"
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-[8px] font-mono tracking-widest text-center text-slate-400">
                    *{member?.studentId || "00000000"}*BUCC*2026*
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* iOS & Mobile Fallback Modal: Touch & Hold to Save */}
      {mobilePassModalUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          onClick={() => setMobilePassModalUrl(null)}
        >
          <div
            className="relative max-w-lg w-full rounded-3xl bg-navy-950 p-5 border border-slate-700 shadow-2xl flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <Download className="h-4 w-4 text-emerald-400" /> Save Boarding Pass
              </div>
              <button
                type="button"
                onClick={() => setMobilePassModalUrl(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden border border-slate-700 bg-black/40 shadow-xl my-2 w-full">
              <img
                src={mobilePassModalUrl}
                alt="Generated Boarding Pass"
                className="w-full h-auto select-auto"
              />
            </div>

            <div className="w-full text-center space-y-3 mt-3">
              <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-center gap-2">
                <span>📲 <strong>Tap & hold the pass above</strong> and choose <strong>&quot;Save to Photos&quot;</strong>.</span>
              </div>

              <div className="flex gap-2 w-full">
                <Button
                  variant="secondary"
                  className="flex-1 text-xs"
                  onClick={() => {
                    window.open(mobilePassModalUrl, "_blank");
                  }}
                >
                  Open in New Tab
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                  onClick={() => setMobilePassModalUrl(null)}
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
