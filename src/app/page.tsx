/**
 * Landing page: Google sign-in for guests, "Mark Attendance" for members.
 * Auth errors from the NextAuth signIn callback land here as ?error=.
 */
import Link from "next/link";
import { QrCode, ShieldCheck, Users } from "lucide-react";
import { getCurrentMember } from "@/lib/page-guards";
import { GoogleSignInButton } from "@/components/google-signin-button";

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-domain": "Please sign in with your @g.bracu.ac.bd university email.",
  "not-registered": "You are not a registered BUCC member.",
  deactivated: "Your account has been deactivated. Contact HR for assistance.",
  AccessDenied: "You are not a registered BUCC member.",
};

export default async function LandingPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const member = await getCurrentMember();
  const error = searchParams.error ? (ERROR_MESSAGES[searchParams.error] ?? "Sign-in failed. Please try again.") : null;

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-navy-900 via-navy-800 to-navy-950 px-4 text-white">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 inline-flex rounded-2xl bg-electric-600/20 p-4 ring-1 ring-electric-500/40">
          <Users className="h-10 w-10 text-electric-400" aria-hidden />
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">BUCC Attendance</h1>
        <p className="mt-3 text-navy-100/90">
          BRAC University Computer Club — check in to volunteering sessions, track your hours, and manage sign-outs.
        </p>

        {error && (
          <div role="alert" className="mt-6 rounded-xl border border-rose-400/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="mt-8 space-y-3">
          {member ? (
            <>
              <p className="text-sm text-navy-100/80">
                Welcome back, <span className="font-semibold text-white">{member.name}</span> ({member.department})
              </p>
              <Link
                href="/attend"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-electric-600 font-semibold text-white transition-colors hover:bg-electric-500"
              >
                <QrCode className="h-5 w-5" aria-hidden /> Mark Attendance
              </Link>
              <Link
                href="/dashboard"
                className="flex h-12 w-full items-center justify-center rounded-xl border border-white/20 font-medium text-white transition-colors hover:bg-white/10"
              >
                Go to Dashboard
              </Link>
            </>
          ) : (
            <GoogleSignInButton />
          )}
        </div>

        <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-navy-100/60">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Restricted to registered BUCC members with a @g.bracu.ac.bd account
        </p>
      </div>

      <p className="absolute bottom-6 text-center text-xs text-navy-100/40">
        Made with late night crashouts by Subrajit
      </p>
    </main>
  );
}
