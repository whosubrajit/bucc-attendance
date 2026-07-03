/**
 * Server-side auth guards for route handlers.
 *
 * Every guarded handler re-loads the member from the database, so role or
 * active-status changes take effect immediately — the JWT's embedded role
 * is never trusted for authorization decisions.
 */
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { Member } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, type Permission } from "@/lib/rbac";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Load the authenticated, active member or throw 401/403. */
export async function requireMember(): Promise<Member> {
  const session = await getServerSession(authOptions);
  const memberId = session?.user?.memberId;
  if (!memberId) throw new ApiError(401, "Not authenticated");

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) throw new ApiError(401, "Member not found");
  if (!member.isActive) throw new ApiError(403, "Your account has been deactivated");
  return member;
}

/** Load the member and assert a permission from the access matrix. */
export async function requirePermission(permission: Permission): Promise<Member> {
  const member = await requireMember();
  if (!can(member.role, permission)) {
    throw new ApiError(403, "You do not have permission to perform this action");
  }
  return member;
}

/** Uniform error → JSON response mapping for route handlers. */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[api] unhandled error:", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/**
 * CSRF defence for mutating endpoints. NextAuth cookies are SameSite=Lax,
 * which already blocks cross-site POSTs in modern browsers; this adds an
 * explicit Origin/Host comparison as a second layer.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return; // same-origin fetches may omit Origin; Lax cookie covers it
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) {
      throw new ApiError(403, "Cross-origin request rejected");
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(403, "Invalid Origin header");
  }
}
