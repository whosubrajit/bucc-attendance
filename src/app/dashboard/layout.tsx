import { requirePageMember } from "@/lib/page-guards";
import { Navbar } from "@/components/navbar";
import { AnnouncementBanner } from "@/components/announcement-banner";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requirePageMember();
  return (
    <>
      <Navbar />
      <AnnouncementBanner />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
