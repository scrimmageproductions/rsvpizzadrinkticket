"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { LiveClock } from "./LiveClock";
import { chainLabel, explorerTx } from "@/lib/chain";
import type { ResolvedTheme } from "@/lib/theme";
import type { BurnState } from "@/hooks/useBurn";
import type { TicketType } from "@/lib/types";

/** Deterministic 0..1 noise (render must stay pure). */
const jitter = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/** The success screen closes itself (back to the wallet) after this long. */
export const AUTO_RESET_MS = 15_000;

/** "Flashbang": blinding white for exactly this long, then a hard cut to the theme color. */
export const FLASH_MS = 150;

export type Verdict = "pending" | "ok" | "void" | "offline";

/**
 * 5. SUCCESS — rendered the same frame the bartender taps (optimistic).
 *    The whole screen floods with the Theme Color of the Night: the bartender's only job is
 *    "does this match tonight's color, and is the clock ticking?"
 */
export function SuccessScreen({
  theme,
  ticket,
  amount,
  guestName,
  verdict,
  voidReason,
  burn,
  onDone,
  badge,
}: {
  theme: ResolvedTheme;
  ticket: TicketType;
  amount: number;
  guestName: string;
  verdict: Verdict;
  voidReason?: string;
  burn: BurnState | null;
  onDone: () => void;
  /** e.g. "Host vouch" — shown when staff redeem on a guest's behalf. */
  badge?: string;
}) {
  // Guests run dim screens in dark bars. A full-white frame snaps the bartender's eyes to the
  // phone and maxes out perceived brightness; then a HARD cut (no fade) to tonight's color.
  // Text is solid black during the flash, then the theme's computed contrast ink.
  const [flash, setFlash] = useState(true);
  useEffect(() => {
    // Frame-aligned: count from the first white frame, and request the cut ONE frame early —
    // a state change made inside a frame callback only paints on the following frame. The frame
    // length is measured, so this lands on ≈150 ms at 60 Hz (9 frames) and 120 Hz (18 frames).
    // (A plain setTimeout(150) measured ~167–190 ms paint-to-paint.)
    let raf = 0;
    let start = 0;
    let prev = 0;
    const tick = (t: number) => {
      if (!start) start = prev = t;
      const frame = t - prev > 0 ? t - prev : 1000 / 60;
      prev = t;
      if (t - start + frame >= FLASH_MS - frame / 2) setFlash(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // Auto-reset: a guest can't walk away with a live success screen and flash it again later.
  // The latest onDone is kept in a ref so re-renders (burn status, theme snap) don't restart it.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    const id = setTimeout(() => onDoneRef.current(), AUTO_RESET_MS);
    return () => clearTimeout(id);
  }, []);

  const bg = flash ? "#FFFFFF" : theme.hex;
  const ink = flash ? "#000000" : theme.ink;

  const burst = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2 + jitter(i) * 0.4;
        const d = 160 + jitter(i + 99) * 140;
        return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: jitter(i + 7) * 540 - 270, e: i % 3 === 0 ? "🍕" : ticket.emoji };
      }),
    [ticket.emoji],
  );

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      // Plain style (no transition / no animate on color): white → theme is a single-frame cut.
      style={{ backgroundColor: bg, color: ink }}
      data-flash={flash ? "white" : "theme"}
      role="status"
    >
      {/* Auto-reset countdown: shrinks to nothing over 15 s, then the screen closes itself. */}
      <motion.div
        aria-hidden
        data-autoreset
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-1.5 origin-left"
        style={{ backgroundColor: ink, opacity: 0.55 }}
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: AUTO_RESET_MS / 1000, ease: "linear" }}
      />

      {/* Continuous motion: diagonal marquee rows scrolling in opposite directions, forever.
          A paused video or a screenshot freezes instantly — a live app never stops moving. */}
      <div aria-hidden className="pointer-events-none absolute inset-[-40%] flex -rotate-[18deg] flex-col justify-center gap-6 opacity-[0.13]">
        {Array.from({ length: 9 }, (_, row) => (
          <motion.div
            key={row}
            className="flex w-max whitespace-nowrap font-display text-6xl uppercase leading-none"
            style={{ color: ink }}
            animate={{ x: row % 2 ? ["-50%", "0%"] : ["0%", "-50%"] }}
            transition={{ repeat: Infinity, ease: "linear", duration: 9 + (row % 3) * 2 }}
          >
            {Array.from({ length: 2 }, (_, half) => (
              <span key={half} className="pr-8">
                {Array.from({ length: 6 }, () => `Redeemed ✦ ${theme.name} ✦ rsv.pizza ✦ `).join("")}
              </span>
            ))}
          </motion.div>
        ))}
      </div>

      {/* Rhythmic pulse: a soft ring breathes out from the check mark every 1.4 s. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[34%] h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border-[10px]"
        style={{ borderColor: ink }}
        animate={{ scale: [0.6, 2.4], opacity: [0.35, 0] }}
        transition={{ repeat: Infinity, duration: 1.4, ease: "easeOut" }}
      />

      {/* Shock rings */}
      {[0, 0.15, 0.3].map((delay) => (
        <motion.span
          key={delay}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[38%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border-[6px]"
          style={{ borderColor: ink }}
          initial={{ scale: 0.2, opacity: 0.8 }}
          animate={{ scale: 6, opacity: 0 }}
          transition={{ duration: 1.1, delay, ease: "easeOut" }}
        />
      ))}

      {/* Emoji burst */}
      {burst.map((b, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[38%] text-4xl"
          initial={{ x: 0, y: 0, scale: 0, rotate: 0, opacity: 1 }}
          animate={{ x: b.x, y: b.y, scale: 1.2, rotate: b.r, opacity: 0 }}
          transition={{ duration: 1.2, delay: 0.1, ease: [0.1, 0.8, 0.3, 1] }}
        >
          {b.e}
        </motion.span>
      ))}

      <div className="relative flex flex-1 flex-col items-center justify-between px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-center">
        <div className="flex w-full items-center justify-between font-mono text-xs font-bold uppercase tracking-[0.2em]">
          <span className="flex items-center gap-2">
            rsv.pizza
            {badge && (
              <span className="px-2 py-0.5" style={{ backgroundColor: ink, color: bg }}>
                {badge}
              </span>
            )}
          </span>
          <button onClick={onDone} className="border-2 px-3 py-1" style={{ borderColor: ink }}>
            Done
          </button>
        </div>

        <div className="flex flex-col items-center gap-3">
          <motion.svg viewBox="0 0 100 100" className="h-20 w-20" initial={{ scale: 0.3, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 12 }}>
            <circle cx="50" cy="50" r="46" fill="none" stroke={ink} strokeWidth="8" />
            <motion.path
              d="M28 52 L44 67 L73 35"
              fill="none"
              stroke={ink}
              strokeWidth="10"
              strokeLinecap="square"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.35, delay: 0.15 }}
            />
          </motion.svg>

          <motion.h1
            className="font-display text-[15vw] uppercase leading-[0.85] tracking-tighter sm:text-8xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
          >
            Redeemed
          </motion.h1>
          <motion.p
            className="font-display text-3xl uppercase"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", delay: 0.25 }}
          >
            {amount}× {ticket.label} {ticket.emoji}
          </motion.p>
          <p className="font-mono text-sm font-bold uppercase tracking-widest">{guestName}</p>
        </div>

        <div className="flex w-full flex-col items-center gap-4">
          {/* Date defeats recordings from previous nights; ticking seconds defeat screenshots. */}
          <LiveClock showDate className="text-[17vw] sm:text-7xl" dateClassName="text-[9vw] sm:text-4xl" />
          <div className="w-full border-[3px] px-4 py-2" style={{ borderColor: ink }}>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] opacity-70">Tonight&apos;s color</p>
            <p className="font-display text-2xl uppercase">{theme.name}</p>
          </div>
          <BurnChip burn={burn} verdict={verdict} />
        </div>
      </div>

      <AnimatePresence>{verdict === "void" && <VoidOverlay reason={voidReason} onDone={onDone} />}</AnimatePresence>
    </motion.div>
  );
}

