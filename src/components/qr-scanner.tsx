"use client";

/**
 * Camera QR scanner built on html5-qrcode. Client-only: the library
 * touches `navigator` at import time, so pages must load this with
 * next/dynamic({ ssr: false }).
 *
 * The camera is acquired ONCE per mount and never restarted while mounted.
 * That is load-bearing, not a style choice: the parent re-renders on every
 * SSE event and every SWR revalidation, so a callback prop in this effect's
 * dependency array used to tear the scanner down and rebuild it several
 * times a minute. Because stop() is async and the rebuild is synchronous,
 * the dying instance's clear() wiped the DOM out from under its successor —
 * html5-qrcode then threw from inside the effect, which (with no error
 * boundary) surfaced as "Application error: a client-side exception has
 * occurred". It hit Android hardest because getUserMedia there takes
 * 300-1500ms vs ~100ms on desktop, so the overlap was near-certain.
 *
 * Therefore: callbacks live in refs, the dependency array stays empty, and
 * every html5-qrcode entry point is wrapped — a camera failure must degrade
 * to a toast plus the manual check-in path, never take the page down.
 *
 * The camera also never pauses after a successful decode, so an HR SE can
 * hold the scanner open and work down a queue of members back-to-back. The
 * only gate is the 4s same-code guard below, which stops one member's screen
 * from being read ten times while they walk away. Keep it that way: pausing
 * or unmounting on decode is what forces the operator to toggle the camera
 * between members.
 */
import { useEffect, useRef } from "react";
import { Html5Qrcode, Html5QrcodeScannerState, Html5QrcodeSupportedFormats } from "html5-qrcode";

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

  // Latest callbacks without making them effect dependencies.
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onScanRef.current = onScan;
    onErrorRef.current = onError;
  }, [onScan, onError]);

  useEffect(() => {
    let mounted = true;
    let running = false;
    let released = false;

    // In-app browsers (Facebook/Instagram/Messenger WebViews on Android) and
    // any non-HTTPS origin expose no mediaDevices at all. Say so plainly
    // instead of letting the library throw an opaque error.
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onErrorRef.current?.(
        "This browser cannot access the camera. Open the site in Chrome, or use manual check-in.",
      );
      return;
    }

    let scanner: Html5Qrcode;
    try {
      scanner = new Html5Qrcode(REGION_ID, {
        verbose: false,
        // Decode QR only. By default the library attempts every supported
        // barcode symbology on every frame — wasted CPU on a mid-range
        // Android, and CPU per frame is exactly what decides whether a scan
        // feels instant or needs re-aiming.
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        // Hand decoding to the platform's hardware-accelerated
        // BarcodeDetector where it exists (Android Chrome does; iOS Safari
        // does not). The library gates this on its own isSupported() check
        // and falls back to the bundled zxing-js build, so an unsupported
        // browser is unaffected rather than broken.
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });
    } catch {
      // Constructor throws if the region element is missing.
      onErrorRef.current?.("Could not start the scanner. Please reload the page or use manual check-in.");
      return;
    }

    // Releasing the camera track is the ONLY cleanup that matters — React owns
    // the region div and removes it on unmount.
    //
    // We deliberately never call clear(): it does `element.innerHTML = ""`, so
    // under StrictMode's double-mount a dying instance would erase its
    // successor's <video>. stop() alone releases the track.
    //
    // The try/catch is load-bearing and must stay synchronous. html5-qrcode
    // 2.3.8 `throw`s a bare string ("Cannot stop, scanner is not running or
    // paused.") *before* returning a Promise, and dereferences
    // `this.renderedCamera!` unguarded — neither is a rejection, so .catch()
    // cannot see them. An uncaught throw inside a React cleanup surfaces as
    // the exact "Application error: a client-side exception has occurred"
    // screen this file exists to prevent. Android reaches that state on its
    // own: an incoming call, a backgrounded tab, or the OS reclaiming the
    // camera moves the library to NOT_STARTED while our own flag still says
    // running, so gate on the library's state, not ours.
    const release = () => {
      if (released) return;
      released = true;
      try {
        if (scanner.getState() !== Html5QrcodeScannerState.NOT_STARTED) {
          void scanner.stop().catch(() => {});
        }
      } catch {
        /* already torn down by the browser/OS — nothing left to release */
      }
    };

    // start() also throws synchronously — on a falsy config, a non-function
    // callback, or an invalid state transition — so the call itself is wrapped
    // as well. The .catch() below only ever sees genuine rejections
    // (permission denied, no camera, getUserMedia failure).
    try {
      scanner
        .start(
          { facingMode: "environment" },
          {
            fps: 10,
            // Track the live viewfinder instead of a fixed 240px box. A fixed
            // box overflows a narrow phone's video (the library then clamps it
            // unpredictably) and on a large one covers a fraction of the
            // frame, forcing the HR SE to aim precisely at a small target.
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const edge = Math.max(160, Math.round(Math.min(viewfinderWidth, viewfinderHeight) * 0.75));
              return { width: edge, height: edge };
            },
            // A QR shown on a member's phone screen is never mirrored, so the
            // second, horizontally-flipped decode attempt per frame is pure
            // overhead. Dropping it roughly halves the work per frame.
            disableFlip: true,
          },
          (decoded) => {
            const now = Date.now();
            if (lastScanned.current === decoded && now - lastScanTime.current < 4000) {
              return; // ignore the same QR code if scanned within 4 seconds
            }
            lastScanned.current = decoded;
            lastScanTime.current = now;
            // Confirm the capture locally, before the network round-trip. On
            // venue wifi the toast can lag by a second or more; without
            // instant feedback the HR SE cannot tell a registered scan from a
            // missed one, re-aims at the same code, and concludes the scanner
            // needs restarting. Android-only API — a silent no-op elsewhere.
            try {
              navigator.vibrate?.(40);
            } catch {
              /* some browsers throw on a gesture-less vibrate — cosmetic only */
            }
            onScanRef.current(decoded);
          },
          () => {
            /* per-frame decode misses are normal — ignore */
          },
        )
        .then(() => {
          running = true;
          // Closed while the camera was still warming up. Release it now: on
          // Android getUserMedia takes 300-1500ms, so cleanup routinely runs
          // before this resolves, and without this the track stays live with
          // nothing holding a reference — the camera light stays on and the
          // next open fails because the device is still held.
          if (!mounted) release();
        })
        .catch(() => {
          if (mounted) {
            onErrorRef.current?.("Could not access the camera. Check permissions or use manual check-in.");
          }
        });
    } catch {
      onErrorRef.current?.("Could not start the camera. Please reload the page or use manual check-in.");
    }

    return () => {
      mounted = false;
      // If start() has not resolved yet, the .then() above releases it.
      if (running) release();
    };
    // Mount-once by design — see the file header. Callbacks are read via refs.
  }, []);

  return (
    <div>
      <div id={REGION_ID} className="overflow-hidden rounded-2xl" aria-label="QR code scanner viewfinder" />
      <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
        Point your camera at the session QR code
      </p>
    </div>
  );
}
