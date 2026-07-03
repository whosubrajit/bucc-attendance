/**
 * Role-Based Access Control — the single source of truth for permissions.
 *
 * IMPORTANT: every permission check happens SERVER-SIDE against the role
 * loaded fresh from the database (see requireMember in api-guards.ts).
 * The role embedded in the JWT is only used for UI hints.
 */
import { Role } from "@/lib/enums";

export const ROLE_LABELS: Record<Role, string> = {
  MEMBER: "Member",
  EB: "Executive Body",
  SE: "Senior Executive",
  HR_EB: "HR Executive Body",
  HR_SE: "HR Senior Executive",
  GB: "Governing Body",
};

export type Permission =
  | "attendance:self" // sign in / out, view own history
  | "attendance:scan" // can scan other members' QRs (HR, GB, EB)
  | "live:department" // live board of own department
  | "live:all" // live board across all departments
  | "signout:approve" // approve/reject sign-out requests
  | "reports:export" // export attendance CSV
  | "members:manage" // activate/deactivate members, central sync
  | "sessions:manage" // create sessions, generate QR codes
  | "announcements:manage"; // post dashboard banners

/** Access matrix straight from the spec. */
const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  MEMBER: new Set<Permission>(["attendance:self"]),
  EB: new Set<Permission>(["attendance:self", "attendance:scan", "live:department", "signout:approve", "reports:export"]),
  SE: new Set<Permission>(["attendance:self", "live:department", "reports:export"]),
  HR_EB: new Set<Permission>(["attendance:self", "attendance:scan", "live:department", "live:all", "signout:approve", "reports:export", "sessions:manage"]),
  HR_SE: new Set<Permission>(["attendance:self", "attendance:scan", "live:department", "live:all", "signout:approve", "reports:export", "sessions:manage"]),
  GB: new Set<Permission>([
    "attendance:self",
    "attendance:scan",
    "live:department",
    "live:all",
    "signout:approve",
    "reports:export",
    "members:manage",
    "sessions:manage",
    "announcements:manage",
  ]),
};

export function can(actorRole: string, permission: Permission): boolean {
  return MATRIX[actorRole as Role].has(permission);
}

/** Roles notified immediately when a sign-out request is created. */
export const SIGNOUT_NOTIFY_ROLES: Role[] = [Role.HR_EB, Role.HR_SE];

/** Roles the request escalates to after 30 minutes with no response. */
export const SIGNOUT_ESCALATION_ROLES: Role[] = [Role.GB, Role.HR_SE];

/**
 * Department scoping for approvals: EB/SE may only act on their own
 * department; HR_* and GB act club-wide.
 */
export function canApproveFor(
  approver: { role: string; department: string },
  target: { department: string },
): boolean {
  if (!can(approver.role, "signout:approve")) return false;
  if (approver.role === Role.EB || approver.role === Role.SE) {
    return approver.department === target.department;
  }
  return true; // HR_EB, HR_SE, GB
}

/**
 * Which departments a role may view on live boards / exports.
 * Returns null for "all departments", a department name for a scoped
 * view, or throws-equivalent undefined handling upstream for members.
 */
export function visibleDepartment(member: { role: string; department: string }): string | null {
  if (can(member.role, "live:all")) return null;
  if (can(member.role, "live:department")) return member.department;
  // Members have no live-board access at all — callers must check
  // can(role, "live:department") before using this.
  return member.department;
}
