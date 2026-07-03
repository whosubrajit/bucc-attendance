"use client";

/**
 * Minimal toast system (no extra dependency): toast() from anywhere,
 * animated via framer-motion, auto-dismisses.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

type Toast = { id: number; kind: "success" | "error" | "info"; message: string };

let counter = 0;
let listeners: ((t: Toast) => void)[] = [];

export function toast(kind: Toast["kind"], message: string) {
  const t = { id: ++counter, kind, message };
  listeners.forEach((l) => l(t));
}

const icons = {
  success: <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden />,
  error: <AlertCircle className="h-5 w-5 text-rose-500" aria-hidden />,
  info: <Info className="h-5 w-5 text-electric-500" aria-hidden />,
};

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const add = (t: Toast) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 4500);
    };
    listeners.push(add);
    return () => {
      listeners = listeners.filter((l) => l !== add);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg dark:border-navy-700 dark:bg-navy-900"
          >
            {icons[t.kind]}
            <p className="text-sm text-slate-800 dark:text-slate-100">{t.message}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
