"use client";

/**
 * Route-level error boundary.
 *
 * Without this file ANY uncaught client-side render/effect error anywhere in
 * the app falls through to Next's built-in root fallback, whose entire text
 * is "Application error: a client-side exception has occurred (see the
 * browser console for more information)" — a dead white page with no way
 * back. During a live event that is indistinguishable from the site being
 * down, and an HR SE has no console to look at on their phone.
 *
 * Deliberately dependency-free: an error boundary that imports the component
 * tree it is meant to catch can fail the same way it is catching.
 */
import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface it for Vercel's client-error capture rather than losing it.
    console.error("[bucc] client error boundary:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-navy-900 via-navy-800 to-navy-950 px-4 text-center text-white">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-sm text-navy-100/80">
          This screen failed to load. Your attendance and sign-out records are stored on the server and are
          not affected.
        </p>

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={reset}
            className="h-12 w-full rounded-xl bg-electric-600 font-semibold text-white transition-colors hover:bg-electric-500"
          >
            Try again
          </button>
          <Link
            href="/attend"
            className="flex h-12 w-full items-center justify-center rounded-xl border border-white/20 font-medium text-white transition-colors hover:bg-white/10"
          >
            Go to Mark Attendance
          </Link>
          <Link
            href="/"
            className="flex h-12 w-full items-center justify-center rounded-xl border border-white/20 font-medium text-white transition-colors hover:bg-white/10"
          >
            Back to home
          </Link>
        </div>

        <p className="mt-8 text-xs text-navy-100/50">
          If this keeps happening, tell an HR SE and mention this code:{" "}
          <span className="font-mono text-navy-100/80">{error.digest ?? "n/a"}</span>
        </p>
      </div>
    </main>
  );
}
