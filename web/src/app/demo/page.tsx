"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Kicker, Pill, Shell } from "@/components/ui";
import { SuccessScreen, type Verdict } from "@/components/guest/SuccessScreen";
import { TicketCard } from "@/components/guest/TicketCard";
import type { BurnState } from "@/hooks/useBurn";
import { PALETTE, THEME_KEYS, type ThemeKey } from "@/lib/theme";

/**
 * Backend-free walkthrough of the bartender moment (no Privy / Supabase / chain needed).
 * Simulates: optimistic success → ledger OK → UserOp pending → confirmed. "Double-spend" shows VOID.
 */
const DRINK = { tokenId: 1, label: "Free Drink", emoji: "🍺", amount: 2 };

export default function Demo() {
  const [color, setColor] = useState<ThemeKey>("neon-green");
  const [left, setLeft] = useState(2);
  const [show, setShow] = useState<null | { verdict: Verdict; burn: BurnState | null }>(null);
  const [tapId, setTapId] = useState(0);
  const theme = { key: color, ...PALETTE[color], validUntil: null };

  function tap() {
    navigator.vibrate?.(80);
    if (left <= 0) return setShow({ verdict: "void", burn: null }); // ledger says: already used
    setShow({ verdict: "pending", burn: null });
    setLeft((n) => n - 1);
    setTapId((n) => n + 1);
  }

  useEffect(() => {
    if (!tapId) return;
    const t1 = setTimeout(() => setShow((s) => s && { ...s, verdict: "ok", burn: { phase: "submitting" } }), 150);
    const t2 = setTimeout(
      () => setShow((s) => s && { ...s, burn: { phase: "pending", userOpHash: `0x${"ab".repeat(32)}` } }),
      700,
    );
    const t3 = setTimeout(
      () => setShow((s) => s && { ...s, burn: { phase: "confirmed", txHash: `0x${"5e".repeat(32)}` } }),
      2200,
    );
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, [tapId]);

  return (
    <Shell right={<Pill tone="warn">demo mode</Pill>}>
      <div className="space-y-6 pt-6">
        <div className="space-y-2">
          <Kicker>Host sets tonight&apos;s color</Kicker>
          <div className="grid grid-cols-8 gap-1.5">
            {THEME_KEYS.map((k) => (
              <button
                key={k}
                onClick={() => setColor(k)}
                className={`aspect-square border-2 ${k === color ? "border-paper" : "border-transparent"}`}
                style={{ backgroundColor: PALETTE[k].hex }}
                aria-label={PALETTE[k].name}
              />
            ))}
          </div>
        </div>

        <TicketCard eventId="demo" t={DRINK} remaining={left} index={0} linkless />

        <motion.button
          onPointerDown={tap}
          whileTap={{ scale: 0.97 }}
          className="flex h-[45dvh] w-full flex-col items-center justify-center border-4 border-paper bg-tomato text-ink shadow-brutal"
        >
          <span className="font-display text-[18vw] uppercase leading-none sm:text-8xl">Redeem</span>
          <span className="font-mono text-sm font-bold uppercase tracking-[0.3em]">
            {left > 0 ? "bartender: tap" : "tap again → see VOID"}
          </span>
        </motion.button>
        <button onClick={() => setLeft(2)} className="w-full font-mono text-xs uppercase text-mute">
          reset tickets
        </button>
      </div>

      {show && (
        <SuccessScreen
          theme={theme}
          ticket={DRINK}
          amount={1}
          guestName="Ada Lovelace"
          verdict={show.verdict}
          voidReason="insufficient_balance"
          burn={show.burn}
          onDone={() => setShow(null)}
        />
      )}
    </Shell>
  );
}
