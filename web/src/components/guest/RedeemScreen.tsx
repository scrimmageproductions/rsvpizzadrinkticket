"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Kicker, Pill } from "@/components/ui";
import { SuccessScreen, type Verdict } from "./SuccessScreen";
import { ApiError, useApi } from "@/lib/api";
import { useBurn, type BurnState } from "@/hooks/useBurn";
import type { MeResponse } from "@/hooks/useGuest";
import type { GuestSmartAccount } from "@/lib/aa";
import type { ResolvedTheme } from "@/lib/theme";
import type { TicketType } from "@/lib/types";

type Redemption = {
  id: string;
  theme: ResolvedTheme;
  verdict: Verdict;
  voidReason?: string;
  burn: BurnState | null;
};

/**
 * 4. REDEMPTION — the guest hands their phone over; the bartender hits one gigantic button.
 *
 *    tap ─┬─▶ (same frame)  SuccessScreen in the cached Theme Color         ← what the bartender sees
 *         ├─▶ (~100ms)      POST /redemptions  → atomic off-chain ledger     ← VOID overlay if rejected
 *         └─▶ (~1-2s)       gasless UserOperation: redeemTicket → 0x…dEaD    ← background, retried if needed
 */
export function RedeemScreen({
  eventId,
  ticket,
  remaining,
  guestName,
  smartAccount,
}: {
  eventId: string;
  ticket: TicketType;
  remaining: number;
  guestName: string;
  smartAccount: GuestSmartAccount | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const api = useApi();
  const burn = useBurn(smartAccount);
  const [r, setR] = useState<Redemption | null>(null);
  const lock = useRef(false);

  const patch = (p: Partial<Redemption>) => setR((cur) => (cur ? { ...cur, ...p } : cur));

  function redeem() {
    if (lock.current || remaining <= 0) return;
    lock.current = true;

    // ── 1. Optimistic: read the pre-fetched theme straight from the cache. Zero network.
    const cached = qc.getQueryData<MeResponse>(["me", eventId]);
    const theme = cached?.theme;
    if (!theme) {
      lock.current = false;
      return;
    }
    const id = crypto.randomUUID();
    setR({ id, theme, verdict: "pending", burn: null });
    navigator.vibrate?.(80);

    // Decrement the local balance immediately.
    qc.setQueryData<MeResponse>(["me", eventId], (d) =>
      d && d.status.state !== "not_on_list"
        ? {
            ...d,
            status: {
              ...d.status,
              remaining: { ...d.status.remaining, [ticket.tokenId]: Math.max(0, remaining - 1) },
            },
          }
        : d,
    );

    // ── 2. Ledger (double-spend guard) → 3. on-chain burn, all in the background.
    (async () => {
      try {
        const res = await api<{ remaining: number; theme: ResolvedTheme }>(`/api/events/${eventId}/redemptions`, {
          json: { redemptionId: id, tokenId: ticket.tokenId, amount: 1 },
        });
        // If the color rotated in the last few seconds, snap to the authoritative one.
        patch({ verdict: "ok", theme: res.theme.key !== theme.key ? res.theme : theme });
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          navigator.vibrate?.([200, 100, 200]);
          patch({ verdict: "void", voidReason: e.code });
          qc.invalidateQueries({ queryKey: ["me", eventId] });
          return; // never burn a voided redemption
        }
        patch({ verdict: "offline" });
      }
      void burn(
        { redemptionId: id, eventId, tokenId: ticket.tokenId, amount: 1, createdAt: Date.now() },
        (s) => patch({ burn: s }),
      );
    })();
  }

  function done() {
    qc.invalidateQueries({ queryKey: ["me", eventId] });
    router.push(`/e/${eventId}`);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-ink px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between pb-4">
        <Link href={`/e/${eventId}`} className="font-mono text-xs uppercase tracking-widest text-mute">
          ← back
        </Link>
        <Pill tone="warn">bartender only</Pill>
      </div>

      <div className="flex items-end justify-between border-b-2 border-line pb-4">
        <div>
          <Kicker>{guestName}</Kicker>
          <p className="font-display text-3xl uppercase leading-none">
            {ticket.emoji} {ticket.label}
          </p>
        </div>
        <p className="font-display text-4xl tabular-nums">
          {remaining}
          <span className="text-xl text-tomato">×</span>
        </p>
      </div>

      {/* The tap target: fills every remaining pixel. Fires on pointer-down for speed. */}
      <motion.button
        type="button"
        disabled={remaining <= 0}
        onPointerDown={redeem}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && redeem()}
        whileTap={{ scale: 0.97 }}
        className="relative mt-4 flex min-h-[60dvh] flex-1 select-none flex-col items-center justify-center gap-4 overflow-hidden border-4 border-paper bg-tomato text-ink shadow-brutal disabled:bg-ink-3 disabled:text-mute"
        aria-label={`Redeem one ${ticket.label}`}
      >
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-paper/20"
          animate={{ scale: [0.6, 1.4], opacity: [0.5, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeOut" }}
        />
        <span className="relative font-display text-[18vw] uppercase leading-none tracking-tighter sm:text-8xl">
          Redeem
        </span>
        <span className="relative font-mono text-sm font-bold uppercase tracking-[0.3em]">
          {remaining > 0 ? "tap to pour · 1 ticket" : "no tickets left"}
        </span>
      </motion.button>

      <p className="pt-4 text-center font-mono text-[11px] uppercase tracking-widest text-mute">
        Screen must flash tonight&apos;s color with a live clock.
      </p>

      {r && (
        <SuccessScreen
          theme={r.theme}
          ticket={ticket}
          amount={1}
          guestName={guestName}
          verdict={r.verdict}
          voidReason={r.voidReason}
          burn={r.burn}
          onDone={done}
        />
      )}
    </div>
  );
}
