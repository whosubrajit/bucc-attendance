"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import confetti from "canvas-confetti";
import { format } from "date-fns";
import { Camera, UserCheck, LogOut as LogOutIcon, CalendarX, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { toast } from "@/components/ui/toaster";
import { useRealtime } from "@/hooks/use-realtime";
import { AttendanceStatus, TERMINAL_ATTENDANCE_STATUSES } from "@/lib/enums";
import { QRCodeSVG } from "qrcode.react";

const QrScanner = dynamic(() => import("@/components/qr-scanner"), { ssr: false });

type SessionRow = {
  id: string;
  name: string;
  venue: string | null;
  startsAt: string;
  endsAt: string;
  requiresFeedback: boolean;
  attendance: { status: string; checkInAt: string } | null;
};

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as { action?: string; message: string; scannerNotice?: string };
}

function celebrate() {
  void confetti({ particleCount: 120, spread: 75, origin: { y: 0.7 } });
}

/** LEFT or LEFT_FORCED — the member is no longer in the session. */
function isTerminalStatus(status: string): boolean {
  return (TERMINAL_ATTENDANCE_STATUSES as string[]).includes(status);
}


export function AttendClient({ member }: { member: any }) {
  const [showQr, setShowQr] = useState(false);
  const [scanningSession, setScanningSession] = useState<string | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [signingOutSession, setSigningOutSession] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, mutate } = useSWR<{ sessions: SessionRow[] }>("/api/attendance/current", {
    refreshInterval: 30000,
    revalidateOnFocus: true,
    dedupingInterval: 5000,
  });
  const { data: qrData } = useSWR<{ token: string; refreshSeconds: number }>(
    showQr ? "/api/attendance/qr" : null,
    {
      refreshInterval: 50000,
      dedupingInterval: 10000,
    }
  );
  useRealtime((event) => {
    if (event.channel === `member:${member.id}` && event.type === "check_in") {
      celebrate();
    }
  });

  // UI hints only — every one of these is re-checked server-side.
  const isScanner = ["EB", "HR_SE", "HR_EB", "GB"].includes(member.role);
  const needsQr = !["EB", "HR_SE", "HR_EB", "GB"].includes(member.role);
  const canManageSessions = ["EB", "HR_SE", "HR_EB", "GB"].includes(member.role);

  /**
   * Tail of the scan-submission chain. The decode callback fires up to 10x a
   * second, so two members' codes can be read a few hundred milliseconds apart
   * — a queue crowding the lens, or one sweep across a group holding up
   * phones. Both would otherwise POST concurrently, and every scan request
   * also checks the SCANNER in; checkIn() detects an existing row by reading
   * before it writes, so two overlapping requests can interleave past that
   * check and leave the scanner with duplicate attendance rows.
   *
   * Queued rather than dropped, deliberately: a discarded decode is a member
   * who never got marked present, and silently losing attendance is the one
   * outcome this portal cannot have.
   */
  const submitQueue = useRef<Promise<void>>(Promise.resolve());

  const submitToken = useCallback(
    (token: string) => {
      if (!scanningSession) return;
      const run = async () => {
        setBusy("scan");
        try {
          const raw = token.includes("token=") ? new URL(token).searchParams.get("token") ?? token : token;
          const result = await post("/api/attendance/scan", {
            token: raw,
            sessionId: scanningSession,
          });
          if (result.action === "checked_in") {
            toast("success", result.message);
          } else {
            toast("info", result.message);
          }
          // The member was marked, but the scanner's own attendance was not.
          if (result.scannerNotice) toast("error", `Your own attendance was not marked: ${result.scannerNotice}`);
          void mutate();
        } catch (err) {
          toast("error", err instanceof Error ? err.message : "Scan failed");
        } finally {
          setBusy(null);
        }
      };
      // Same handler on both branches so one bad link can never stall the
      // queue and strand every later scan.
      submitQueue.current = submitQueue.current.then(run, run);
    },
    [mutate, scanningSession],
  );

  async function manualCheckIn(sessionId: string) {
    setBusy(sessionId);
    try {
      const result = await post("/api/attendance/manual", { sessionId });
      toast("success", result.message);
      void mutate();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setBusy(null);
    }
  }

  async function signOut(sessionId: string, notes?: string) {
    setBusy(sessionId);
    try {
      const result = await post("/api/attendance/signout", { sessionId, notes });
      toast("info", result.message);
      setSigningOutSession(null);
      setFeedback("");
      void mutate();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Sign-out failed");
    } finally {
      setBusy(null);
    }
  }
  
  async function createEvent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("create-event");
    const fd = new FormData(e.currentTarget);
    try {
      await post("/api/sessions", {
        name: fd.get("name"),
        venue: fd.get("venue") || undefined,
        startsAt: new Date(fd.get("startsAt") as string).toISOString(),
        endsAt: new Date(fd.get("endsAt") as string).toISOString(),
        recurrence: fd.get("recurrence"),
        requiresFeedback: fd.get("requiresFeedback") === "on",
      });
      toast("success", "Event created!");
      setShowEventForm(false);
      void mutate();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) {
    return (
      <div className="mt-6 space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const sessions = data?.sessions ?? [];

  return (
    <div className="mt-6 space-y-4">
      {needsQr && (
        <div className="card p-4">
          {showQr ? (
            <div className="flex flex-col items-center gap-4">
              {qrData ? (
                <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:ring-navy-700">
                  <QRCodeSVG value={qrData.token} size={240} className="text-black" />
                </div>
              ) : (
                <Skeleton className="h-[240px] w-[240px] rounded-2xl" />
              )}
              <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                Show this code to the HR scanner. It updates automatically.
              </p>
              <Button variant="secondary" className="w-full" onClick={() => setShowQr(false)}>
                Hide QR
              </Button>
            </div>
          ) : (
            <Button size="lg" className="w-full" onClick={() => setShowQr(true)}>
              <QrCode className="h-5 w-5" aria-hidden /> Show My QR
            </Button>
          )}
        </div>
      )}

      {/* Active sessions */}
      <div className="flex items-center justify-between pt-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Open sessions</h2>
        {canManageSessions && (
          <Button variant="secondary" size="sm" onClick={() => setShowEventForm(!showEventForm)}>
            {showEventForm ? "Cancel" : "+ Add Event"}
          </Button>
        )}
      </div>
      
      {showEventForm && (
    <form onSubmit={createEvent} className="card grid gap-3 p-4 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            Event Name
            <input name="name" required minLength={3} className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 mt-1" placeholder="e.g. Workshop" />
          </label>
          <label className="text-sm">
            Venue
            <input name="venue" className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 mt-1" />
          </label>
          <label className="text-sm">
            Recurrence
            <select name="recurrence" defaultValue="NONE" className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 mt-1">
              <option value="NONE">One-off</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </label>
          <label className="text-sm">
            Starts
            <input name="startsAt" required type="datetime-local" className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 mt-1" />
          </label>
          <label className="text-sm">
            Ends
            <input name="endsAt" required type="datetime-local" className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 mt-1" />
          </label>
          <label className="text-sm flex items-center gap-2 sm:col-span-2 mt-2">
            <input type="checkbox" name="requiresFeedback" />
            Need Feedback/Queries?
          </label>
          <Button type="submit" loading={busy === "create-event"} className="sm:col-span-2 mt-2">Create Event</Button>
        </form>
      )}
      {sessions.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={CalendarX}
            title="No sessions are open right now"
            hint="Sessions appear here 30 minutes before they start. Check with your department for the schedule."
          />
        </div>
      ) : (
        sessions.map((s) => (
          <div key={s.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {format(new Date(s.startsAt), "h:mm a")} – {format(new Date(s.endsAt), "h:mm a")}
                  {s.venue ? ` · ${s.venue}` : ""}
                </p>
              </div>
              {s.attendance && <StatusBadge status={s.attendance.status} />}
            </div>
            
            {scanningSession === s.id && (
              <div className="mt-4 border-t pt-4 border-slate-100 dark:border-navy-800">
                <QrScanner onScan={submitToken} onError={(m) => toast("error", m)} />
                <Button variant="secondary" className="mt-3 w-full" onClick={() => setScanningSession(null)}>
                  Close Scanner
                </Button>
              </div>
            )}

            <div className="mt-3 space-y-2">
              {/* Self-attendance roles may (re)mark themselves whenever they
                  are not currently in the session — including after a forced
                  sign-out, which previously left them with no way back in.
                  Members keep needing a scan unless they signed out normally. */}
              {(!needsQr && (!s.attendance || isTerminalStatus(s.attendance.status))) ||
              s.attendance?.status === "LEFT" ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  loading={busy === s.id}
                  onClick={() => manualCheckIn(s.id)}
                >
                  <UserCheck className="h-4 w-4" aria-hidden />{" "}
                  {s.attendance && isTerminalStatus(s.attendance.status) ? "I'm Back!" : "Confirm My Attendance"}
                </Button>
              ) : null}
              
              {isScanner && scanningSession !== s.id && (
                <Button
                  className="w-full"
                  onClick={() => setScanningSession(s.id)}
                >
                  <Camera className="h-4 w-4" aria-hidden /> Scan Members
                </Button>
              )}

              {s.attendance?.status === "PRESENT" && (
                signingOutSession === s.id ? (
                  <div className="space-y-2 border-t pt-3 mt-3 border-slate-100 dark:border-navy-800">
                    <label className="text-sm font-semibold">Feedback / Queries</label>
                    <textarea
                      required
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 p-3 text-sm dark:border-navy-700 dark:bg-navy-900"
                      rows={3}
                      placeholder='Please avoid writing "N/A", "OK", "No" or anything of this sort. Write any criticism, or ask any queries you might have.'
                    />
                    <div className="flex gap-2">
                      <Button variant="secondary" className="flex-1" onClick={() => { setSigningOutSession(null); setFeedback(""); }}>Cancel</Button>
                      <Button 
                        variant="danger" 
                        className="flex-1" 
                        disabled={!feedback.trim()} 
                        loading={busy === s.id} 
                        onClick={() => signOut(s.id, feedback)}
                      >
                        Submit Sign Out
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="danger"
                    className="w-full"
                    loading={busy === s.id}
                    onClick={() => {
                      if (s.requiresFeedback && !["EB", "HR_EB", "HR_SE", "GB"].includes(member.role)) {
                        setSigningOutSession(s.id);
                      } else {
                        signOut(s.id);
                      }
                    }}
                  >
                    <LogOutIcon className="h-4 w-4" aria-hidden /> Sign Out from Volunteering
                  </Button>
                )
              )}
              
              {s.attendance?.status === AttendanceStatus.PENDING_SIGNOUT && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  Sign-out request submitted. Awaiting approval.
                </p>
              )}

              {s.attendance?.status === AttendanceStatus.LEFT && (
                <p className="rounded-lg bg-slate-100 px-3 py-2 text-center text-sm text-slate-500 dark:bg-navy-800 dark:text-slate-400">
                  Signed out — thanks for volunteering! 🎉
                </p>
              )}

              {s.attendance?.status === AttendanceStatus.LEFT_FORCED && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-center text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                  HR signed you out because you left without signing out — this time was not counted. Contact an HR SE
                  if that was a mistake.
                </p>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
