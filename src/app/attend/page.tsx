import { requirePageMember } from "@/lib/page-guards";
import { Navbar } from "@/components/navbar";
import { AttendClient } from "@/components/attend-client";

export const dynamic = "force-dynamic";

export default async function AttendPage() {
  const member = await requirePageMember();
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="text-xl font-bold">Mark Attendance</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Hi {member.name.split(" ")[0]} — scan the session QR or check in manually.
        </p>
        <AttendClient member={member} />
      </main>
    </>
  );
}
