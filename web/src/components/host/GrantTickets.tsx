"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Modal } from "./Modal";
import { Stepper } from "./Stepper";
import { Button, ErrorNote } from "@/components/ui";
import { hostBackend } from "@/lib/backend";
import type { HostGuest, TicketType } from "@/lib/types";

const REASONS = ["Spilled drink", "VIP", "Apology", "Birthday", "Long wait"];
const MAX_GRANT = 20;

/**
 * "MAKE IT RIGHT" — ad-hoc tickets for one guest, separate from the check-in bundle.
 * Triggers a gasless ADMIN_ROLE adminMint via the backend; logged with the staff login + reason,
 * and shown against the event budget before you confirm.
 */
export function GrantTickets({
  eventId,
  guest,
  ticketTypes,
  budget,
  worstCase,
  onClose,
}: {
  eventId: string;
  guest: HostGuest;
  ticketTypes: TicketType[];
  budget: number | null;
  /** redeemed + still-unredeemed across the event, before this grant */
  worstCase: number;
  onClose: () => void;
}) {
  const { grantTickets } = hostBackend.useHostActions(eventId);
  const [ticket, setTicket] = useState<TicketType | undefined>(ticketTypes[0]);
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const after = worstCase + amount;
  const overBudget = budget !== null && after > budget;

  async function submit() {
    if (!ticket) return;
    setErr(null);
    setBusy(true);
    try {
      await grantTickets({ rsvpId: guest.id, tokenId: ticket.tokenId, amount, reason: reason.trim() || undefined });
      setDone(`${amount}× ${ticket.emoji} ${ticket.label} for ${guest.name.split(" ")[0]}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't grant tickets");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal kicker="Make it right · grant tickets" title={guest.name} onClose={onClose}>
      {done ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-4 text-center">
          <p className="text-6xl">🎁</p>
          <p className="font-display text-2xl uppercase">Granted {done}</p>
          <p className="font-mono text-[11px] uppercase tracking-widest text-mute">They&apos;ll see it in their wallet in a few seconds.</p>
          <Button variant="paper" onClick={onClose}>
            Done
          </Button>
        </motion.div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ticketTypes.map((t) => (
              <button
                key={t.tokenId}
                onClick={() => setTicket(t)}
                className={`border-2 p-3 text-left ${ticket?.tokenId === t.tokenId ? "border-tomato bg-tomato/10" : "border-line"}`}
              >
                <span className="text-2xl">{t.emoji}</span>
                <p className="font-display uppercase leading-tight">{t.label}</p>
                <p className="font-mono text-xs text-mute">has {guest.remaining[t.tokenId] ?? 0}</p>
              </button>
            ))}
          </div>

          <Stepper value={amount} onChange={setAmount} max={MAX_GRANT} label="How many" />

          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-widest text-mute">Reason (logged)</p>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`border px-2 py-1 font-mono text-[11px] uppercase ${reason === r ? "border-paper text-paper" : "border-line text-mute"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 140))}
              placeholder="or type one…"
              className="w-full border-2 border-line bg-ink-2 px-3 py-2 outline-none focus:border-tomato"
            />
          </div>

          {budget !== null && (
            <p className={`border-l-4 px-3 py-2 text-sm ${overBudget ? "border-void bg-void/10" : "border-line"}`}>
              Worst-case tab {worstCase} → <b>{after}</b> of {budget} budget
              {overBudget && " — this puts you over budget if everything gets used."}
            </p>
          )}

          <Button onClick={submit} loading={busy} disabled={!ticket}>
            Grant {amount}× {ticket?.label}
          </Button>
          <ErrorNote>{err}</ErrorNote>
        </div>
      )}
    </Modal>
  );
}
