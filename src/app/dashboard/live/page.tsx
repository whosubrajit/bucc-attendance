/**
 * Live board — EB/SE see their department, HR_EB/HR_SE/GB see all.
 * (Scope is enforced again in the API; this guard is just the doorway.)
 */
import { requirePagePermission } from "@/lib/page-guards";
import { can } from "@/lib/rbac";
import { LiveBoard } from "@/components/live-board";

export default async function LiveBoardPage() {
  const member = await requirePagePermission("live:department");
  const global = can(member.role, "live:all");
  const canExport = can(member.role, "reports:export");
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold">Live Attendance Board</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {global ? "All departments" : `${member.department} department`} · updates in realtime
        </p>
      </div>
      <LiveBoard global={global} canExport={canExport} />
    </>
  );
}
