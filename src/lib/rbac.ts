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
  EB: "Director, Assistant Directors",
  SE: "Senior Executive",
  HR_EB: "Director, Assistant Directors of HR",
  HR_SE: "HR Senior Executive",
  CREATIVE_SE: "Creative Senior Executive",
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
  // EB, HR_EB and GB: Directors run events, announcements and
  // sign-out approvals club-wide. GB and HR_EB both have full administrative
  // powers including members:manage.
  EB: new Set<Permission>([
    "attendance:self",
    "attendance:scan",
    "live:department",
    "live:all",
    "signout:approve",
    "reports:export",
    "sessions:manage",
    "announcements:manage",
  ]),
  SE: new Set<Permission>(["attendance:self", "live:department", "signout:approve", "reports:export"]),
  HR_EB: new Set<Permission>([
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
  HR_SE: new Set<Permission>(["attendance:self", "attendance:scan", "live:department", "live:all", "signout:approve", "reports:export", "sessions:manage"]),
  CREATIVE_SE: new Set<Permission>(["attendance:self", "attendance:scan", "live:department", "live:all", "signout:approve"]),
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
  // Fail closed. `role` is a free-text DB column (and tempRole is applied on
  // top of it), so an unmapped value must deny rather than throw.
  return MATRIX[actorRole as Role]?.has(permission) ?? false;
}

/**
 * Roles that mark their own attendance instead of having their QR scanned by
 * someone else. Prefer this over inline role arrays.
 */
export const SELF_ATTENDANCE_ROLES: Role[] = [Role.EB, Role.HR_EB, Role.HR_SE, Role.CREATIVE_SE, Role.GB];

/** Roles whose own sign-out never needs another person's approval. */
export const SIGNOUT_AUTO_APPROVE_ROLES: Role[] = [Role.EB, Role.HR_EB, Role.HR_SE, Role.CREATIVE_SE, Role.GB];

/** Roles whose approval authority is limited to their own department. */
export const DEPARTMENT_SCOPED_ROLES: Role[] = [Role.SE];

/** Roles notified immediately when a sign-out request is created. */
export const SIGNOUT_NOTIFY_ROLES: Role[] = [Role.GB, Role.HR_EB, Role.HR_SE, Role.CREATIVE_SE];

/** Roles the request escalates to after 30 minutes with no response. */
export const SIGNOUT_ESCALATION_ROLES: Role[] = [Role.GB, Role.HR_EB, Role.HR_SE];

/**
 * Department scoping for approvals: SE may only act on their own department.
 * EB, HR_EB, HR_SE, CREATIVE_SE, and GB act club-wide.
 */
export function canApproveFor(
  approver: { role: string; department: string },
  target: { department: string },
): boolean {
  if (!can(approver.role, "signout:approve")) return false;
  if (DEPARTMENT_SCOPED_ROLES.includes(approver.role as Role)) {
    return approver.department === target.department;
  }
  return true; // EB, HR_EB, HR_SE, CREATIVE_SE, GB
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
