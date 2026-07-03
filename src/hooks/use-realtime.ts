"use client";

/**
 * Subscribes to the SSE stream and revalidates SWR caches when events
 * arrive. If the stream drops, EventSource auto-reconnects; data still
 * refreshes via SWR's focus/interval revalidation, so realtime is an
 * enhancement, never a requirement.
 */
import { useEffect, useRef } from "react";
import { useSWRConfig } from "swr";
import type { RealtimeEvent } from "@/lib/realtime";

export function useRealtime(onEvent?: (e: RealtimeEvent) => void) {
  const { mutate } = useSWRConfig();
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");
    es.onmessage = (msg) => {
      try {
        const event: RealtimeEvent = JSON.parse(msg.data);
        // Revalidate everything the event could have changed.
        void mutate(
          (key) =>
            typeof key === "string" &&
            (key.startsWith("/api/dashboard") ||
              key.startsWith("/api/approvals") ||
              key.startsWith("/api/notifications") ||
              key.startsWith("/api/attendance")),
          undefined,
          { revalidate: true },
        );
        handler.current?.(event);
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => es.close();
  }, [mutate]);
}
