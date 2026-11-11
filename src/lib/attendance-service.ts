/**
 * Attendance domain logic — shared by the QR scan, manual check-in,
 * sign-out, approval and cron-escalation routes so every entry point
 * enforces identical rules.
 */
import { Member, Prisma } from "@prisma/client";
import { AttendanceStatus, CheckMethod, Role, SignoutAction } from "@/lib/enums";
import { differenceInMinutes } from "date-fns";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { notifyMembers } from "@/lib/notify";
import { ApiError } from "@/lib/api-guards";
import {
  canApproveFor,
  DEPARTMENT_SCOPED_ROLES,
  SIGNOUT_AUTO_APPROVE_ROLES,
  SIGNOUT_ESCALATION_ROLES,
  SIGNOUT_NOTIFY_ROLES,
} from "@/lib/rbac";

const ESCALATE_AFTER_MINUTES = 30; // no approver response → escalate to GB + HR_SE
const AUTO_APPROVE_AFTER_MINUTES = 120; // still nothing → auto-approve, flag for review

// ── Check-in ──────────────────────────────────────────────────────────

export async function checkIn(
  member: Member,
  sessionId: string,
  method: CheckMethod,
  audit: { ip: string; deviceType: string },
) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || !session.isActive) throw new ApiError(404, "Session not found or inactive");

  const now = new Date();
  if (now < session.startsAt || now > session.endsAt) {
    throw new ApiError(409, "Attendance is only available while the session is in progress");
  }

  // Conflict detection: already present in ANY active session?
  const conflict = await prisma.attendance.findFirst({
    where: {
      memberId: member.id,
      status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.PENDING_SIGNOUT] },
      session: { isActive: true, endsAt: { gt: now } },
    },
    include: { session: { select: { name: true } } },
  });
  if (conflict) {
    if (conflict.sessionId === sessionId) {
      throw new ApiError(409, "ALREADY_CHECKED_IN");
    } else {
      throw new ApiError(409, `You are still checked in to "${conflict.session.name}". Sign out there first.`);
    }
  }

  try {
    const attendance = await prisma.attendance.create({
      data: {
        memberId: member.id,
        memberName: member.name,
        sessionId,
        method,
        checkInIp: audit.ip,
        deviceType: audit.deviceType,
      },
    });
    publish("dashboard", "check_in", {
      memberName: member.name,
      department: member.department,
      sessionId,
    });
    publish(`member:${member.id}`, "check_in", {
      sessionName: session.name,
    });
    return { attendance, session };
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new ApiError(409, "ALREADY_CHECKED_IN");
    }
    throw err;
  }
}

// ── Sign-out request ──────────────────────────────────────────────────

