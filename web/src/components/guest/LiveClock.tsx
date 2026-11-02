"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Ticking HH:MM:SS. A static screenshot / pre-recorded video of a success screen is
 * immediately obvious to a bartender because the seconds don't match the real time.
 */
export function LiveClock({ className = "" }: { className?: string }) {
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

  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());

  return (
    <div className={`flex items-baseline font-mono font-bold tabular-nums leading-none ${className}`} aria-live="off">
      <span>{hh}</span>
      <Colon />
      <span>{mm}</span>
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
}

function Colon() {
  return (
    <motion.span animate={{ opacity: [1, 0.25, 1] }} transition={{ repeat: Infinity, duration: 1 }}>
      :
    </motion.span>
  );
}
