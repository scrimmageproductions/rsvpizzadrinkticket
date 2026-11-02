"use client";

import { useEffect, useState } from "react";

export function ThemeCountdown({ until }: { until: number | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = requestAnimationFrame(tick);
    const id = setInterval(tick, 500);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(id);
    };
  }, []);
  if (!until) return <span>manual · until changed</span>;
  if (now === null) return <span>&nbsp;</span>;
  const s = Math.max(0, Math.round((until - now) / 1000));
  return (
    <span className="tabular-nums">
      rotates in {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}
