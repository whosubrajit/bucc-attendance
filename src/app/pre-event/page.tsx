import Link from "next/link";
import { getCurrentMember } from "@/lib/page-guards";
import { prisma } from "@/lib/prisma";
import { Navbar } from "@/components/navbar";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { BoardingPass } from "@/components/boarding-pass";
import { Sparkles, Calendar, Ticket, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function PreEventPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; studentId?: string }>;
}) {
  const [{ session: targetSessionId, studentId: targetStudentId }, currentMember] = await Promise.all([
    searchParams,
    getCurrentMember(),
  ]);

  const now = new Date();
  // Only upcoming sessions explicitly marked as pre-events BEFORE the meeting starts
  // "Pre_event tracker will turn off just before actual meeting starts"
  const sessions = await prisma.session.findMany({
    where: {
      isPreEvent: true,
      isActive: true,
      startsAt: { gt: now },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      name: true,
      venue: true,
      startsAt: true,
      endsAt: true,
      isActive: true,
      isPreEvent: true,
    },
  });

  const serializedSessions = sessions.map((s) => ({
    ...s,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
  }));

  const activeSession = targetSessionId
    ? serializedSessions.find((s) => s.id === targetSessionId) ?? serializedSessions[0] ?? null
    : serializedSessions[0] ?? null;

  // Resolve member info (logged in or requested via search param)
  let resolvedMember = null;
  if (currentMember) {
    resolvedMember = {
      id: currentMember.id,
      name: currentMember.name,
      studentId: currentMember.studentId,
      dept: currentMember.department,
      designation: currentMember.designation,
      role: currentMember.role,
    };
  }

  // Check initial RSVP status
  let initialStatus: "Confirmed" | "Cancelled" | null = null;
  if (activeSession && resolvedMember?.studentId) {
    const existing = await prisma.preEventRsvp.findUnique({
      where: {
        sessionId_studentId: {
          sessionId: activeSession.id,
          studentId: resolvedMember.studentId,
        },
      },
      select: { status: true },
    });
    if (existing) {
      initialStatus = existing.status as "Confirmed" | "Cancelled";
    }
  }

  return (
    <>
      <Navbar />
      <AnnouncementBanner />
      <main className="min-h-screen bg-slate-50 dark:bg-navy-950 py-8 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto mb-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-electric-500/10 border border-electric-500/20 text-electric-600 dark:text-electric-400 text-xs font-semibold mb-3">
            <Sparkles className="h-3.5 w-3.5" />
            <span>BUCC Event Logistics & Pre-Meeting Tracker</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Pre-Event Boarding Pass
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            Confirm your attendance for upcoming scheduled club meetings. RSVP choices are synchronized
            directly to the live roster in our database.
          </p>
        </div>

        {serializedSessions.length === 0 ? (
          <div className="max-w-md mx-auto card p-8 text-center space-y-4 my-8">
            <div className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-navy-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto">
              <Ticket className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                No Active Pre-Event Pass
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                There are currently no upcoming meetings with Pre-Event Pass enabled.
                Leadership can activate pre-event registration for any upcoming session from the Sessions panel.
              </p>
            </div>
          </div>
        ) : (
          <BoardingPass
            initialSession={activeSession}
            availableSessions={serializedSessions}
            currentMember={resolvedMember}
            initialStatus={initialStatus}
          />
        )}
      </main>
    </>
  );
}