export async function requestSignout(member: Member, sessionId: string, notes?: string) {
  const attendance = await prisma.attendance.findFirst({
    where: { memberId: member.id, sessionId },
    orderBy: { checkInAt: "desc" },
    include: { session: { select: { name: true, requiresFeedback: true } } },
  });
  if (!attendance) throw new ApiError(404, "You have not checked in to this session");
  if (attendance.status === AttendanceStatus.PENDING_SIGNOUT) {
    throw new ApiError(409, "Your sign-out request is already awaiting approval");
  }
  if (attendance.status === AttendanceStatus.LEFT) {
    throw new ApiError(409, "You have already signed out of this session");
  }
  if (attendance.status === AttendanceStatus.LEFT_FORCED) {
    // A forced sign-out must never be convertible into a credited one: that
    // is the whole point of the status. Without this guard the member could
    // press "Sign out" afterwards and be credited now − checkInAt.
    throw new ApiError(
      409,
      "HR signed you out of this session because you left without signing out. This time cannot be claimed — contact an HR SE if it was a mistake.",
    );
  }
  // Fail closed. Only a PRESENT record may be signed out; any status added
  // later must be handled above rather than silently falling through to the
  // duration-crediting path below.
  if (attendance.status !== AttendanceStatus.PRESENT) {
    throw new ApiError(409, "This attendance record cannot be signed out");
  }

  // Validate feedback requirement for non-admin roles
  const needsFeedback = attendance.session.requiresFeedback && !["EB", "HR_EB", "HR_SE", "GB"].includes(member.role);
  if (needsFeedback && (!notes || !notes.trim())) {
    throw new ApiError(400, "Feedback is required to sign out of this session");
  }

  const now = new Date();
  
  // EB, HR SEs, HR EBs and GBs never need sign-out approval.
  //
  // Everyone else does — EXCEPT on a session with requiresFeedback, where
  // submitting the mandatory form is what replaces the HR review. Note that
  // `notes` alone is NOT sufficient: on a normal session a member may leave a
  // note and still goes into the HR approval queue.
  const isApprover = SIGNOUT_AUTO_APPROVE_ROLES.includes(member.role as Role);
  const submittedRequiredFeedback =
    attendance.session.requiresFeedback && Boolean(notes?.trim());
  const shouldAutoApprove = isApprover || submittedRequiredFeedback;
  
  if (shouldAutoApprove) {
    const duration = differenceInMinutes(now, attendance.checkInAt);
    const claimed = await prisma.attendance.updateMany({
      where: { id: attendance.id, status: AttendanceStatus.PRESENT },
      data: {
          status: AttendanceStatus.LEFT,
          checkOutRequestedAt: now,
          checkOutApprovedAt: now,
          durationMinutes: duration,
          notes: notes?.trim() || null,
        },
    });
    if (claimed.count !== 1) {
      throw new ApiError(409, "This attendance record has already been processed");
    }
    publish(`member:${member.id}`, "signout_approved");
    publish("dashboard", "dashboard_update");
    return null; // No request created
  }

  const request = await prisma.$transaction(async (tx) => {
    const claimed = await tx.attendance.updateMany({
      where: { id: attendance.id, status: AttendanceStatus.PRESENT },
      data: {
        status: AttendanceStatus.PENDING_SIGNOUT,
        checkOutRequestedAt: now,
        notes: notes?.trim() || null,
      },
    });
    if (claimed.count !== 1) {
      throw new ApiError(409, "This attendance record has already been processed");
    }
    return tx.signoutRequest.create({
      data: { attendanceId: attendance.id },
    });
  });

  // Notify HR_EB + HR_SE in realtime (including temp powers).
  const approvers = await prisma.member.findMany({
    where: {
      OR: [
        { role: { in: SIGNOUT_NOTIFY_ROLES } },
        { tempRole: { in: SIGNOUT_NOTIFY_ROLES }, tempRoleExpiresAt: { gt: new Date() } },
      ],
      isActive: true,
    },
    select: { id: true },
  });
  await notifyMembers({
    memberIds: approvers.map((a) => a.id),
    type: "SIGNOUT_REQUEST",
    message: `${member.name} (${member.department}) requested sign-out from "${attendance.session.name}"`,
    metadata: { signoutRequestId: request.id, attendanceId: attendance.id },
  });
  publish("approvers", "signout_requested", {
    memberName: member.name,
    department: member.department,
  });
  publish("dashboard", "dashboard_update");

  return request;
}

// ── Approve / reject ──────────────────────────────────────────────────

