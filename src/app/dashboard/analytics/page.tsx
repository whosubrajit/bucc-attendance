import { requirePagePermission } from "@/lib/page-guards";
import { can } from "@/lib/rbac";
import { AnalyticsView } from "@/components/analytics-view";

export default async function AnalyticsPage() {
  const member = await requirePagePermission("live:department");
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold">Analytics</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {can(member.role, "live:all") ? "All departments" : `${member.department} department`}
        </p>
      </div>
      <AnalyticsView />
    </>
  );
}
