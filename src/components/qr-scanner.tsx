"use client";

/**
 * Camera QR scanner built on html5-qrcode. Client-only: the library
 * touches `navigator` at import time, so pages must load this with
 * next/dynamic({ ssr: false }).
 */
import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

const REGION_ID = "bucc-qr-scanner-region";

export default function QrScanner({
  onScan,
  onError,
}: {
  onScan: (decoded: string) => void;
  onError?: (message: string) => void;
}) {
  const lastScanned = useRef<string | null>(null);
  const lastScanTime = useRef<number>(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    const scanner = new Html5Qrcode(REGION_ID);
    let mounted = true;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          const now = Date.now();
          if (lastScanned.current === decoded && now - lastScanTime.current < 4000) {
            return; // ignore the same QR code if scanned within 4 seconds
          }
          lastScanned.current = decoded;
          lastScanTime.current = now;
          onScanRef.current(decoded);
        },
        () => {
          /* per-frame decode misses are normal — ignore */
        },
      )
      .catch(() => {
        if (mounted) onError?.("Could not access the camera. Check permissions or use manual check-in.");
      });

    return () => {
      mounted = false;
      try {
        scanner.stop()
          .then(() => {
            try { scanner.clear(); } catch (e) {}
          })
          .catch(() => {});
      } catch (e) {
        // Fallback if stop() throws synchronously
        try { scanner.clear(); } catch (e) {}
      }
    };
  }, [onError]);

  return (
    <div>
      <div id={REGION_ID} className="overflow-hidden rounded-2xl" aria-label="QR code scanner viewfinder" />
      <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
        Point your camera at the session QR code
      </p>
    </div>
  );
}
