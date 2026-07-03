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
  const handled = useRef(false);
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
          if (handled.current) return; // one scan per mount
          handled.current = true;
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
      // stop() rejects if the camera never started — safe to swallow.
      scanner.stop().then(() => scanner.clear()).catch(() => {});
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
