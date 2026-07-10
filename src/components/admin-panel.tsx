"use client";

import { useState } from "react";
import useSWR from "swr";
import { format, differenceInHours } from "date-fns";
import { CalendarPlus, QrCode, RefreshCw, Megaphone, Users } from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "sessions", label: "Sessions & QR", icon: QrCode },
  { id: "members", label: "Members", icon: Users },
  { id: "announcements", label: "Announcements", icon: Megaphone },
] as const;

const inputCls =
  "h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900";

async function json(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function AdminPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("sessions");
  return (
    <div>
      <div className="mb-4 flex gap-2 overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium",
              tab === t.id ? "bg-navy-800 text-white dark:bg-electric-600" : "bg-slate-100 text-slate-600 dark:bg-navy-800 dark:text-slate-300",
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden /> {t.label}
          </button>
        ))}
      </div>
      {tab === "sessions" && <SessionsTab />}
      {tab === "members" && <MembersTab />}
      {tab === "announcements" && <AnnouncementsTab />}
    </div>
  );
}

// ── Sessions & QR ─────────────────────────────────────────────────────

type SessionRow = {
  id: string; name: string; venue: string | null; startsAt: string; endsAt: string;
  isActive: boolean; recurrence: string; _count: { attendance: number };
};

function SessionsTab() {
  const { data, mutate } = useSWR<{ sessions: SessionRow[] }>("/api/sessions");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", venue: "", startsAt: "", endsAt: "", recurrence: "NONE", requiresFeedback: false });
  const [saving, setSaving] = useState(false);

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await json("/api/sessions", "POST", {
        name: form.name,
        venue: form.venue || undefined,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        recurrence: form.recurrence,
        requiresFeedback: form.requiresFeedback,
      });
      toast("success", "Session created");
      setShowForm(false);
      setForm({ name: "", venue: "", startsAt: "", endsAt: "", recurrence: "NONE", requiresFeedback: false });
      void mutate();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSession(id: string, name: string) {
    if (!confirm(`Are you sure you want to completely delete "${name}"? This will erase all attendance records for this session.`)) return;
    try {
      await json(`/api/sessions?id=${id}`, "DELETE");
      toast("success", "Session deleted");
      void mutate();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to delete session");
    }
  }

  return (
    <div className="space-y-4">
      <Button onClick={() => setShowForm((s) => !s)}>
        <CalendarPlus className="h-4 w-4" aria-hidden /> New session
      </Button>

      {showForm && (
        <form onSubmit={createSession} className="card grid gap-3 p-4 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            Name
            <input required minLength={3} className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="text-sm">
            Venue
            <input className={inputCls} value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
          </label>
          <label className="text-sm">
            Recurrence
            <select className={inputCls} value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
              <option value="NONE">One-off</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </label>
          <label className="text-sm">
            Starts
            <input required type="datetime-local" className={inputCls} value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          </label>
          <label className="text-sm">
            Ends
            <input required type="datetime-local" className={inputCls} value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </label>
          <label className="text-sm flex items-center gap-2 sm:col-span-2 mt-2">
            <input type="checkbox" checked={form.requiresFeedback} onChange={(e) => setForm({ ...form, requiresFeedback: e.target.checked })} />
            Need Feedback/Queries?
          </label>
          <Button type="submit" loading={saving} className="sm:col-span-2">Create session</Button>
        </form>
      )}

      <div className="card divide-y divide-slate-100 dark:divide-navy-800/60">
        {(data?.sessions ?? []).map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div>
              <p className="font-medium">
                {s.name} {s.recurrence !== "NONE" && <Badge tone="blue">{s.recurrence.toLowerCase()}</Badge>}
              </p>
              <p className="text-sm text-slate-500">
                {format(new Date(s.startsAt), "d MMM, h:mm a")} – {format(new Date(s.endsAt), "h:mm a")}
                {s.venue ? ` · ${s.venue}` : ""} · {s._count.attendance} attendee{s._count.attendance === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <a href={`/api/export?sessionId=${s.id}`} className="text-sm font-medium text-electric-600 hover:underline">Export CSV</a>
              <Button variant="danger" size="sm" onClick={() => deleteSession(s.id, s.name)}>Delete</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Members ───────────────────────────────────────────────────────────

type MemberRow = {
  id: string; name: string; email: string; studentId: string; department: string;
  designation: string; role: string; isActive: boolean;
  tempRole: string | null; tempRoleExpiresAt: string | null;
};

function MembersTab() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "GB";
  const isHR = ["GB", "HR_EB", "HR_SE"].includes(session?.user?.role || "");

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, mutate } = useSWR<{ members: MemberRow[]; total: number; pageSize: number }>(
    `/api/admin/members?q=${encodeURIComponent(q)}&page=${page}`,
  );
  const [syncing, setSyncing] = useState(false);

  async function sync() {
    setSyncing(true);
    try {
      const result = await json("/api/admin/sync", "POST");
      toast("success", `Synced: ${result.pulled} pulled from central DB, ${result.refreshed} profiles refreshed`);
      void mutate();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function toggle(m: MemberRow) {
    try {
      await json("/api/admin/members", "PATCH", { memberId: m.id, isActive: !m.isActive });
      toast("success", `${m.name} ${m.isActive ? "deactivated" : "activated"}`);
      void mutate();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    }
  }

  async function toggleTempPower(m: MemberRow, grant: boolean) {
    try {
      await json("/api/admin/temp-role", "POST", { memberId: m.id, grant });
      toast("success", grant ? `Granted temp HR admin to ${m.name}` : `Revoked temp power for ${m.name}`);
      void mutate();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Search name, email or student ID…"
          aria-label="Search members"
          className={cn(inputCls, "flex-1")}
        />
        <Button variant="secondary" loading={syncing} onClick={sync}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Sync central DB
        </Button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-navy-800">
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Student ID</th>
              <th className="px-4 py-2">Department</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {(data?.members ?? []).map((m) => (
              <tr key={m.id} className="border-b border-slate-100 last:border-0 dark:border-navy-800/50">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-slate-400">{m.email}</p>
                </td>
                <td className="px-4 py-2.5">{m.studentId}</td>
                <td className="px-4 py-2.5">{m.department} · {m.designation}</td>
                <td className="px-4 py-2.5"><Badge tone="blue">{m.role}</Badge></td>
                <td className="px-4 py-2.5">
                  <Badge tone={m.isActive ? "green" : "gray"}>{m.isActive ? "Active" : "Inactive"}</Badge>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-2">
                    {isAdmin && (
                      <Button variant={m.isActive ? "danger" : "success"} size="sm" onClick={() => toggle(m)}>
                        {m.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    )}
                    {isHR && m.department.toLowerCase() === "human resources" && m.role === "MEMBER" && (
                      m.tempRole && m.tempRoleExpiresAt && new Date(m.tempRoleExpiresAt) > new Date() ? (
                        <Button variant="danger" size="sm" onClick={() => toggleTempPower(m, false)}>
                          Revoke Temp Power ({differenceInHours(new Date(m.tempRoleExpiresAt), new Date())}h left)
                        </Button>
                      ) : (
                        <Button variant="secondary" size="sm" onClick={() => toggleTempPower(m, true)}>
                          Grant Temp Power
                        </Button>
                      )
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex justify-end gap-2 px-4 py-3">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Announcements ─────────────────────────────────────────────────────

type AnnouncementRow = { id: string; message: string; createdAt: string; createdBy: { name: string } };

function AnnouncementsTab() {
  const { data, mutate } = useSWR<{ announcements: AnnouncementRow[] }>("/api/announcements");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await json("/api/announcements", "POST", { message });
      toast("success", "Announcement posted");
      setMessage("");
      void mutate();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function retire(id: string) {
    await json(`/api/announcements?id=${id}`, "DELETE");
    void mutate();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={post} className="flex gap-2">
        <input
          required minLength={3} maxLength={300}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Session-day announcement for all dashboards…"
          aria-label="Announcement message"
          className={cn(inputCls, "flex-1")}
        />
        <Button type="submit" loading={saving}>Post</Button>
      </form>
      <div className="card divide-y divide-slate-100 dark:divide-navy-800/60">
        {!data?.announcements.length ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No active announcements.</p>
        ) : (
          data.announcements.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p>{a.message}</p>
                <p className="text-xs text-slate-400">{a.createdBy.name} · {format(new Date(a.createdAt), "d MMM, h:mm a")}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => retire(a.id)}>Retire</Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
