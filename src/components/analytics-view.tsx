"use client";

import { useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDuration, cn } from "@/lib/utils";

type Stats = {
  days: number;
  sessionCount: number;
  byDepartment: { department: string; count: number }[];
  arrivalHeatmap: { dow: number; hour: number; count: number }[];
  leaderboard: { member?: { id: string; name: string; department: string; profilePhotoUrl: string | null }; minutes: number }[];
  health: { department: string; members: number; attended: number; score: number }[];
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7:00 → 21:00

export function AnalyticsView() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useSWR<Stats>(`/api/dashboard/stats?days=${days}`);

  if (isLoading && !data) {
    return <div className="space-y-4"><Skeleton className="h-64" /><Skeleton className="h-48" /></div>;
  }
  if (!data) return null;

  const maxHeat = Math.max(1, ...data.arrivalHeatmap.map((h) => h.count));
  const heat = new Map(data.arrivalHeatmap.map((h) => [`${h.dow}-${h.hour}`, h.count]));

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              days === d ? "bg-navy-800 text-white dark:bg-electric-600" : "bg-slate-100 text-slate-600 dark:bg-navy-800 dark:text-slate-300",
            )}
          >
            {d} days
          </button>
        ))}
      </div>

      {/* Attendance by department */}
      <div className="card p-4">
        <p className="mb-4 font-semibold">Attendance by department</p>
        {data.byDepartment.length === 0 ? (
          <EmptyState icon={BarChart3} title="No attendance data yet" hint="Charts light up after the first check-ins." />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byDepartment}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="department" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip cursor={{ fillOpacity: 0.1 }} />
                <Bar dataKey="count" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Time-of-arrival heatmap */}
      <div className="card overflow-x-auto p-4">
        <p className="mb-4 font-semibold">Time-of-arrival heatmap</p>
        <table className="text-xs" role="img" aria-label="Check-in frequency by day of week and hour">
          <thead>
            <tr>
              <th />
              {HOURS.map((h) => (
                <th key={h} className="px-1 pb-1 font-normal text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DOW.map((label, dow) => (
              <tr key={dow}>
                <td className="pr-2 text-slate-400">{label}</td>
                {HOURS.map((h) => {
                  const count = heat.get(`${dow}-${h}`) ?? 0;
                  return (
                    <td key={h} className="p-0.5">
                      <div
                        title={`${label} ${h}:00 — ${count} check-ins`}
                        className="h-5 w-5 rounded"
                        style={{ backgroundColor: count === 0 ? "rgba(100,116,139,0.12)" : `rgba(14,165,233,${0.25 + 0.75 * (count / maxHeat)})` }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Leaderboard */}
        <div className="card p-4">
          <p className="mb-3 font-semibold">🏆 Top volunteers by hours</p>
          {data.leaderboard.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No finalized hours yet.</p>
          ) : (
            <ol className="space-y-2">
              {data.leaderboard.map((l, i) => (
                <li key={l.member?.id ?? i} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-right font-bold text-slate-400">{i + 1}</span>
                  {l.member?.profilePhotoUrl ? (
                    <Image src={l.member.profilePhotoUrl} alt="" width={28} height={28} className="rounded-full" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-navy-100 dark:bg-navy-800" />
                  )}
                  <span className="flex-1 font-medium">{l.member?.name ?? "Unknown"}</span>
                  <span className="text-slate-500">{l.member?.department}</span>
                  <span className="font-semibold tabular-nums">{formatDuration(l.minutes)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Department health */}
        <div className="card p-4">
          <p className="mb-3 font-semibold">Department health score</p>
          <p className="mb-3 text-xs text-slate-400">% of active members who attended at least one session in the period</p>
          <div className="space-y-3">
            {data.health.map((h) => (
              <div key={h.department}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">{h.department}</span>
                  <span className="tabular-nums text-slate-500">{h.attended}/{h.members} · {h.score}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-navy-800">
                  <div
                    className={cn("h-2 rounded-full", h.score >= 70 ? "bg-emerald-500" : h.score >= 40 ? "bg-amber-500" : "bg-rose-500")}
                    style={{ width: `${h.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
