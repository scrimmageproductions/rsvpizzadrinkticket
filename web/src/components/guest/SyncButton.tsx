"use client";

import { motion } from "framer-motion";
import { guestBackend } from "@/lib/backend";

/**
 * "↻ Sync connection" — for guests who lost signal inside and come back on Wi-Fi. Forces a hard
 * refetch of /api/events/[eventId]/me (fresh Theme Color + balances). Spins while fetching.
 */
export function SyncButton({ eventId, urgent = false, className = "" }: { eventId: string; urgent?: boolean; className?: string }) {
  const { sync, syncing } = guestBackend.useSync(eventId);
  return (
    <button
      type="button"
      onClick={sync}
      disabled={syncing}
      aria-busy={syncing}
      className={`inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest underline-offset-4 hover:underline disabled:no-underline ${
        urgent ? "text-cheese" : "text-mute"
      } ${className}`}
    >
      <motion.span
        aria-hidden
        className="inline-block"
        animate={syncing ? { rotate: 360 } : { rotate: 0 }}
        transition={syncing ? { repeat: Infinity, duration: 0.8, ease: "linear" } : { duration: 0 }}
      >
        ↻
      </motion.span>
      {syncing ? "Syncing…" : "Sync connection"}
    </button>
  );
}