function BurnChip({ burn, verdict }: { burn: BurnState | null; verdict: Verdict }) {
  const base = "font-mono text-[11px] font-bold uppercase tracking-widest opacity-80";
  if (verdict === "offline") return <p className={base}>⚠ offline · will sync when back online</p>;
  if (!burn || burn.phase === "submitting") return <p className={base}>⛓ burning ticket on {chainLabel}…</p>;
  if (burn.phase === "pending") return <p className={base}>⛓ confirming · gas sponsored</p>;
  if (burn.phase === "queued") return <p className={base}>⛓ queued · will retry</p>;
  if (burn.simulated) return <p className={base}>✓ burned on-chain (simulated) · {burn.txHash.slice(0, 10)}…</p>;
  return (
    <a href={explorerTx(burn.txHash)} target="_blank" rel="noreferrer" className={`${base} underline`}>
      ✓ burned on-chain · {burn.txHash.slice(0, 10)}…
    </a>
  );
}

/** Server-side ledger rejected the redemption (e.g. same ticket already used on another phone). */
function VoidOverlay({ reason, onDone }: { reason?: string; onDone: () => void }) {
  return (
    <motion.div
      className="stripes-void absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 p-6 text-center text-paper"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="alert"
    >
      <motion.div
        className="bg-black px-6 py-5"
        initial={{ scale: 1.6, rotate: -8 }}
        animate={{ scale: 1, rotate: -4 }}
        transition={{ type: "spring", stiffness: 400, damping: 14 }}
      >
        <p className="font-display text-7xl uppercase leading-none">Void</p>
        <p className="mt-2 font-display text-xl uppercase">Do not serve</p>
        <p className="mt-3 font-mono text-xs uppercase tracking-widest text-mute">
          {reason === "insufficient_balance" ? "No tickets left on this account" : "Redemption rejected"}
        </p>
      </motion.div>
      <button onClick={onDone} className="border-2 border-paper bg-black px-5 py-2 font-mono text-xs uppercase">
        Back
      </button>
    </motion.div>
  );
}
