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

/** Map free-text department/designation from the central DB to a Role. */
export function deriveRole(department: string, designation: string, email?: string): Role {
  if (email?.toLowerCase() === "dibyosingho.barua.subrajit@g.bracu.ac.bd") {
    return Role.GB;
  }
  const dept = department.toLowerCase();
  const desg = designation.toLowerCase();
  const isHR = dept.includes("human resource") || dept === "hr";
  if (
    dept.includes("governing") ||
    desg === "gb" ||
    ["president", "vice president", "general secretary", "treasurer"].includes(desg)
  ) {
    return Role.GB;
  }
  if (desg.includes("senior executive") || desg.includes("director")) return isHR ? Role.HR_SE : Role.SE;
  if (desg.includes("executive")) return isHR ? Role.HR_EB : Role.EB;
  return Role.MEMBER;
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

/** Pull from the external central DB (if configured) and refresh profiles. */
export async function syncFromCentral(): Promise<{ pulled: number; refreshed: number }> {
  let pulled = 0;

  const apiUrl = process.env.CENTRAL_DB_API_URL;
  if (apiUrl) {
    const res = await fetch(apiUrl, {
      headers: process.env.CENTRAL_DB_API_KEY
        ? { Authorization: `Bearer ${process.env.CENTRAL_DB_API_KEY}` }
        : undefined,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Central DB API returned ${res.status}`);
    const rows = z.array(centralRowSchema).parse(await res.json());
    for (const row of rows) {
      await prisma.centralMember.upsert({
        where: { email: row.email.toLowerCase() },
        update: { ...row, email: row.email.toLowerCase() },
        create: { ...row, email: row.email.toLowerCase() },
      });
      pulled++;
    }
  }

  // Refresh existing member profiles from the mirror (name/department/
  // designation/role/active status may have changed after elections).
  const centrals = await prisma.centralMember.findMany();
  let refreshed = 0;
  for (const c of centrals) {
    const updated = await prisma.member.updateMany({
      where: { email: c.email },
      data: {
        name: c.name,
        studentId: c.studentId,
        department: c.department,
        designation: c.designation,
        role: deriveRole(c.department, c.designation, c.email),
        isActive: c.isActive,
      },
    });
    refreshed += updated.count;
  }
  return { pulled, refreshed };
}
