"use client";

import { useNow } from "@/hooks/useNow";
import type { RecentRedemption, TicketType } from "@/lib/types";

const ago = (ms: number) => {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  return m === 1 ? "1 min ago" : `${m} mins ago`;
};
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * BARTENDER SAFETY NET — if the success screen auto-closed while the bartender's back was turned,
 * these static receipts (last 30 min, from the server ledger) prove what was just redeemed.
 * Deliberately plain: no theme color (that would leak the palette) and no animation (it's a
 * record, not a live verification screen).
 */
export function RecentRedemptions({
  items,
  ticketTypes,
  clockOffset,
}: {
  items: RecentRedemption[];
  ticketTypes: TicketType[];
  clockOffset: number;
}) {
  const now = useNow(15_000);
  if (!items.length) return null;
  const serverNow = (now ?? 0) + clockOffset;

  return (
    <section className="mt-8 space-y-2" aria-label="Recent redemptions">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-mute">Recent redemptions · last 30 min</p>
      <ul className="divide-y divide-line border-2 border-line">
        {items.map((r) => {
          const t = ticketTypes.find((x) => x.tokenId === r.tokenId);
          return (
            <li key={r.id} className="flex items-baseline gap-3 px-3 py-2">
              <span className="text-basil">✓</span>
              <span className="flex-1 font-bold">
                {r.amount}× {t ? `${t.emoji} ${t.label}` : `Ticket #${r.tokenId}`}
                {r.byHost && <span className="ml-2 font-mono text-[10px] uppercase text-cheese">host vouch</span>}
              </span>
              <span className="text-right font-mono text-[11px] uppercase tabular-nums text-mute">
                {now !== null && ago(serverNow - Date.parse(r.at))}
                <br />
                {clock(r.at)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
