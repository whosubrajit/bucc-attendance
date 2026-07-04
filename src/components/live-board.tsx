"use client";

import { useState } from "react";
import useSWR from "swr";
import { format } from "date-fns";
import { ChevronDown, Download, UsersRound } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { useDebounce } from "@/hooks/use-debounce";
import { useRealtime } from "@/hooks/use-realtime";
import { cn } from "@/lib/utils";

type LiveRow = {
  id: string;
  checkInAt: string;
  status: string;
  method: string;
  member: { name: string; department: string; designation: string };
  session: { name: string };
};
type LiveResponse = {
  rows: LiveRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
  departments: { department: string; present: number; pending: number; left: number }[];
};

const inputCls =
  "h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900";

export function LiveBoard({ global }: { global: boolean }) {
  const [q, setQ] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState(""); // empty = today
  const [session, setSession] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const debouncedQ = useDebounce(q);
  useRealtime();

  const params = new URLSearchParams();
  if (debouncedQ) params.set("q", debouncedQ);
  if (department) params.set("department", department);
  if (status) params.set("status", status);
  if (date) params.set("date", date);
  if (session) params.set("sessionId", session);
  params.set("page", String(page));

  const { data, isLoading } = useSWR<LiveResponse>(`/api/dashboard/live?${params}`, {
    refreshInterval: 30000, // polling fallback under SSE
    keepPreviousData: true,
  });
  
  const { data: sessionData } = useSWR<{ sessions: { id: string; name: string }[] }>("/api/sessions");

  const counts = data?.counts ?? {};
  const present = counts.PRESENT ?? 0;
  const pending = counts.PENDING_SIGNOUT ?? 0;
  const left = counts.LEFT ?? 0;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      {/* Counters */}
      <div className="grid grid-cols-3 gap-3">
        <Counter label="🟢 Present" value={present} className="text-emerald-600 dark:text-emerald-400" />
        <Counter label="🟡 Pending" value={pending} className="text-amber-600 dark:text-amber-400" />
        <Counter label="🔴 Left" value={left} className="text-rose-600 dark:text-rose-400" />
      </div>

      {/* Per-department breakdown (global viewers only) */}
      {global && (data?.departments.length ?? 0) > 0 && (
        <div className="card divide-y divide-slate-100 dark:divide-navy-800/60">
          {data!.departments.map((d) => (
            <div key={d.department}>
              <button
                className="flex w-full items-center justify-between px-4 py-3 text-sm"
                onClick={() => setExpanded((e) => (e === d.department ? null : d.department))}
                aria-expanded={expanded === d.department}
              >
                <span className="font-medium">{d.department}</span>
                <span className="flex items-center gap-3 text-slate-500">
                  <span className="tabular-nums">{d.present + d.pending + d.left} checked in</span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", expanded === d.department && "rotate-180")} aria-hidden />
                </span>
              </button>
              <AnimatePresence>
                {expanded === d.department && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex gap-4 px-4 pb-3 text-sm text-slate-600 dark:text-slate-300">
                      <span>🟢 {d.present} present</span>
                      <span>🟡 {d.pending} pending</span>
                      <span>🔴 {d.left} left</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Search by name…"
          aria-label="Search members by name"
          className={cn(inputCls, "flex-1 min-w-40")}
        />
        {global && (
          <select value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }} aria-label="Filter by department" className={inputCls}>
            <option value="">All departments</option>
            {data?.departments.map((d) => <option key={d.department} value={d.department}>{d.department}</option>)}
          </select>
        )}
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status" className={inputCls}>
          <option value="">All statuses</option>
          <option value="PRESENT">Present</option>
          <option value="PENDING_SIGNOUT">Pending Sign-Out</option>
          <option value="LEFT">Left</option>
        </select>
        <select value={session} onChange={(e) => { setSession(e.target.value); setPage(1); }} aria-label="Filter by event" className={inputCls}>
          <option value="">All events</option>
          {sessionData?.sessions.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} aria-label="Filter by date" className={inputCls} />
        <a href={`/api/export?${session ? `sessionId=${session}` : (date ? `from=${date}&to=${date}` : '')}`}>
          <Button variant="secondary"><Download className="h-4 w-4" aria-hidden /> CSV</Button>
        </a>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading && !data ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" />
          </div>
        ) : !data?.rows.length ? (
          <EmptyState
            icon={UsersRound}
            title="No check-ins for this day"
            hint="Once members start scanning the session QR, they'll appear here instantly."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-navy-800">
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Department</th>
                  <th className="px-4 py-2">Designation</th>
                  <th className="px-4 py-2">Session</th>
                  <th className="px-4 py-2">Check-in</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-navy-800/50">
                    <td className="px-4 py-2.5 font-medium">{r.member.name}</td>
                    <td className="px-4 py-2.5">{r.member.department}</td>
                    <td className="px-4 py-2.5">{r.member.designation}</td>
                    <td className="px-4 py-2.5">{r.session.name}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{format(new Date(r.checkInAt), "h:mm a")}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm dark:border-navy-800">
            <span className="text-slate-500">Page {page} of {totalPages} · {data?.total} records</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Counter({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="card p-4 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <motion.p
        key={value}
        initial={{ scale: 1.25, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        className={cn("mt-1 text-3xl font-bold tabular-nums", className)}
      >
        {value}
      </motion.p>
    </div>
  );
}
