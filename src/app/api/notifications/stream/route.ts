/**
 * GET /api/notifications/stream — Server-Sent Events.
 *
 * Subscribes the client to:
 *  - member:<their id>      (personal: approval results, etc.)
 *  - approvers              (if they hold signout:approve)
 *  - dashboard              (if they can see a live board)
 *
 * Clients treat this as a hint channel and re-fetch via SWR on events, so
 * a dropped stream degrades gracefully to polling.
 */
import { requireMember, handleApiError } from "@/lib/api-guards";
import { bus, type RealtimeEvent } from "@/lib/realtime";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const member = await requireMember();

    const channels = new Set([`member:${member.id}`]);
    if (can(member.role, "signout:approve")) channels.add("approvers");
    if (can(member.role, "live:department")) channels.add("dashboard");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const send = (event: RealtimeEvent) => {
          if (!channels.has(event.channel)) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            cleanup();
          }
        };
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            cleanup();
          }
        }, 25000);
        const cleanup = () => {
          clearInterval(heartbeat);
          bus.off("event", send);
          try { controller.close(); } catch { /* already closed */ }
        };
        bus.on("event", send);
        controller.enqueue(encoder.encode(`: connected\n\n`));
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
