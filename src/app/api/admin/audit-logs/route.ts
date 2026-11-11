/**
 * GET /api/admin/audit-logs?page=1&action=&q=&from=&to=
 * Paginated, filterable audit log viewer for admins.
 * Resolves target member names and session details for friendly display.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export async function GET(req: NextRequest) {
  try {
    await requirePermission("members:manage");

    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, Number(sp.get("page")) || 1);
    const action = sp.get("action") || undefined;
    const q = sp.get("q")?.trim() || undefined;
    const from = sp.get("from") || undefined;
    const to = sp.get("to") || undefined;

    const where: Prisma.AuditLogWhereInput = {};

    if (action) where.action = action;

    if (from || to) {
      where.createdAt = {};
      if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
        return NextResponse.json({ error: "Invalid start date" }, { status: 400 });
      }
      if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return NextResponse.json({ error: "Invalid end date" }, { status: 400 });
      }
      const fromDate = from ? new Date(`${from}T00:00:00`) : undefined;
      if (fromDate && Number.isNaN(fromDate.getTime())) {
        return NextResponse.json({ error: "Invalid start date" }, { status: 400 });
      }
      if (fromDate) where.createdAt.gte = fromDate;
      if (to) {
        const toDate = new Date(`${to}T23:59:59.999`);
        if (Number.isNaN(toDate.getTime())) {
          return NextResponse.json({ error: "Invalid end date" }, { status: 400 });
        }
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }

    // Search by actor name (join through actor relation)
    if (q) {
      where.actor = {
        name: { contains: q, mode: "insensitive" },
      };
    }

    const [rows, total, actions] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          actor: {
            select: { name: true, department: true, role: true, profilePhotoUrl: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
      // Distinct action types for the filter dropdown
      prisma.auditLog.findMany({
        distinct: ["action"],
        select: { action: true },
        orderBy: { action: "asc" },
      }),
    ]);

    // Collect IDs to resolve user names and target details
    const memberIds = new Set<string>();
    const attendanceIds = new Set<string>();
    const signoutIds = new Set<string>();
    const sessionIds = new Set<string>();

    for (const r of rows) {
      if (r.targetType === "member" && r.targetId) {
        memberIds.add(r.targetId);
      } else if (r.targetType === "attendance" && r.targetId) {
        attendanceIds.add(r.targetId);
      } else if (r.targetType === "signout_request" && r.targetId) {
        signoutIds.add(r.targetId);
      } else if (r.targetType === "session" && r.targetId) {
        sessionIds.add(r.targetId);
      }

      if (r.metadata) {
        try {
          const meta = JSON.parse(r.metadata);
          if (meta.memberId && typeof meta.memberId === "string") {
            memberIds.add(meta.memberId);
          }
          if (meta.targetMemberId && typeof meta.targetMemberId === "string") {
            memberIds.add(meta.targetMemberId);
          }
        } catch {
          // ignore parse error
        }
      }
    }

    // Query in parallel
    const [members, attendances, signoutRequests, sessions] = await Promise.all([
      memberIds.size > 0
        ? prisma.member.findMany({
            where: { id: { in: Array.from(memberIds) } },
            select: { id: true, name: true, studentId: true, department: true },
          })
        : [],
      attendanceIds.size > 0
        ? prisma.attendance.findMany({
            where: { id: { in: Array.from(attendanceIds) } },
            select: {
              id: true,
              memberId: true,
              memberName: true,
              member: { select: { id: true, name: true, studentId: true, department: true } },
              session: { select: { id: true, name: true } },
            },
          })
        : [],
      signoutIds.size > 0
        ? prisma.signoutRequest.findMany({
            where: { id: { in: Array.from(signoutIds) } },
            select: {
              id: true,
              attendance: {
                select: {
                  memberId: true,
                  memberName: true,
                  member: { select: { id: true, name: true, studentId: true, department: true } },
                  session: { select: { id: true, name: true } },
                },
              },
            },
          })
        : [],
      sessionIds.size > 0
        ? prisma.session.findMany({
            where: { id: { in: Array.from(sessionIds) } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const memberMap = new Map(members.map((m) => [m.id, m]));
    const attendanceMap = new Map(attendances.map((a) => [a.id, a]));
    const signoutMap = new Map(signoutRequests.map((s) => [s.id, s]));
    const sessionMap = new Map(sessions.map((s) => [s.id, s.name]));

    const mappedRows = rows.map((r) => {
      let targetMember: { id: string; name: string; studentId: string; department: string } | null = null;
      let targetName: string | null = null;
      let targetContext: string | null = null;

      if (r.targetType === "signout_request" && r.targetId) {
        const sr = signoutMap.get(r.targetId);
        if (sr?.attendance?.member) {
          targetMember = sr.attendance.member;
          targetName = sr.attendance.member.name;
          targetContext = sr.attendance.session.name;
        } else if (sr?.attendance?.memberName) {
          targetName = sr.attendance.memberName;
          targetContext = sr.attendance.session.name;
        }
      } else if (r.targetType === "attendance" && r.targetId) {
        const att = attendanceMap.get(r.targetId);
        if (att?.member) {
          targetMember = att.member;
          targetName = att.member.name;
          targetContext = att.session.name;
        } else if (att?.memberName) {
          targetName = att.memberName;
          targetContext = att.session.name;
        }
      } else if (r.targetType === "member" && r.targetId) {
        const mem = memberMap.get(r.targetId);
        if (mem) {
          targetMember = mem;
          targetName = mem.name;
        }
      } else if (r.targetType === "session" && r.targetId) {
        targetName = sessionMap.get(r.targetId) || null;
      }

      // Check metadata fallback if targetMember still not found
      if (!targetMember && r.metadata) {
        try {
          const meta = JSON.parse(r.metadata);
          const mId = meta.memberId || meta.targetMemberId;
          if (mId && memberMap.has(mId)) {
            targetMember = memberMap.get(mId)!;
            if (!targetName) targetName = targetMember.name;
          }
        } catch {
          // ignore
        }
      }

      return {
        id: r.id,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        targetName,
        targetMember,
        targetContext,
        metadata: r.metadata,
        createdAt: r.createdAt.toISOString(),
        actor: r.actor,
      };
    });

    return NextResponse.json({
      rows: mappedRows,
      total,
      page,
      pageSize: PAGE_SIZE,
      actions: actions.map((a) => a.action),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
