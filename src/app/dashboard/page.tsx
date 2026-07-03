/**
 * Personal view — every role: own history, current status, total hours.
 */
import { requirePageMember } from "@/lib/page-guards";
import { PersonalView } from "@/components/personal-view";

export default async function DashboardPage() {
  const member = await requirePageMember();
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold">My Attendance</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {member.name} · {member.studentId} · {member.department} · {member.designation}
        </p>
      </div>
      <PersonalView />
    </>
  );
}
