"use client";

import { useEffect, useState } from "react";

/** Wall-clock ms that re-renders every `everyMs`. null until mounted (keeps render pure / SSR-safe). */
export function useNow(everyMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = requestAnimationFrame(tick);
    const id = setInterval(tick, everyMs);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(id);
    };
  }, [everyMs]);
  return now;
}
