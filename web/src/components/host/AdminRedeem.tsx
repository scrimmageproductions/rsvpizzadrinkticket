"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Stepper } from "./Stepper";
import { HoldToRedeem } from "@/components/guest/HoldToRedeem";
import { SuccessScreen, type Verdict } from "@/components/guest/SuccessScreen";
import { hostBackend, type HostSettingsData } from "@/lib/backend";
import type { BurnState } from "@/hooks/useBurn";
import type { ResolvedTheme } from "@/lib/theme";
import type { HostGuest, TicketType } from "@/lib/types";

/**
 * HOST VOUCH — the guest's phone is dead. Host picks the perk AND a quantity (batch: e.g. a VIP's
 * whole round, capped at their balance) and holds once to redeem; the
 * Visual 2FA success screen appears on the HOST's device to show the bartender, while the
 * ADMIN_ROLE burn runs gasless in the background against the guest's wallet.
 */
export function AdminRedeem({
  eventId,
  guest,
  settings,
  onClose,
}: {
  eventId: string;
  guest: HostGuest;
  settings: HostSettingsData;
  onClose: () => void;
}) {
  const { adminRedeem } = hostBackend.useHostActions(eventId);
  const available = settings.ticketTypes.filter((t) => (guest.remaining[t.tokenId] ?? 0) > 0);
  const [ticket, setTicket] = useState<TicketType | undefined>(available[0]);
  const [amount, setAmount] = useState(1);
  // Cap at the guest's live balance for the selected perk (balances can change while open).
  const max = ticket ? guest.remaining[ticket.tokenId] ?? 0 : 0;
  const qty = Math.max(1, Math.min(amount, max));
  const [r, setR] = useState<{
    theme: ResolvedTheme;
    verdict: Verdict;
    voidReason?: string;
    burn: BurnState | null;
    /** frozen at fire time — the success screen must show what was actually burned */
    ticket: TicketType;
    amount: number;
  } | null>(null);
  const patch = (p: Partial<NonNullable<typeof r>>) => setR((cur) => (cur ? { ...cur, ...p } : cur));

  function fire() {
    if (!ticket || max < 1) return;
    const h = adminRedeem(guest.id, ticket.tokenId, qty);
    // Optimistic: the host's settings feed already holds tonight's color.
    setR({ theme: settings.theme, verdict: "pending", burn: null, ticket, amount: qty });
    h.outcome.then((o) => {
      if (o.verdict === "void") return patch({ verdict: "void", voidReason: o.code });
      patch(o.verdict === "ok" ? { verdict: "ok", theme: o.theme } : { verdict: "offline" });
      h.burn((s) => patch({ burn: s }));
    });
  }

  if (r) {
    return (
      <SuccessScreen
        theme={r.theme}
        ticket={r.ticket}
        amount={r.amount}
        guestName={guest.name}
        verdict={r.verdict}
        voidReason={r.voidReason}
        burn={r.burn}
        badge="Host vouch"
        onDone={onClose}
      />
    );
  }

  return (
    <Modal kicker="Host vouch · phone offline" title={guest.name} onClose={onClose}>
      {!available.length ? (
        <p className="text-mute">No tickets left on this guest.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {settings.ticketTypes.map((t) => {
              const left = guest.remaining[t.tokenId] ?? 0;
              return (
                <button
                  key={t.tokenId}
                  disabled={left < 1}
                  onClick={() => {
                    setTicket(t);
                    setAmount(1);
                  }}
                  className={`border-2 p-3 text-left disabled:opacity-30 ${ticket?.tokenId === t.tokenId ? "border-tomato bg-tomato/10" : "border-line"}`}
                >
                  <span className="text-2xl">{t.emoji}</span>
                  <p className="font-display uppercase">{t.label}</p>
                  <p className="font-mono text-xs text-mute">{left} left</p>
                </button>
              );
            })}
          </div>
          <Stepper value={qty} onChange={setAmount} max={Math.max(1, max)} label={`How many (max ${max})`} />
          <HoldToRedeem
            onComplete={fire}
            disabled={!ticket || max < 1}
            label={qty > 1 ? `Vouch ×${qty}` : "Vouch"}
            idleHint={`hold to redeem ${qty}× ${ticket?.label ?? ""}`}
            ariaLabel={`Press and hold to redeem ${qty} ${ticket?.label} for ${guest.name}`}
            className="h-56 w-full"
          />
          <p className="font-mono text-[11px] uppercase leading-relaxed tracking-widest text-mute">
            Logged as an admin redemption under your staff login. Show the bartender the color screen that follows.
          </p>
        </div>
      )}
    </Modal>
  );
}
