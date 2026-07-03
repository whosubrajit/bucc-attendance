"use client";

import { useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import { formatDistanceStrict, format } from "date-fns";
import { CheckCheck, Check, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toaster";
import { useRealtime } from "@/hooks/use-realtime";

type PendingRequest = {
  id: string;
  requestedAt: string;
  isEscalated: boolean;
  checkInAt: string;
  sessionName: string;
  member: { id: string; name: string; department: string; designation: string; profilePhotoUrl: string | null };
};

export function ApprovalsPanel() {
  const { data, isLoading, mutate } = useSWR<{ requests: PendingRequest[] }>("/api/approvals", {
    refreshInterval: 20000,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  useRealtime();

  async function review(id: string, decision: "approve" | "reject", rejectionReason?: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason: rejectionReason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed");
      toast("success", decision === "approve" ? "Sign-out approved ✅" : "Request rejected");
      setRejecting(null);
      setReason("");
      void mutate();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  if (isLoading && !data) {
    return <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;
  }

  const requests = data?.requests ?? [];
  if (requests.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={CheckCheck} title="All caught up!" hint="No pending sign-out requests right now." />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => {
        const duration = formatDistanceStrict(new Date(r.requestedAt), new Date(r.checkInAt));
        return (
          <div key={r.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {r.member.profilePhotoUrl ? (
                  <Image src={r.member.profilePhotoUrl} alt="" width={40} height={40} className="rounded-full" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-100 font-semibold text-navy-700 dark:bg-navy-800 dark:text-electric-400">
                    {r.member.name[0]}
                  </div>
                )}
                <div>
                  <p className="font-semibold">
                    {r.member.name}{" "}
                    {r.isEscalated && (
                      <Badge tone="red" className="ml-1"><AlertTriangle className="h-3 w-3" aria-hidden /> Escalated</Badge>
                    )}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {r.member.department} · {r.member.designation} · {r.sessionName}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    In {format(new Date(r.checkInAt), "h:mm a")} → out requested {format(new Date(r.requestedAt), "h:mm a")} · volunteered {duration}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="success" size="sm" loading={busy === r.id} onClick={() => review(r.id, "approve")}>
                  <Check className="h-4 w-4" aria-hidden /> Approve
                </Button>
                <Button
                  variant="danger" size="sm" disabled={busy === r.id}
                  onClick={() => setRejecting(rejecting === r.id ? null : r.id)}
                >
                  <X className="h-4 w-4" aria-hidden /> Reject
                </Button>
              </div>
            </div>
            {rejecting === r.id && (
              <div className="mt-3 flex gap-2">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (optional)"
                  aria-label="Rejection reason"
                  className="h-10 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900"
                />
                <Button variant="danger" size="sm" loading={busy === r.id} onClick={() => review(r.id, "reject", reason)}>
                  Confirm rejection
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
