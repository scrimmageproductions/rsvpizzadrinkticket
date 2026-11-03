"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

/** "FRI, OCT 27" */
export const shortDate = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();

/**
 * Ticking HH:MM:SS plus today's date. Seconds that don't match the bar's clock expose a
 * screenshot; a date that isn't today exposes a recording made on a previous night.
 */
export function LiveClock({ className = "", showDate = false, dateClassName = "" }: { className?: string; showDate?: boolean; dateClassName?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = requestAnimationFrame(tick);
    const id = setInterval(tick, 200);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(id);
    };
  }, []);
  if (!now) return null;

  const ss = pad(now.getSeconds());
  const clock = (
    <div className={`flex items-baseline font-mono font-bold tabular-nums leading-none ${className}`} aria-live="off">
      <span>{pad(now.getHours())}</span>
      <Colon />
      <span>{pad(now.getMinutes())}</span>
      <Colon />
      <span className="relative inline-flex overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={ss}
            initial={{ y: "-100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          >
            {ss}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  );
  if (!showDate) return clock;
  return (
    <div className="flex flex-col items-center gap-1">
      <p className={`font-display uppercase leading-none tracking-tight ${dateClassName}`}>{shortDate(now)}</p>
      {clock}
    </div>
  );
}

function Colon() {
  return (
    <motion.span animate={{ opacity: [1, 0.25, 1] }} transition={{ repeat: Infinity, duration: 1 }}>
      :
    </motion.span>
  );
}
