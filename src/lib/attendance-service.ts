/**
 * Attendance domain logic — shared by the QR scan, manual check-in,
 * sign-out, approval and cron-escalation routes so every entry point
 * enforces identical rules.
 */
import { Member } from "@prisma/client";
import { AttendanceStatus, CheckMethod, Role, SignoutAction } from "@/lib/enums";
import { differenceInMinutes } from "date-fns";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { notifyMembers } from "@/lib/notify";
import { ApiError } from "@/lib/api-guards";
import { canApproveFor, SIGNOUT_ESCALATION_ROLES, SIGNOUT_NOTIFY_ROLES } from "@/lib/rbac";

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

  // Validate feedback requirement for non-admin roles
  const needsFeedback = attendance.session.requiresFeedback && !["EB", "HR_EB", "GB"].includes(member.role);
  if (needsFeedback && (!notes || !notes.trim())) {
    throw new ApiError(400, "Feedback is required to sign out of this session");
  }

  const now = new Date();
  
  // HR SEs, HR EBs, GBs, and members who provide feedback do not need sign-out approval.
  const shouldAutoApprove = ([Role.HR_SE, Role.HR_EB, Role.GB] as Role[]).includes(member.role as Role) || Boolean(notes?.trim());
  
  if (shouldAutoApprove) {
    const duration = differenceInMinutes(now, attendance.checkInAt);
    await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        status: AttendanceStatus.LEFT,
        checkOutRequestedAt: now,
        checkOutApprovedAt: now,
        durationMinutes: duration,
        notes: notes?.trim() || null,
      },
    });
    publish(`member:${member.id}`, "signout_approved");
    publish("dashboard", "dashboard_update");
    return null; // No request created
  }

  const [request] = await prisma.$transaction([
    prisma.signoutRequest.create({
      data: { attendanceId: attendance.id },
    }),
    prisma.attendance.update({
      where: { id: attendance.id },
      data: { 
        status: AttendanceStatus.PENDING_SIGNOUT, 
        checkOutRequestedAt: now,
        notes: notes?.trim() || null,
      },
    }),
  ]);

  // Notify HR_EB + HR_SE in realtime.
  const approvers = await prisma.member.findMany({
    where: { role: { in: SIGNOUT_NOTIFY_ROLES }, isActive: true },
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
    const duration = differenceInMinutes(now, request.attendance.checkInAt);
    await prisma.$transaction([
      prisma.signoutRequest.update({
        where: { id: requestId },
        data: { action: SignoutAction.APPROVED, reviewedById: approver.id, reviewedAt: now },
      }),
      prisma.attendance.update({
        where: { id: request.attendanceId },
        data: {
          status: AttendanceStatus.LEFT,
          checkOutApprovedAt: now,
          approvedById: approver.id,
          durationMinutes: duration,
        },
      }),
      prisma.auditLog.create({
        data: {
          actorId: approver.id,
          action: "SIGNOUT_APPROVED",
          targetType: "signout_request",
          targetId: requestId,
          metadata: JSON.stringify({ memberId: target.id, durationMinutes: duration }),
        },
      }),
    ]);
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
    await prisma.$transaction([
      prisma.signoutRequest.update({
        where: { id: requestId },
        data: {
          action: SignoutAction.REJECTED,
          reviewedById: approver.id,
          reviewedAt: now,
          rejectionReason: rejectionReason?.slice(0, 500) || null,
        },
      }),
      // Member stays present and may re-submit later.
      prisma.attendance.update({
        where: { id: request.attendanceId },
        data: { status: AttendanceStatus.PRESENT, checkOutRequestedAt: null },
      }),
      prisma.auditLog.create({
        data: {
          actorId: approver.id,
          action: "SIGNOUT_REJECTED",
          targetType: "signout_request",
          targetId: requestId,
          metadata: JSON.stringify({ memberId: target.id, reason: rejectionReason ?? null }),
        },
      }),
    ]);
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
  if (toEscalate.length > 0) {
    const escalationTargets = await prisma.member.findMany({
      where: { role: { in: SIGNOUT_ESCALATION_ROLES }, isActive: true },
      select: { id: true },
    });
    for (const req of toEscalate) {
      await prisma.signoutRequest.update({ where: { id: req.id }, data: { isEscalated: true } });
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
  for (const req of toAutoApprove) {
    // Official sign-out time = when it was requested, not when the cron ran.
    const effectiveOut = req.requestedAt;
    const duration = differenceInMinutes(effectiveOut, req.attendance.checkInAt);
    await prisma.$transaction([
      prisma.signoutRequest.update({
        where: { id: req.id },
        data: { action: SignoutAction.AUTO_APPROVED, reviewedAt: now, needsReview: true },
      }),
      prisma.attendance.update({
        where: { id: req.attendanceId },
        data: {
          status: AttendanceStatus.LEFT,
          checkOutApprovedAt: effectiveOut,
          durationMinutes: duration,
        },
      }),
      prisma.auditLog.create({
        data: {
          actorId: req.attendance.memberId,
          action: "SIGNOUT_AUTO_APPROVED",
          targetType: "signout_request",
          targetId: req.id,
          metadata: JSON.stringify({ system: true, reason: "auto-approved after 2h timeout" }),
        },
      }),
    ]);
    await notifyMembers({
      memberIds: [req.attendance.memberId],
      type: "SIGNOUT_APPROVED",
      message: `Your sign-out from "${req.attendance.session.name}" was auto-approved after 2 hours without review.`,
    });
    publish(`member:${req.attendance.memberId}`, "signout_approved");
  }
  if (toAutoApprove.length > 0) publish("dashboard", "dashboard_update");

  return { escalated: toEscalate.length, autoApproved: toAutoApprove.length };
}

/** Roles allowed to see a given pending request in their approvals panel. */
export function approvalScopeWhere(approver: Member) {
  if (approver.role === Role.EB || approver.role === Role.SE) {
    return { attendance: { memberId: { not: approver.id }, member: { department: approver.department } } };
  }
  return { attendance: { memberId: { not: approver.id } } }; // HR_EB, HR_SE, GB see everything except their own
}
