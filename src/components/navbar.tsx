"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun, QrCode, HelpCircle, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import { NotificationBell } from "@/components/notification-bell";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", roles: ["MEMBER", "EB", "SE", "HR_EB", "HR_SE", "GB"] },
  { href: "/dashboard/live", label: "Live Board", roles: ["EB", "SE", "HR_EB", "HR_SE", "GB"] },
  { href: "/dashboard/approvals", label: "Approvals", roles: ["EB", "SE", "HR_EB", "HR_SE", "GB"] },
  { href: "/dashboard/analytics", label: "Analytics", roles: ["EB", "SE", "HR_EB", "HR_SE", "GB"] },
  { href: "/dashboard/admin", label: "Admin", roles: ["HR_EB", "HR_SE", "GB"] },
];

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const role = session?.user?.role ?? "MEMBER";
  const links = NAV.filter((n) => n.roles.includes(role));

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-navy-800 dark:bg-navy-950/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-bold text-navy-800 dark:text-white">
          <span className="rounded-lg bg-navy-800 px-2 py-1 text-xs text-white dark:bg-electric-600">BUCC</span>
          <span className="hidden sm:inline">Attendance</span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm" aria-label="Main">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition-colors",
                pathname === l.href
                  ? "bg-navy-800 text-white dark:bg-electric-600"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/attend"
            className="hidden items-center gap-1.5 rounded-lg bg-electric-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-electric-500 sm:flex"
          >
            <QrCode className="h-4 w-4" aria-hidden /> Mark Attendance
          </Link>
          <NotificationBell />
          <button
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800"
            aria-label="Toggle dark mode"
          >
            <Sun className="h-5 w-5 dark:hidden" aria-hidden />
            <Moon className="hidden h-5 w-5 dark:block" aria-hidden />
          </button>
          {session?.user?.image && (
            <div className="relative">
              <button
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center justify-center rounded-full ring-2 ring-transparent transition-all hover:ring-electric-500 focus:outline-none focus:ring-electric-500"
                aria-label="Profile menu"
                aria-expanded={isProfileOpen}
              >
                <Image
                  src={session.user.image}
                  alt={session.user.name ?? "Profile"}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              </button>

              {isProfileOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsProfileOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg shadow-slate-200/50 dark:border-navy-800 dark:bg-navy-900 dark:shadow-none z-50">
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-navy-800/60">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {session.user.name}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {session.user.email}
                      </p>
                    </div>

                    <div className="p-1.5">
                      <Link
                        href="/dashboard"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex w-full items-center rounded-md px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-navy-800 dark:hover:text-white"
                      >
                        <LayoutDashboard className="mr-2 h-4 w-4" aria-hidden /> Dashboard
                      </Link>
                      <Link
                        href="/dashboard/support"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex w-full items-center rounded-md px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-navy-800 dark:hover:text-white"
                      >
                        <HelpCircle className="mr-2 h-4 w-4" aria-hidden /> Help & Support
                      </Link>
                      <button
                        onClick={() => signOut({ callbackUrl: "/" })}
                        className="flex w-full items-center rounded-md px-3 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                      >
                        <LogOut className="mr-2 h-4 w-4" aria-hidden /> Log out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
