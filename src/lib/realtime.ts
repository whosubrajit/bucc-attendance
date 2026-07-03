/**
 * Realtime layer: an in-process pub/sub bus consumed by the SSE route
 * (/api/notifications/stream). Clients also poll via SWR as a fallback,
 * so nothing breaks if SSE disconnects.
 *
 * Scaling note: this works on any single-instance Node deployment. For
 * serverless (Vercel) or horizontal scaling, replace `bus` with Supabase
 * Realtime broadcast or Redis pub/sub — publish() is the only choke point.
 */
import { EventEmitter } from "events";

export type RealtimeEvent = {
  /** channel examples: member:<id>, dashboard, approvers */
  channel: string;
  type:
    | "check_in"
    | "signout_requested"
    | "signout_approved"
    | "signout_rejected"
    | "signout_escalated"
    | "notification"
    | "dashboard_update";
  payload?: Record<string, unknown>;
  at: string;
};

const globalForBus = globalThis as unknown as { rtBus?: EventEmitter };
export const bus = (globalForBus.rtBus ??= (() => {
  const b = new EventEmitter();
  b.setMaxListeners(0); // one listener per connected SSE client
  return b;
})());

export function publish(channel: string, type: RealtimeEvent["type"], payload?: Record<string, unknown>) {
  const event: RealtimeEvent = { channel, type, payload, at: new Date().toISOString() };
  bus.emit("event", event);
}
