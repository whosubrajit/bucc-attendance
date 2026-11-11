import Link from "next/link";
import { PlaneTakeoff } from "lucide-react";
import { requirePageMember } from "@/lib/page-guards";
import { MemberProfile } from "@/components/member-profile";
import { DashboardLiveMeeting } from "@/components/dashboard-live-meeting";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [member, activePreEvent] = await Promise.all([
    requirePageMember(),
    prisma.session.findFirst({
      where: {
        isPreEvent: true,
        isActive: true,
        startsAt: { gt: new Date() }, // Turns off right when meeting starts
      },
      select: { id: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      {/* Pre-event button only turns on before meeting starts */}
      {activePreEvent && (
        <div className="flex justify-end">
          <Link
            href="/pre-event"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-electric-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-electric-500 hover:to-indigo-500 transition-all"
          >
            <PlaneTakeoff className="h-4 w-4" />
            Pre-Event Boarding Pass
          </Link>
        </div>
      )}

      {/* Automatically turns on when actual meeting is live for QR Scan */}
      <DashboardLiveMeeting member={member} />

      {/* Member Profile replaces previous dashboard view */}
      <MemberProfile memberId={member.id} />
    </div>
  );
}
