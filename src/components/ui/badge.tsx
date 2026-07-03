import { cn } from "@/lib/utils";

const tones = {
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  yellow: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  red: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300",
  blue: "bg-electric-500/10 text-electric-600 dark:text-electric-400",
  gray: "bg-slate-100 text-slate-700 dark:bg-navy-800 dark:text-slate-300",
} as const;

export function Badge({
  tone = "gray",
  className,
  children,
}: {
  tone?: keyof typeof tones;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
