"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Modal } from "./Modal";
import { Button, ErrorNote } from "@/components/ui";
import { hostBackend } from "@/lib/backend";
import type { HostGuest, TicketType } from "@/lib/types";

/**
 * WINGMAN TRANSFER — move a stranded guest's tickets to a friend who is also inside.
 * Uses ADMIN_ROLE `adminTransfer`, the only way around the soulbound rule.
 */
export function WingmanTransfer({
  eventId,
  from,
  guests,
  ticketTypes,
  onClose,
}: {
  eventId: string;
  from: HostGuest;
  guests: HostGuest[];
  ticketTypes: TicketType[];
  onClose: () => void;
}) {
  const { transfer } = hostBackend.useHostActions(eventId);
  const available = ticketTypes.filter((t) => (from.remaining[t.tokenId] ?? 0) > 0);
  const [tokenId, setTokenId] = useState<number | undefined>(available[0]?.tokenId);
  const max = tokenId !== undefined ? from.remaining[tokenId] ?? 0 : 0;
  const [amount, setAmount] = useState(1);
  const [toId, setToId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const candidates = guests.filter((g) => g.id !== from.id && g.status === "checked_in");
  const eligible = (g: HostGuest) => !!g.claimedAt;
  const ticket = ticketTypes.find((t) => t.tokenId === tokenId);

  async function submit() {
    if (tokenId === undefined || !toId) return;
    setErr(null);
    setBusy(true);
    try {
      await transfer({ fromRsvpId: from.id, toRsvpId: toId, tokenId, amount: Math.min(amount, max) });
      const to = guests.find((g) => g.id === toId);
      setDone(`Moved ${amount}× ${ticket?.emoji} ${ticket?.label} to ${to?.name}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal kicker="Wingman transfer" title={`From ${from.name}`} onClose={onClose}>
      {done ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-4 text-center">
          <p className="text-6xl">🤝</p>
          <p className="font-display text-2xl uppercase">{done}</p>
          <Button variant="paper" onClick={onClose}>
            Done
          </Button>
        </motion.div>
      ) : !available.length ? (
        <p className="text-mute">No tickets left to transfer.</p>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-widest text-mute">Ticket</p>
            <div className="grid grid-cols-2 gap-2">
              {ticketTypes.map((t) => {
                const left = from.remaining[t.tokenId] ?? 0;
                return (
                  <button
                    key={t.tokenId}
                    disabled={left < 1}
                    onClick={() => {
                      setTokenId(t.tokenId);
                      setAmount(1);
                    }}
                    className={`border-2 p-3 text-left disabled:opacity-30 ${tokenId === t.tokenId ? "border-tomato bg-tomato/10" : "border-line"}`}
                  >
                    <span className="text-2xl">{t.emoji}</span>
                    <p className="font-display uppercase">{t.label}</p>
                    <p className="font-mono text-xs text-mute">{left} left</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-widest text-mute">Amount</p>
            <div className="flex items-center border-2 border-paper">
              <button className="px-4 py-2 font-display text-xl" onClick={() => setAmount((a) => Math.max(1, a - 1))} aria-label="Less">
                −
              </button>
              <span className="w-12 text-center font-display text-2xl tabular-nums">{Math.min(amount, max)}</span>
              <button className="px-4 py-2 font-display text-xl" onClick={() => setAmount((a) => Math.min(max, a + 1))} aria-label="More">
                +
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-widest text-mute">To (checked-in guest)</p>
            <div className="max-h-56 divide-y-2 divide-line overflow-y-auto border-2 border-line">
              {candidates.map((g) => (
                <label
                  key={g.id}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${!eligible(g) ? "cursor-not-allowed opacity-40" : ""} ${toId === g.id ? "bg-tomato/10" : ""}`}
                >
                  <input type="radio" name="to" disabled={!eligible(g)} checked={toId === g.id} onChange={() => setToId(g.id)} className="accent-[#FF4D1C]" />
                  <span className="flex-1 font-bold">{g.name}</span>
                  <span className="font-mono text-[11px] uppercase text-mute">{eligible(g) ? "ready" : "hasn't claimed yet"}</span>
                </label>
              ))}
              {!candidates.length && <p className="px-3 py-4 text-mute">Nobody else is checked in.</p>}
            </div>
          </div>

          <Button onClick={submit} loading={busy} disabled={!toId || tokenId === undefined || max < 1}>
            Transfer {Math.min(amount, max)}× {ticket?.label}
          </Button>
          <ErrorNote>{err}</ErrorNote>
        </div>
      )}
    </Modal>
  );
}
