"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { hostBackend } from "@/lib/backend";

/** Tomato-free palette for the bar: green → cheese (#FFD23F) at 75 % → void red (#FF1F3D) at 90 %. */
const tone = (pct: number) => (pct >= 90 ? "#FF1F3D" : pct >= 75 ? "#FFD23F" : "#2BD96B");

/**
 * GLOBAL EVENT BUDGET — persistent at the top of the host dashboard so the bar tab never surprises.
 *   Redeemed  = every ticket actually poured (guest redemptions + Host Vouch)
 *   Issued    = minted at check-in + granted; "if all used" is the worst-case tab right now
 */
export function BudgetBar({ eventId, budget }: { eventId: string; budget: number | null }) {
  const { data } = hostBackend.useHostGuests(eventId);
  const guests = data ?? [];
  const redeemed = guests.reduce((a, g) => a + g.redeemedByGuest + g.redeemedByAdmin, 0);
  const outstanding = guests.reduce((a, g) => a + Object.values(g.remaining).reduce((x, y) => x + y, 0), 0);
  const worstCase = redeemed + outstanding;

  if (budget === null) {
    return (
      <div className="sticky top-0 z-30 -mx-5 border-b-2 border-line bg-ink/95 px-5 py-3 backdrop-blur">
        <p className="font-mono text-xs uppercase tracking-widest text-mute">
          {redeemed} tickets redeemed · no budget set ·{" "}
          <Link href={`/host/${eventId}?tab=settings`} className="text-paper underline">
            set one
          </Link>
        </p>
      </div>
    );
  }

  const pct = budget > 0 ? (redeemed / budget) * 100 : redeemed > 0 ? 100 : 0;
  const color = tone(pct);
  const over = redeemed > budget;

  return (
    <div
      className="sticky top-0 z-30 -mx-5 border-b-2 border-line bg-ink/95 px-5 py-3 backdrop-blur"
      role="meter"
      aria-label="Event budget"
      aria-valuemin={0}
      aria-valuemax={budget}
      aria-valuenow={redeemed}
      data-budget-pct={Math.round(pct)}
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-2xl uppercase leading-none tabular-nums sm:text-3xl" style={{ color }}>
          {redeemed} / {budget} <span className="text-base text-paper sm:text-lg">tickets redeemed</span>
        </p>
        <p className="font-mono text-[11px] uppercase tracking-widest text-mute">
          {over ? (
            <span className="text-void">⚠ {redeemed - budget} over budget</span>
          ) : (
            `${Math.round(pct)}% · ${budget - redeemed} left`
          )}
          {outstanding > 0 && (
            <span className={worstCase > budget ? "text-cheese" : ""}>
              {" "}
              · {outstanding} still unredeemed → {worstCase} if all used
            </span>
          )}
        </p>
      </div>
      <div className="h-3 w-full overflow-hidden border border-line bg-ink-3">
        <motion.div
          className="h-full"
          style={{ backgroundColor: color }}
          initial={false}
          animate={{ width: `${Math.min(100, pct)}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
    </div>
  );
}
