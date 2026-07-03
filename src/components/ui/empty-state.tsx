import type { LucideIcon } from "lucide-react";

/** Illustrated empty state — never show a blank screen. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="rounded-full bg-navy-50 p-4 dark:bg-navy-800">
        <Icon className="h-8 w-8 text-navy-400 dark:text-electric-400" aria-hidden />
      </div>
      <p className="font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
      {action}
    </div>
  );
}
