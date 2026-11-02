"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { TicketType } from "@/lib/types";

export function TicketCard({
  eventId,
  t,
  remaining,
  index,
  linkless = false,
}: {
  eventId: string;
  t: TicketType;
  remaining: number;
  index: number;
  linkless?: boolean;
}) {
  const empty = remaining <= 0;
  const body = (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      whileTap={empty ? undefined : { scale: 0.97 }}
      className={`relative flex items-center gap-4 overflow-hidden border-2 p-5 ${
        empty ? "border-line opacity-40" : "border-paper bg-ink-2 shadow-brutal"
      }`}
    >
      {/* ticket notches */}
      <span className="absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border-2 border-inherit bg-ink" />
      <span className="absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border-2 border-inherit bg-ink" />
      <span className="pl-2 text-5xl">{t.emoji}</span>
      <div className="flex-1">
        <p className="font-display text-2xl uppercase leading-none">{t.label}</p>
        <p className="mt-1 font-mono text-xs uppercase tracking-widest text-mute">
          {empty ? "all used" : "tap to redeem at the bar"}
        </p>
      </div>
      <span className="pr-2 font-display text-5xl tabular-nums">
        {remaining}
        <span className="text-2xl text-tomato">×</span>
      </span>
    </motion.div>
  );
  return empty || linkless ? body : <Link href={`/e/${eventId}/redeem/${t.tokenId}`}>{body}</Link>;
}
