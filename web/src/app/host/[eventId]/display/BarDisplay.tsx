"use client";

import { motion, AnimatePresence } from "framer-motion";
import { HostGate } from "@/components/host/HostGate";
import { ThemeCountdown } from "@/components/host/ThemeCountdown";
import { LiveClock } from "@/components/guest/LiveClock";

/**
 * STAFF-FACING reference screen for behind the bar (point it away from guests).
 * The bartender glances here, then at the guest's phone: same color + ticking clock = pour.
 */
export function BarDisplay({ eventId }: { eventId: string }) {
  return (
    <HostGate eventId={eventId}>
      {({ theme, eventName }) => (
        <AnimatePresence mode="wait">
          <motion.div
            key={theme.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex flex-col items-center justify-between p-8 text-center"
            style={{ backgroundColor: theme.hex, color: theme.ink }}
          >
            <p className="font-mono text-sm font-bold uppercase tracking-[0.3em]">{eventName} · staff only</p>
            <div>
              <p className="font-mono text-lg font-bold uppercase tracking-[0.3em]">Tonight&apos;s color</p>
              <p className="font-display text-[14vw] uppercase leading-[0.85]">{theme.name}</p>
            </div>
            <div className="space-y-2">
              <LiveClock className="justify-center text-6xl" />
              <p className="font-mono text-sm font-bold uppercase">
                <ThemeCountdown until={theme.validUntil} />
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </HostGate>
  );
}
