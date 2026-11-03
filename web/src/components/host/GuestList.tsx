"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { hostBackend } from "@/lib/backend";
import type { HostGuest } from "@/lib/types";

/**
 * DOOR STAFF — one job: find the name, tap CHECK IN. This is Layer 1 of the mint gate.
 */
export function GuestList({ eventId }: { eventId: string }) {
  const { data: list, isLoading } = hostBackend.useHostGuests(eventId);
  const { setCheckedIn } = hostBackend.useHostActions(eventId);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const guests = useMemo(() => {
    const all = list ?? [];
    const needle = q.trim().toLowerCase();
    return needle
      ? all.filter((g) => [g.name, g.email, g.phone].some((v) => v?.toLowerCase().includes(needle)))
      : all;
  }, [list, q]);

  const total = list?.length ?? 0;
  const inside = list?.filter((g) => g.status === "checked_in").length ?? 0;
  const claimed = list?.filter((g) => g.claimedAt).length ?? 0;

  async function toggle(g: HostGuest) {
    setBusy(g.id);
    try {
      await setCheckedIn(g.id, g.status !== "checked_in");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-3 border-2 border-paper">
        {[
          ["RSVP'd", total],
          ["Checked in", inside],
          ["Tickets claimed", claimed],
        ].map(([label, n], i) => (
          <div key={String(label)} className={`p-4 ${i ? "border-l-2 border-paper" : ""}`}>
            <p className="font-display text-4xl tabular-nums">{n}</p>
            <p className="font-mono text-[11px] uppercase tracking-widest text-mute">{label}</p>
          </div>
        ))}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, email, phone…"
        className="w-full border-2 border-line bg-ink-2 px-4 py-4 text-lg outline-none focus:border-tomato"
      />

      {isLoading && <p className="font-mono text-sm text-mute">Loading guest list…</p>}

      <ul className="divide-y-2 divide-line border-2 border-line">
        {guests.map((g) => {
          const isIn = g.status === "checked_in";
          return (
            <motion.li layout key={g.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-bold">{g.name}</p>
                <p className="truncate font-mono text-xs text-mute">
                  {g.email ?? g.phone ?? "—"}
                  {g.status === "checked_in" && g.checkedInBy === "kiosk" && " · 📱 self check-in"}
                  {g.invitedAt && !g.claimedAt && " · ✉ link sent"}
                  {g.claimedAt && " · 🎟 claimed"}
                  {g.redeemed > 0 && ` · ${g.redeemed} redeemed`}
                </p>
              </div>
              <button
                onClick={() => toggle(g)}
                disabled={busy === g.id}
                className={`press min-w-36 border-2 px-4 py-3 font-display text-sm uppercase ${
                  isIn ? "border-basil bg-basil text-ink" : "border-paper bg-transparent text-paper"
                }`}
              >
                {isIn ? "✓ Checked in" : "Check in"}
              </button>
            </motion.li>
          );
        })}
        {!isLoading && !guests.length && <li className="px-4 py-6 text-center text-mute">No matches.</li>}
      </ul>
    </section>
  );
}
