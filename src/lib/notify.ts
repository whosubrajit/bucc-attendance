/**
 * Unified notification dispatch: DB row (for the bell/badge) + realtime
 * push (SSE) + optional email. All three from one call.
 */
import { Prisma } from "@prisma/client";
import { NotificationType } from "@/lib/enums";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { emailLayout, sendEmail } from "@/lib/email";

export async function notifyMembers(opts: {
  memberIds: string[];
  type: NotificationType;
  message: string;
  metadata?: Prisma.InputJsonValue;
  email?: { subject: string; html: string };
}): Promise<void> {
  const ids = opts.memberIds.filter((val, i, arr) => arr.indexOf(val) === i);
  if (ids.length === 0) return;

  await prisma.notification.createMany({
    data: ids.map((memberId) => ({
      memberId,
      type: opts.type,
      message: opts.message,
      metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
    })),
  });

  for (const id of ids) {
    publish(`member:${id}`, "notification", { message: opts.message, type: opts.type });
  }

  if (opts.email) {
    const members = await prisma.member.findMany({
      where: { id: { in: ids } },
      select: { email: true },
    });
    // Fire-and-forget; email failures never block the API response.
    void sendEmail(members.map((m) => m.email), opts.email.subject, emailLayout(opts.email.subject, opts.email.html));
  }
}