export async function reviewSignout(
  approver: Member,
  requestId: string,
  decision: "approve" | "reject",
  rejectionReason?: string,
) {
  const request = await prisma.signoutRequest.findUnique({
    where: { id: requestId },
    include: {
      attendance: { include: { member: true, session: { select: { name: true } } } },
    },
  });
  if (!request) throw new ApiError(404, "Sign-out request not found");
  if (request.action !== SignoutAction.PENDING) {
    throw new ApiError(409, "This request has already been reviewed");
  }

  const target = request.attendance.member;
  if (target.id === approver.id) throw new ApiError(403, "You cannot review your own sign-out request");
  if (!canApproveFor(approver, target)) {
    throw new ApiError(403, "You cannot approve requests outside your department");
  }

  const now = new Date();

  if (decision === "approve") {
    // Member's time is credited up until they clicked "Sign Out", not when we approve it.
    const effectiveOut = request.attendance.checkOutRequestedAt || request.requestedAt;
    const duration = differenceInMinutes(effectiveOut, request.attendance.checkInAt);
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.signoutRequest.updateMany({
        where: { id: requestId, action: SignoutAction.PENDING },
        data: { action: SignoutAction.APPROVED, reviewedById: approver.id, reviewedAt: now },
      });
      if (claimed.count !== 1) {
        throw new ApiError(409, "This request has already been reviewed");
      }
      const attendanceClaim = await tx.attendance.updateMany({
        where: { id: request.attendanceId, status: AttendanceStatus.PENDING_SIGNOUT },
        data: {
          status: AttendanceStatus.LEFT,
          checkOutRequestedAt: effectiveOut,
          checkOutApprovedAt: effectiveOut,
          approvedById: approver.id,
          durationMinutes: duration,
        },
      });
      if (attendanceClaim.count !== 1) {
        throw new ApiError(409, "This attendance record has already been processed");
      }
      await tx.auditLog.create({
        data: {
          actorId: approver.id,
          action: "SIGNOUT_APPROVED",
          targetType: "signout_request",
          targetId: requestId,
          metadata: JSON.stringify({ memberId: target.id, durationMinutes: duration }),
        },
      });
    });
    await notifyMembers({
      memberIds: [target.id],
      type: "SIGNOUT_APPROVED",
      message: `Your sign-out from "${request.attendance.session.name}" has been approved.`,
      email: {
        subject: "BUCC: Sign-out approved",
        html: `<p>Your sign-out from <b>${request.attendance.session.name}</b> was approved by ${approver.name}. Thanks for volunteering!</p>`,
      },
    });
    publish(`member:${target.id}`, "signout_approved");
  } else {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.signoutRequest.updateMany({
        where: { id: requestId, action: SignoutAction.PENDING },
        data: {
          action: SignoutAction.REJECTED,
          reviewedById: approver.id,
          reviewedAt: now,
          rejectionReason: rejectionReason?.slice(0, 500) || null,
        },
      });
      if (claimed.count !== 1) {
        throw new ApiError(409, "This request has already been reviewed");
      }
      // Member stays present and may re-submit later.
      const attendanceClaim = await tx.attendance.updateMany({
        where: { id: request.attendanceId, status: AttendanceStatus.PENDING_SIGNOUT },
        data: { status: AttendanceStatus.PRESENT, checkOutRequestedAt: null },
      });
      if (attendanceClaim.count !== 1) {
        throw new ApiError(409, "This attendance record has already been processed");
      }
      await tx.auditLog.create({
        data: {
          actorId: approver.id,
          action: "SIGNOUT_REJECTED",
          targetType: "signout_request",
          targetId: requestId,
          metadata: JSON.stringify({ memberId: target.id, reason: rejectionReason ?? null }),
        },
      });
    });
    await notifyMembers({
      memberIds: [target.id],
      type: "SIGNOUT_REJECTED",
      message: `Your sign-out request was rejected${rejectionReason ? `: ${rejectionReason}` : "."} You remain checked in and can re-submit.`,
      email: {
        subject: "BUCC: Sign-out rejected",
        html: `<p>Your sign-out from <b>${request.attendance.session.name}</b> was rejected${rejectionReason ? `: <i>${rejectionReason}</i>` : ""}.</p><p>You are still marked present and may submit a new request.</p>`,
      },
    });
    publish(`member:${target.id}`, "signout_rejected");
  }

  publish("dashboard", "dashboard_update");
  publish("approvers", "dashboard_update");
}

// ── Auto-timeout escalation (called by /api/cron/escalate) ────────────

