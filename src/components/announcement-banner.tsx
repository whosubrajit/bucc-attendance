"use client";

import useSWR from "swr";
import { Megaphone } from "lucide-react";

type Announcement = { id: string; message: string; createdBy: { name: string } };

export function AnnouncementBanner() {
  const { data } = useSWR<{ announcements: Announcement[] }>("/api/announcements", {
    refreshInterval: 60000,
  });
  if (!data?.announcements.length) return null;
  return (
    <div className="border-b border-electric-600/30 bg-electric-600/10">
      <div className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-2 text-sm text-navy-800 dark:text-electric-400">
        <Megaphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          {data.announcements.map((a) => (
            <p key={a.id}>
              <span className="font-medium">{a.message}</span>{" "}
              <span className="text-xs opacity-70">— {a.createdBy.name}</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
