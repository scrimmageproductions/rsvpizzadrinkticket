"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AdminRedeem } from "./AdminRedeem";
import { WingmanTransfer } from "./WingmanTransfer";
import { GrantTickets } from "./GrantTickets";
import { hostBackend, type HostSettingsData } from "@/lib/backend";
import type { HostGuest } from "@/lib/types";

/**
 * MASTER GUEST LEDGER — every checked-in guest with live balances, plus the overrides:
 * Admin Redeem (Host Vouch), Transfer (Wingman) for dead phones, and Grant Tickets (Make It Right).
 */
export function MasterLedger({ eventId, settings }: { eventId: string; settings: HostSettingsData }) {
  const { data, isLoading } = hostBackend.useHostGuests(eventId);
  const [vouch, setVouch] = useState<HostGuest | null>(null);
  const [wingman, setWingman] = useState<HostGuest | null>(null);
  const [grant, setGrant] = useState<HostGuest | null>(null);
  const [q, setQ] = useState("");

  const inside = (data ?? []).filter((g) => g.status === "checked_in");
  const shown = q.trim() ? inside.filter((g) => g.name.toLowerCase().includes(q.trim().toLowerCase())) : inside;
  const totals = inside.reduce(
    (a, g) => ({
      left: a.left + Object.values(g.remaining).reduce((x, y) => x + y, 0),
      guest: a.guest + g.redeemedByGuest,
      admin: a.admin + g.redeemedByAdmin,
      moved: a.moved + g.transferredIn,
    }),
    { left: 0, guest: 0, admin: 0, moved: 0 },
  );
  // Keep the open modal in sync with live balances.
  const live = (g: HostGuest | null) => (g ? data?.find((x) => x.id === g.id) ?? g : null);

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 border-2 border-paper sm:grid-cols-4">
        {[
          ["Tickets live", totals.left],
          ["Redeemed · guest", totals.guest],
          ["Redeemed · vouch", totals.admin],
          ["Transferred", totals.moved],
        ].map(([label, n], i) => (
          <div key={String(label)} className={`p-4 ${i ? "border-l-2 border-paper" : ""} ${i >= 2 ? "border-t-2 sm:border-t-0" : ""}`}>
            <p className="font-display text-4xl tabular-nums">{n}</p>
            <p className="font-mono text-[11px] uppercase tracking-widest text-mute">{label}</p>
          </div>
        ))}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a checked-in guest…"
        className="w-full border-2 border-line bg-ink-2 px-4 py-4 text-lg outline-none focus:border-tomato"
      />

      {isLoading && <p className="font-mono text-sm text-mute">Loading ledger…</p>}

      <ul className="divide-y-2 divide-line border-2 border-line">
        {shown.map((g) => {
          const claimed = !!g.claimedAt;
          const left = Object.values(g.remaining).reduce((a, b) => a + b, 0);
          return (
            <motion.li layout key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-40 flex-1">
                <p className="text-xl font-bold">{g.name}</p>
                <p className="font-mono text-[11px] uppercase tracking-wider text-mute">
                  {claimed
                    ? `minted ${g.minted}${g.granted ? ` · +${g.granted} granted` : ""} · used ${g.redeemedByGuest}${g.redeemedByAdmin ? ` · vouched ${g.redeemedByAdmin}` : ""}${
                        g.transferredIn || g.transferredOut ? ` · moved +${g.transferredIn}/−${g.transferredOut}` : ""
                      }`
                    : "checked in · hasn't claimed tickets"}
                </p>
              </div>
              <div className="flex gap-2">
                {settings.ticketTypes.map((t) => (
                  <span key={t.tokenId} className="border-2 border-line px-2 py-1 font-display tabular-nums" title={t.label}>
                    {t.emoji} {claimed ? g.remaining[t.tokenId] ?? 0 : "–"}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  disabled={!claimed || left < 1}
                  onClick={() => setVouch(g)}
                  className="press border-2 border-paper bg-tomato px-3 py-2 font-display text-xs uppercase text-ink disabled:opacity-30 disabled:shadow-none"
                >
                  Admin redeem
                </button>
                <button
                  disabled={!claimed || left < 1}
                  onClick={() => setWingman(g)}
                  className="press border-2 border-paper px-3 py-2 font-display text-xs uppercase disabled:opacity-30"
                >
                  Transfer
                </button>
                <button
                  disabled={!claimed}
                  title={claimed ? "Grant extra tickets" : "Guest must claim first (that creates their wallet)"}
                  onClick={() => setGrant(g)}
                  className="press border-2 border-cheese px-3 py-2 font-display text-xs uppercase text-cheese disabled:opacity-30"
                >
                  🎁 Grant tickets
                </button>
              </div>
            </motion.li>
          );
        })}
        {!isLoading && !shown.length && <li className="px-4 py-6 text-center text-mute">No checked-in guests yet.</li>}
      </ul>

      {vouch && <AdminRedeem eventId={eventId} guest={live(vouch)!} settings={settings} onClose={() => setVouch(null)} />}
      {grant && (
        <GrantTickets
          eventId={eventId}
          guest={live(grant)!}
          ticketTypes={settings.ticketTypes}
          budget={settings.settings.eventBudget}
          worstCase={(data ?? []).reduce(
            (a, g) => a + g.redeemedByGuest + g.redeemedByAdmin + Object.values(g.remaining).reduce((x, y) => x + y, 0),
            0,
          )}
          onClose={() => setGrant(null)}
        />
      )}
      {wingman && (
        <WingmanTransfer
          eventId={eventId}
          from={live(wingman)!}
          guests={data ?? []}
          ticketTypes={settings.ticketTypes}
          onClose={() => setWingman(null)}
        />
      )}
    </section>
  );
}
