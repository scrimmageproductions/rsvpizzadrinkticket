"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, ErrorNote, H1, Kicker, Pill, Shell } from "@/components/ui";
import Link from "next/link";
import { guestBackend, type GuestWallet } from "@/lib/backend";
import { DEMO } from "@/lib/mode";
import type { PublicEvent } from "@/lib/types";

const PIN_LEN = 4;

type Phase = "idle" | "verifying" | "minting" | "done";

/**
 * 2. CLAIM — the guest is physically inside, reads the Event PIN off the sign, types it here.
 *    Server checks  status === 'checked_in'  AND  pin === event_pin  → EIP-712 voucher →
 *    gasless UserOperation calls RsvpTickets.claimTicketsBatch.
 */
export function ClaimScreen({
  event,
  guestName,
  checkedIn,
  wallet,
  resume = false,
  onBusyChange,
}: {
  event: PublicEvent;
  guestName: string;
  checkedIn: boolean;
  wallet: GuestWallet;
  /** Voucher was issued earlier but the mint never landed (e.g. tab closed mid-claim). */
  resume?: boolean;
  /** Lets the parent keep this screen mounted until the mint + celebration finish. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const claimTickets = guestBackend.useClaim(event.id, wallet);
  const afterClaim = guestBackend.useAfterClaim(event.id);
  const [pin, setPin] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function claim() {
    if (!wallet.ready) return;
    setErr(null);
    onBusyChange?.(true);
    try {
      await claimTickets(pin, (p) => setPhase(p));
      setPhase("done");
      navigator.vibrate?.([30, 40, 30]);
      setTimeout(() => {
        afterClaim();
        onBusyChange?.(false);
      }, 1400);
    } catch (e) {
      setPhase("idle");
      setPin("");
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      onBusyChange?.(false);
      inputRef.current?.focus();
    }
  }

  const perks = event.ticketTypes.map((t) => `${t.amount}× ${t.label}`).join("  +  ");

  return (
    <Shell right={checkedIn ? <Pill tone="ok">● checked in</Pill> : <Pill tone="warn">● at the door?</Pill>}>
      <AnimatePresence mode="wait">
        {phase === "done" ? (
          <ClaimedBurst key="done" event={event} />
        ) : (
          <motion.div
            key="form"
            exit={{ opacity: 0, scale: 0.96 }}
            className="flex flex-1 flex-col justify-between gap-8 pt-6"
          >
            <div className="space-y-4">
              <Kicker>Hey {guestName.split(" ")[0]} 👋</Kicker>
              <H1>{resume && phase === "idle" ? "Finish your claim" : "Enter the event PIN"}</H1>
              <p className="text-mute">
                {checkedIn
                  ? "Find the PIN on the sign inside the venue."
                  : "Show your name to the door staff first. Once they check you in, this unlocks."}
              </p>
              <div className="border-2 border-dashed border-line px-4 py-3 font-mono text-sm text-cheese">
                Unlocks: {perks}
              </div>
            </div>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                claim();
              }}
            >
              {/* One hidden input drives the big PIN boxes (best mobile keyboard behaviour). */}
              <label className="relative block" onClick={() => inputRef.current?.focus()}>
                <input
                  ref={inputRef}
                  value={pin}
                  disabled={!checkedIn || phase !== "idle"}
                  onChange={(e) => setPin(e.target.value.replace(/[^0-9a-z]/gi, "").toUpperCase().slice(0, 8))}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  aria-label="Event PIN"
                  className="absolute inset-0 opacity-0"
                />
                <div className="grid grid-cols-4 gap-3">
                  {Array.from({ length: Math.max(PIN_LEN, pin.length) }).map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ scale: pin[i] ? [1, 1.08, 1] : 1 }}
                      className={`flex aspect-square items-center justify-center border-2 font-display text-4xl ${
                        pin[i] ? "border-tomato bg-tomato/10" : "border-line"
                      } ${!checkedIn ? "opacity-30" : ""}`}
                    >
                      {pin[i] ?? ""}
                    </motion.div>
                  ))}
                </div>
              </label>

              <Button
                type="submit"
                loading={phase !== "idle"}
                disabled={!checkedIn || pin.length < PIN_LEN || !wallet.ready}
              >
                {checkedIn ? "Claim my tickets" : "Waiting for check-in…"}
              </Button>
              {phase !== "idle" && (
                <p className="text-center font-mono text-xs uppercase tracking-widest text-mute">
                  {phase === "verifying" ? "Verifying PIN + check-in…" : DEMO ? "Minting (simulated) · gas is on us" : "Minting on Avalanche · gas is on us"}
                </p>
              )}
              <ErrorNote>{err}</ErrorNote>
              {DEMO && !checkedIn && (
                <p className="text-center font-mono text-[11px] uppercase tracking-widest text-cheese">
                  Demo: open the{" "}
                  <Link href={`/host/${event.id}`} target="_blank" className="underline">
                    door list ↗
                  </Link>{" "}
                  and check yourself in — this screen unlocks live.
                </p>
              )}
              {DEMO && checkedIn && (
                <p className="text-center font-mono text-[11px] uppercase tracking-widest text-cheese">
                  Demo: the PIN is on the{" "}
                  <Link href={`/host/${event.id}?tab=settings`} target="_blank" className="underline">
                    host settings ↗
                  </Link>{" "}
                  (default 4209)
                </p>
              )}
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}

function ClaimedBurst({ event }: { event: PublicEvent }) {
  return (
    <motion.div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div className="flex gap-4 text-7xl">
        {event.ticketTypes.map((t, i) => (
          <motion.span
            key={t.tokenId}
            initial={{ y: 120, opacity: 0, rotate: -30 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 14, delay: i * 0.12 }}
          >
            {t.emoji}
          </motion.span>
        ))}
      </div>
      <motion.h2
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", delay: 0.25 }}
        className="font-display text-4xl uppercase"
      >
        You&apos;re in.
      </motion.h2>
    </motion.div>
  );
}
