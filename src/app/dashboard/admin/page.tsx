import { requirePagePermission } from "@/lib/page-guards";
import { AdminPanel } from "@/components/admin-panel";

export default async function AdminPage() {
  await requirePagePermission("members:manage");
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold">Admin Panel</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Governing Body tools: sessions & QR codes, member management, announcements.
        </p>
      </div>
      <AdminPanel />
    </>
  );
}
