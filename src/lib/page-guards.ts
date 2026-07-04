/**
 * Guards for server components (pages). API routes use api-guards.ts;
 * these mirror the same rules but redirect instead of returning JSON.
 */
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { Member } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, type Permission } from "@/lib/rbac";

export async function getCurrentMember(): Promise<Member | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.memberId) return null;
  const member = await prisma.member.findUnique({ where: { id: session.user.memberId } });
  if (!member?.isActive) return null;
  if (member.tempRole && member.tempRoleExpiresAt && member.tempRoleExpiresAt > new Date()) {
    member.role = member.tempRole;
  }
  return member;
}

export async function requirePageMember(): Promise<Member> {
  const member = await getCurrentMember();
  if (!member) redirect("/");
  return member;
}

export async function requirePagePermission(permission: Permission): Promise<Member> {
  const member = await requirePageMember();
  if (!can(member.role, permission)) redirect("/dashboard");
  return member;
}
