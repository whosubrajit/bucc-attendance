/**
 * Central Member Database adapter.
 *
 * The club's real central database might be a Google Sheet, an internal
 * API, or a spreadsheet export. This module isolates that decision:
 *
 *  - lookupCentralMember(email): used at login to authorize + auto-fill
 *    the profile. Reads the CentralMember mirror table.
 *  - syncFromCentral(): GB-triggered. If CENTRAL_DB_API_URL is set, pulls
 *    fresh rows from that JSON endpoint into the mirror table, then
 *    refreshes every existing Member profile from the mirror.
 */
import { Role } from "@/lib/enums";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export function deriveRole(department: string, designation: string): Role {
  const dept = department.toLowerCase();
  const desg = designation.toLowerCase();
  const isHR = dept.includes("human resource") || dept === "hr";
  const isCreative = dept.includes("creative");
  
  if (
    dept.includes("governing") ||
    desg === "gb" ||
    ["president", "vice president", "general secretary", "treasurer"].includes(desg)
  ) {
    return Role.GB;
  }
  if (desg.includes("director")) return isHR ? Role.HR_EB : Role.EB;
  if (desg.includes("senior executive") || (isHR && desg.includes("executive"))) {
    if (isHR) return Role.HR_SE;
    if (isCreative) return Role.CREATIVE_SE;
    return Role.SE;
  }
  return Role.MEMBER;
}

/**
 * Emails whose Role is granted by hand and must survive a central-DB refresh.
 *
 * `deriveRole` recomputes role from the central DB's department/designation on
 * every login (see auth.ts) and on every sync, so a manual grant is otherwise
 * silently overwritten — including a demotion the grantee cannot undo, because
 * nothing in the app writes `role`. Listing an email here makes both paths
 * leave its role alone. Comma-separated, matched case-insensitively.
 */
export function isRoleLocked(email: string): boolean {
  const locked = process.env.ROLE_LOCKED_EMAILS;
  if (!locked) return false;
  return locked
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export async function lookupCentralMember(email: string) {
  return prisma.centralMember.findUnique({ where: { email: email.toLowerCase() } });
}

const centralRowSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  studentId: z.string().min(1),
  department: z.string().min(1),
  designation: z.string().min(1),
  isActive: z.boolean().optional().default(true),
});

const CENTRAL_DB_TIMEOUT_MS = 10_000;

/** Pull from the external central DB (if configured) and refresh profiles. */
export async function syncFromCentral(): Promise<{ pulled: number; refreshed: number }> {
  let pulled = 0;
  let refreshed = 0;
  let rows: z.infer<typeof centralRowSchema>[] | null = null;

  const apiUrl = process.env.CENTRAL_DB_API_URL;
  if (apiUrl) {
    const res = await fetch(apiUrl, {
      headers: process.env.CENTRAL_DB_API_KEY
        ? { Authorization: `Bearer ${process.env.CENTRAL_DB_API_KEY}` }
        : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(CENTRAL_DB_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Central DB API returned ${res.status}`);
    rows = z.array(centralRowSchema).parse(await res.json());
    if (rows.length === 0) {
      throw new Error("Central DB sync returned no members; existing membership state was preserved");
    }
  }

  await prisma.$transaction(async (tx) => {
    if (rows) {
      const syncedEmails = rows.map((row) => row.email.toLowerCase());
      for (const row of rows) {
        await tx.centralMember.upsert({
          where: { email: row.email.toLowerCase() },
          update: { ...row, email: row.email.toLowerCase() },
          create: { ...row, email: row.email.toLowerCase() },
        });
      }
      await tx.centralMember.updateMany({
        where: { email: { notIn: syncedEmails } },
        data: { isActive: false },
      });
      pulled = rows.length;
    }

    const centrals = await tx.centralMember.findMany();
    for (const c of centrals) {
      const updated = await tx.member.updateMany({
        where: { email: c.email },
        data: {
          name: c.name,
          studentId: c.studentId,
          department: c.department,
          designation: c.designation,
          ...(isRoleLocked(c.email) ? {} : { role: deriveRole(c.department, c.designation) }),
          isActive: c.isActive,
        },
      });
      refreshed += updated.count;
    }
  });
  return { pulled, refreshed };
}