export async function escalateStaleRequests(): Promise<{ escalated: number; autoApproved: number }> {
  const now = new Date();
  const escalateBefore = new Date(now.getTime() - ESCALATE_AFTER_MINUTES * 60 * 1000);
  const autoApproveBefore = new Date(now.getTime() - AUTO_APPROVE_AFTER_MINUTES * 60 * 1000);

  // Stage 1: >30 min pending, not yet escalated → notify GB + HR_SE.
  const toEscalate = await prisma.signoutRequest.findMany({
    where: { action: SignoutAction.PENDING, isEscalated: false, requestedAt: { lt: escalateBefore } },
    include: { attendance: { include: { member: true, session: { select: { name: true } } } } },
  });
  let escalated = 0;
  if (toEscalate.length > 0) {
    const escalationTargets = await prisma.member.findMany({
      where: { role: { in: SIGNOUT_ESCALATION_ROLES }, isActive: true },
      select: { id: true },
    });
    for (const req of toEscalate) {
      const claimed = await prisma.signoutRequest.updateMany({
        where: { id: req.id, action: SignoutAction.PENDING, isEscalated: false },
        data: { isEscalated: true },
      });
      if (claimed.count !== 1) continue;
      escalated++;
      await notifyMembers({
        memberIds: escalationTargets.map((m) => m.id),
        type: "SIGNOUT_ESCALATED",
        message: `ESCALATED: ${req.attendance.member.name}'s sign-out from "${req.attendance.session.name}" has waited 30+ minutes.`,
        metadata: { signoutRequestId: req.id },
        email: {
          subject: "BUCC: Escalated sign-out request",
          html: `<p><b>${req.attendance.member.name}</b>'s sign-out request from <b>${req.attendance.session.name}</b> has been pending for over 30 minutes with no response. Please review it.</p>`,
        },
      });
      publish("approvers", "signout_escalated", { memberName: req.attendance.member.name });
    }
  }

  // Stage 2: >2 h pending → auto-approve + flag for manual review.
  const toAutoApprove = await prisma.signoutRequest.findMany({
    where: { action: SignoutAction.PENDING, requestedAt: { lt: autoApproveBefore } },
    include: { attendance: { include: { member: true, session: { select: { name: true } } } } },
  });
  let autoApproved = 0;
  for (const req of toAutoApprove) {
    // Official sign-out time = when it was requested, not when the cron ran.
    const effectiveOut = req.requestedAt;
    const duration = differenceInMinutes(effectiveOut, req.attendance.checkInAt);
    let claimed = false;
    try {
      claimed = await prisma.$transaction(async (tx) => {
        const result = await tx.signoutRequest.updateMany({
          where: { id: req.id, action: SignoutAction.PENDING },
          data: { action: SignoutAction.AUTO_APPROVED, reviewedAt: now, needsReview: true },
        });
        if (result.count !== 1) return false;
        const attendanceClaim = await tx.attendance.updateMany({
          where: { id: req.attendanceId, status: AttendanceStatus.PENDING_SIGNOUT },
          data: {
            status: AttendanceStatus.LEFT,
            checkOutRequestedAt: effectiveOut,
            checkOutApprovedAt: effectiveOut,
            durationMinutes: duration,
          },
        });
        if (attendanceClaim.count !== 1) {
          throw new ApiError(409, "Attendance state changed during auto-approval");
        }
        await tx.auditLog.create({
          data: {
            actorId: null,
            action: "SIGNOUT_AUTO_APPROVED",
            targetType: "signout_request",
            targetId: req.id,
            metadata: JSON.stringify({ system: true, reason: "auto-approved after 2h timeout" }),
          },
        });
        return true;
      });
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 409) throw err;
    }
    if (!claimed) continue;
    autoApproved++;
    await notifyMembers({
      memberIds: [req.attendance.memberId],
      type: "SIGNOUT_APPROVED",
      message: `Your sign-out from "${req.attendance.session.name}" was auto-approved after 2 hours without review.`,
    });
    publish(`member:${req.attendance.memberId}`, "signout_approved");
  }
  if (autoApproved > 0) publish("dashboard", "dashboard_update");

  return { escalated, autoApproved };
}

/** Roles allowed to see a given pending request in their approvals panel. */
export function approvalScopeWhere(approver: Member) {
  if (DEPARTMENT_SCOPED_ROLES.includes(approver.role as Role)) {
    return { attendance: { memberId: { not: approver.id }, member: { department: approver.department } } };
  }
  return { attendance: { memberId: { not: approver.id } } }; // EB, HR_EB, HR_SE, GB see everything except their own
}
