"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { Bell, Check, Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";

type NotificationRow = {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  metadata?: string | null;
  createdAt: string;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [submittingRejectId, setSubmittingRejectId] = useState<string | null>(null);
  const { mutate: globalMutate } = useSWRConfig();

  const { data, mutate } = useSWR<{ notifications: NotificationRow[]; unread: number }>(
    "/api/notifications",
    {
      refreshInterval: 45000,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    },
  );
  const unread = data?.unread ?? 0;

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
    void mutate();
  }

  async function approveSignout(requestId: string) {
    setApprovingId(requestId);
    try {
      const res = await fetch(`/api/approvals/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.error === "This request has already been reviewed") {
          toast("info", "This sign-out has already been reviewed.");
          setApprovedIds((prev) => new Set(prev).add(requestId));
        } else {
          throw new Error(body.error ?? "Failed to approve");
        }
      } else {
        toast("success", "Sign-out approved ✅");
        setApprovedIds((prev) => new Set(prev).add(requestId));
      }
      void mutate();
      void globalMutate((key) => typeof key === "string" && (key.startsWith("/api/approvals") || key.startsWith("/api/dashboard")));
    } catch (err: any) {
      toast("error", err.message || "Failed to approve sign-out");
    } finally {
      setApprovingId(null);
    }
  }

  async function rejectSignout(requestId: string) {
    setSubmittingRejectId(requestId);
    const reason = rejectReason[requestId]?.trim() || undefined;
    try {
      const res = await fetch(`/api/approvals/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "reject", reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.error === "This request has already been reviewed") {
          toast("info", "This sign-out has already been reviewed.");
          setRejectedIds((prev) => new Set(prev).add(requestId));
        } else {
          throw new Error(body.error ?? "Failed to reject");
        }
      } else {
        toast("success", "Sign-out rejected ❌");
        setRejectedIds((prev) => new Set(prev).add(requestId));
      }
      setRejectingId(null);
      void mutate();
      void globalMutate((key) => typeof key === "string" && (key.startsWith("/api/approvals") || key.startsWith("/api/dashboard")));
    } catch (err: any) {
      toast("error", err.message || "Failed to reject sign-out");
    } finally {
      setSubmittingRejectId(null);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open && unread > 0) void markAllRead();
        }}
        className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 z-50 mt-2 max-h-[28rem] w-84 sm:w-96 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-navy-700 dark:bg-navy-900"
            role="menu"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-navy-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Notifications
              </span>
              <Link
                href="/dashboard/approvals"
                onClick={() => setOpen(false)}
                className="text-xs font-medium text-electric-600 hover:underline dark:text-electric-400"
              >
                Approvals Board →
              </Link>
            </div>

            {!data?.notifications.length ? (
              <p className="px-3 py-8 text-center text-sm text-slate-500">No notifications yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-navy-800/60">
                {data.notifications.map((n) => {
                  let requestId: string | null = null;
                  if (n.metadata && (n.type === "SIGNOUT_REQUEST" || n.type === "SIGNOUT_ESCALATED")) {
                    try {
                      const meta = typeof n.metadata === "string" ? JSON.parse(n.metadata) : n.metadata;
                      requestId = meta?.signoutRequestId || null;
                    } catch {
                      // ignore parse error
                    }
                  }

                  const isApproved = requestId ? approvedIds.has(requestId) : false;
                  const isRejected = requestId ? rejectedIds.has(requestId) : false;
                  const isPromptingReject = requestId ? rejectingId === requestId : false;

                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "rounded-xl px-3 py-2.5 text-sm transition-colors",
                        !n.isRead ? "bg-electric-500/5 font-medium" : "hover:bg-slate-50 dark:hover:bg-navy-800/40",
                      )}
                    >
                      <p className="text-slate-800 dark:text-slate-100 text-xs sm:text-sm leading-snug">{n.message}</p>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-400">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </span>

                        {requestId && (
                          <div className="flex items-center gap-1.5">
                            {isApproved ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                <Check className="h-3 w-3" /> Approved
                              </span>
                            ) : isRejected ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md border border-rose-500/20">
                                <X className="h-3 w-3" /> Rejected
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void approveSignout(requestId!);
                                  }}
                                  disabled={approvingId === requestId || submittingRejectId === requestId}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 text-xs font-semibold shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                                >
                                  {approvingId === requestId ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Check className="h-3 w-3" />
                                  )}
                                  Approve
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRejectingId(isPromptingReject ? null : requestId);
                                  }}
                                  disabled={approvingId === requestId || submittingRejectId === requestId}
                                  className="inline-flex items-center gap-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900 px-2 py-1 text-xs font-semibold shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                                >
                                  <X className="h-3 w-3" />
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Inline Reject Form */}
                      {requestId && isPromptingReject && !isApproved && !isRejected && (
                        <div
                          className="mt-2.5 flex flex-col gap-1.5 rounded-xl border border-rose-200 bg-rose-50/70 p-2.5 dark:border-rose-900/60 dark:bg-rose-950/30"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            placeholder="Rejection reason (optional)..."
                            value={rejectReason[requestId] || ""}
                            onChange={(e) =>
                              setRejectReason((prev) => ({ ...prev, [requestId!]: e.target.value }))
                            }
                            className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-100"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setRejectingId(null)}
                              className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => void rejectSignout(requestId!)}
                              disabled={submittingRejectId === requestId}
                              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white px-2.5 py-1 text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                            >
                              {submittingRejectId === requestId ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                              Confirm Reject
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
