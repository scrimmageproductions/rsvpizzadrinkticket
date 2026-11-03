"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Kicker, Pill } from "@/components/ui";
import { SuccessScreen, type Verdict } from "./SuccessScreen";
import { HoldToRedeem } from "./HoldToRedeem";
import { guestBackend, type GuestWallet } from "@/lib/backend";
import { DEMO } from "@/lib/mode";
import type { BurnState } from "@/hooks/useBurn";
import type { ResolvedTheme } from "@/lib/theme";
import type { TicketType } from "@/lib/types";

type Redemption = { theme: ResolvedTheme; verdict: Verdict; voidReason?: string; burn: BurnState | null };

/**
 * 4. REDEMPTION — the guest hands their phone over; the bartender HOLDS one gigantic button.
 *
 *    hold 1.5s ─┬─▶ (same frame)  SuccessScreen in the cached Theme Color      ← what the bartender sees
 *               ├─▶ (~100ms)      ledger double-spend check                      ← VOID overlay if rejected
 *               └─▶ (~1-2s)       gasless redeemTicket → 0x…dEaD                ← background, after ledger OK
 *
 *  The button itself is brand tomato — never the theme color — so nothing on the guest's screen
 *  hints at tonight's Visual 2FA color before a real redemption.
 */
export function RedeemScreen({
  eventId,
  ticket,
  remaining,
  guestName,
  wallet,
}: {
  eventId: string;
  ticket: TicketType;
  remaining: number;
  guestName: string;
  wallet: GuestWallet;
}) {
  const router = useRouter();
  const redeem = guestBackend.useRedeem(eventId, wallet);
  const refresh = guestBackend.useRefreshMe(eventId);
  const [r, setR] = useState<Redemption | null>(null);

  const patch = (p: Partial<Redemption>) => setR((cur) => (cur ? { ...cur, ...p } : cur));

  // Next 16 keeps visited routes alive (hidden) and restores their state on return. A stale
  // success screen must NEVER reappear without a fresh redemption, so wipe it when we're hidden.
  useEffect(() => () => setR(null), []);

  function fire(opts?: { forceConflict?: boolean }) {
    const h = redeem(ticket.tokenId, opts);
    if (!h.theme) return;
    setR({ theme: h.theme, verdict: "pending", burn: null });
    h.outcome.then((o) => {
      if (o.verdict === "void") {
        navigator.vibrate?.([200, 100, 200]);
        return patch({ verdict: "void", voidReason: o.code }); // never burn a voided redemption
      }
      // If the color rotated in the last few seconds, snap to the authoritative one.
      patch(o.verdict === "ok" ? { verdict: "ok", theme: o.theme } : { verdict: "offline" });
      h.burn((s) => patch({ burn: s }));
    });
  }

  function done() {
    setR(null);
    refresh();
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

      <HoldToRedeem
        onComplete={() => fire()}
        disabled={remaining <= 0}
        idleHint={remaining > 0 ? "press & hold to pour" : "no tickets left"}
        ariaLabel={`Press and hold to redeem one ${ticket.label}`}
        className="mt-4 min-h-[60dvh] flex-1"
      />

      <p className="pt-4 text-center font-mono text-[11px] uppercase tracking-widest text-mute">
        Bartender: hold until it fills. Screen must flash tonight&apos;s color, today&apos;s date and a live clock.
      </p>
      {DEMO && remaining > 0 && (
        <button onClick={() => fire({ forceConflict: true })} className="pt-2 font-mono text-[11px] uppercase text-cheese underline">
          demo: simulate the same ticket used on a 2nd phone
        </button>
      )}

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
