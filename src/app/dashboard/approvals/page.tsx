import { requirePagePermission } from "@/lib/page-guards";
import { ApprovalsPanel } from "@/components/approvals-panel";

export default async function ApprovalsPage() {
  await requirePagePermission("signout:approve");
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold">Sign-Out Approvals</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Review pending sign-out requests. Requests unanswered for 30 minutes escalate; after 2 hours they auto-approve.
        </p>
      </div>
      <ApprovalsPanel />
    </>
  );
}
