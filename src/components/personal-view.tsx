"use client";

import { useState } from "react";
import useSWR from "swr";
import { format } from "date-fns";
import { CalendarDays, Clock, Trophy, History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatDuration, cn } from "@/lib/utils";
import { useRealtime } from "@/hooks/use-realtime";

type HistoryRow = {
  id: string;
  checkInAt: string;
  checkOutApprovedAt: string | null;
  status: string;
  method: string;
  durationMinutes: number | null;
  session: { name: string; venue: string | null };
};
type HistoryResponse = {
  rows: HistoryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalMinutes: number;
  completedSessions: number;
};

export function PersonalView() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR<HistoryResponse>(`/api/attendance/history?page=${page}`);
  useRealtime();

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon={<Clock className="h-5 w-5" aria-hidden />} label="Total hours" value={formatDuration(data?.totalMinutes ?? 0)} />
        <StatCard icon={<Trophy className="h-5 w-5" aria-hidden />} label="Completed sessions" value={String(data?.completedSessions ?? 0)} />
        <StatCard icon={<CalendarDays className="h-5 w-5" aria-hidden />} label="Total check-ins" value={String(data?.total ?? 0)} />
      </div>

      {/* Calendar heatmap (last 20 weeks) */}
      {rows.length > 0 && <CalendarHeatmap rows={rows} />}

      {/* History table */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold dark:border-navy-800">History</div>
        {rows.length === 0 ? (
          <EmptyState
            icon={History}
            title="No attendance yet"
            hint="Scan a session QR code or use manual check-in — your volunteering record will show up here."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-navy-800">
                    <th className="px-4 py-2">Session</th>
                    <th className="px-4 py-2">Check-in</th>
                    <th className="px-4 py-2">Sign-out</th>
                    <th className="px-4 py-2">Duration</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-navy-800/50">
                      <td className="px-4 py-2.5 font-medium">{r.session.name}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">{format(new Date(r.checkInAt), "d MMM, h:mm a")}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {r.checkOutApprovedAt ? format(new Date(r.checkOutApprovedAt), "h:mm a") : "—"}
                      </td>
                      <td className="px-4 py-2.5">{r.durationMinutes != null ? formatDuration(r.durationMinutes) : "—"}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-slate-500">Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">{icon}<span className="text-xs font-medium uppercase tracking-wide">{label}</span></div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

/** GitHub-style calendar heatmap of the member's recent check-ins. */
function CalendarHeatmap({ rows }: { rows: HistoryRow[] }) {
  const WEEKS = 20;
  const days = WEEKS * 7;
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = new Date(r.checkInAt).toDateString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const today = new Date();
  const cells = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    return { date: d, count: counts.get(d.toDateString()) ?? 0 };
  });
  return (
    <div className="card p-4">
      <p className="mb-3 text-sm font-semibold">Activity — last {WEEKS} weeks</p>
      <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto" role="img" aria-label="Attendance calendar heatmap">
        {cells.map(({ date, count }, i) => (
          <div
            key={i}
            title={`${format(date, "d MMM yyyy")}: ${count} check-in${count === 1 ? "" : "s"}`}
            className={cn(
              "h-3 w-3 rounded-sm",
              count === 0 && "bg-slate-100 dark:bg-navy-800",
              count === 1 && "bg-electric-400/60",
              count >= 2 && "bg-electric-600",
            )}
          />
        ))}
      </div>
    </div>
  );
}
