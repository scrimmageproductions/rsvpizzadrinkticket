"use client";

import { H1, Kicker, Pill, Shell } from "@/components/ui";
import { TicketCard } from "./TicketCard";
import { SyncButton } from "./SyncButton";
import { useThemeFreshness } from "@/hooks/useThemeFreshness";
import type { ThemeWindow } from "@/hooks/useThemeFreshness";
import { guestBackend, type GuestWallet } from "@/lib/backend";
import { DEMO } from "@/lib/mode";
import type { PublicEvent } from "@/lib/types";

/**
 * 3. WALLET — "2× Free Drink, 1× Pizza Slice".
 *    Counts come from the off-chain ledger (instant, includes optimistic redemptions);
 *    the chip shows whether the on-chain ERC-1155 balance has caught up.
 */
export function WalletDashboard({
  event,
  guestName,
  remaining,
  onchainTotal,
  wallet,
  theme,
}: {
  event: PublicEvent;
  guestName: string;
  remaining: Record<string, number>;
  onchainTotal: number | undefined;
  wallet: GuestWallet;
  /** cached Visual 2FA payload (current + next slot, clock offset) — only used to detect staleness */
  theme: ThemeWindow;
}) {
  guestBackend.useBackgroundSync(event.id, wallet);
  const { stale } = useThemeFreshness(theme);

  const total = Object.values(remaining).reduce((a, b) => a + b, 0);
  const synced = DEMO || (onchainTotal !== undefined && onchainTotal === total);

  return (
    <Shell
      right={
        stale ? (
          <Pill tone="bad">● offline · color expired</Pill>
        ) : (
          <Pill tone={synced ? "ok" : "warn"}>
            {DEMO ? "● demo chain" : onchainTotal === undefined ? "● loading chain" : synced ? "● on-chain" : "● syncing"}
          </Pill>
        )
      }
    >
      <div className="space-y-2 pb-6 pt-6">
        <Kicker>{event.name}</Kicker>
        <H1>
          {guestName.split(" ")[0]}&apos;s
          <br />
          <span className="text-tomato">tickets</span>
        </H1>
      </div>

      <div className="space-y-4">
        {event.ticketTypes.map((t, i) => (
          <TicketCard key={t.tokenId} eventId={event.id} t={t} remaining={remaining[t.tokenId] ?? 0} index={i} />
        ))}
      </div>

      {stale && (
        <p className="mt-6 border-l-4 border-cheese bg-cheese/10 px-3 py-2 text-sm">
          You lost signal, so tonight&apos;s color is out of date and the bar can&apos;t verify you. Find Wi-Fi or signal,
          then sync.
        </p>
      )}

      <div className="mt-auto flex flex-col items-center gap-4 pt-10">
        <p className="text-center font-mono text-[11px] uppercase leading-relaxed tracking-widest text-mute">
          Hand your phone to the bartender.
          <br />
          They hold — you drink. Tickets can&apos;t be transferred.
        </p>
        <SyncButton eventId={event.id} urgent={stale} />
      </div>
    </Shell>
  );
}
