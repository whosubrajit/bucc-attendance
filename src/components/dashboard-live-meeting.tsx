"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { format } from "date-fns";
import {
  QrCode,
  MapPin,
  Clock,
  CheckCircle2,
  Camera,
  ChevronDown,
  ChevronUp,
  Radio,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type LiveSession = {
  id: string;
  name: string;
  venue: string | null;
  startsAt: string;
  endsAt: string;
  requiresFeedback: boolean;
  attendance: { status: string; checkInAt: string; checkOutRequestedAt: string | null } | null;
};

export function DashboardLiveMeeting({ member }: { member: any }) {
  const [showPersonalQr, setShowPersonalQr] = useState(false);

  // Poll for active live meeting sessions every 30 seconds (revalidates instantly on tab focus)
  const { data, isLoading } = useSWR<{ sessions: LiveSession[] }>(
    "/api/attendance/current",
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  );

  // Rotating personal QR token for check-in
  const { data: qrData } = useSWR<{ token: string; refreshSeconds: number }>(
    showPersonalQr ? "/api/attendance/qr" : null,
    { refreshInterval: 50000 }
  );

  const isScanner = ["EB", "HR_SE", "HR_EB", "GB"].includes(member?.role);
  const liveSessions = data?.sessions ?? [];

  // When no active meeting is in progress, the card automatically turns OFF
  if (!isLoading && liveSessions.length === 0) {
    return null;
  }

  if (isLoading && !data) {
    return (
      <div className="mb-6">
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mb-6 space-y-4">
      {liveSessions.map((session) => {
        const isCheckedIn = session.attendance && session.attendance.status !== "LEFT";
        const startsFormatted = format(new Date(session.startsAt), "hh:mm a");
        const endsFormatted = format(new Date(session.endsAt), "hh:mm a");

        return (
          <div
            key={session.id}
            className="relative overflow-hidden rounded-3xl border-2 border-emerald-500/50 bg-gradient-to-r from-navy-950 via-slate-900 to-navy-900 p-5 sm:p-6 text-white shadow-xl shadow-emerald-500/10 transition-all duration-300"
          >
            {/* Live background glow */}
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl animate-pulse" />

            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-5">
              {/* Meeting info */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 text-xs font-bold text-emerald-400">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    Live Meeting In Progress
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    BUCC-{session.id.slice(-4).toUpperCase()}
                  </span>
                </div>

                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    {session.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-300 mt-1">
                    {session.venue && (
                      <span className="flex items-center gap-1 font-medium text-rose-300">
                        <MapPin className="h-3.5 w-3.5" />
                        {session.venue}
                      </span>
                    )}
                    <span className="text-slate-500">·</span>
                    <span className="flex items-center gap-1 text-slate-300">
                      <Clock className="h-3.5 w-3.5 text-amber-400" />
                      {startsFormatted} – {endsFormatted}
                    </span>
                  </div>
                </div>

                {/* Status message */}
                {isCheckedIn ? (
                  <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 mt-1">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>
                      You are checked in! (since{" "}
                      {format(new Date(session.attendance!.checkInAt), "hh:mm a")})
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-300">
                    Meeting is happening right now! Scan the venue QR or show your code below to record attendance.
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {isCheckedIn ? (
                  <Link
                    href="/attend"
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-200 transition-colors shadow-sm"
                  >
                    <span>Request Sign-Out</span>
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/attend"
                      className="inline-flex items-center gap-2 rounded-xl bg-electric-600 hover:bg-electric-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-electric-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <QrCode className="h-4 w-4" />
                      <span>Scan Venue QR</span>
                    </Link>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowPersonalQr((s) => !s)}
                      className="gap-1.5 text-xs h-10 border-white/20 bg-white/10 text-white hover:bg-white/20"
                    >
                      <QrCode className="h-3.5 w-3.5 text-amber-400" />
                      <span>{showPersonalQr ? "Hide My QR" : "Show My QR"}</span>
                      {showPersonalQr ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </Button>
                  </>
                )}

                {isScanner && (
                  <Link
                    href="/attend"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-3.5 py-2 text-xs font-bold text-emerald-300 transition-colors"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>Scanner Mode</span>
                  </Link>
                )}
              </div>
            </div>

            {/* Expandable Personal QR Display for quick check-in */}
            {showPersonalQr && !isCheckedIn && (
              <div className="mt-5 pt-5 border-t border-white/10 flex flex-col items-center text-center animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-3 bg-white rounded-2xl shadow-xl ring-2 ring-emerald-500/40">
                  {qrData?.token ? (
                    <QRCodeSVG
                      value={qrData.token}
                      size={180}
                      level="M"
                      fgColor="#0a0f1d"
                      bgColor="#ffffff"
                    />
                  ) : (
                    <Skeleton className="h-[180px] w-[180px] rounded-xl" />
                  )}
                </div>
                <p className="text-xs font-bold text-white mt-2">
                  {member?.name || "Member Pass"} ({member?.studentId})
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Show this dynamic QR code to any HR/EB member with a scanner.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
