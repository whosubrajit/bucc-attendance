"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun, QrCode } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "My Attendance", roles: ["MEMBER", "EB", "SE", "HR_EB", "HR_SE", "GB"] },
  { href: "/dashboard/live", label: "Live Board", roles: ["EB", "SE", "HR_EB", "HR_SE", "GB"] },
  { href: "/dashboard/approvals", label: "Approvals", roles: ["EB", "SE", "HR_EB", "HR_SE", "GB"] },
  { href: "/dashboard/analytics", label: "Analytics", roles: ["EB", "SE", "HR_EB", "HR_SE", "GB"] },
  { href: "/dashboard/admin", label: "Admin", roles: ["GB"] },
];

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const role = session?.user?.role ?? "MEMBER";
  const links = NAV.filter((n) => n.roles.includes(role));

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-navy-800 dark:bg-navy-950/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-navy-800 dark:text-white">
          <span className="rounded-lg bg-navy-800 px-2 py-1 text-xs text-white dark:bg-electric-600">BUCC</span>
          <span className="hidden sm:inline">Attendance</span>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto text-sm" aria-label="Main">
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

        <div className="flex items-center gap-1">
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
            <Image
              src={session.user.image}
              alt={session.user.name ?? "Profile"}
              width={32}
              height={32}
              className="rounded-full"
            />
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800"
            aria-label="Log out"
          >
            <LogOut className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
