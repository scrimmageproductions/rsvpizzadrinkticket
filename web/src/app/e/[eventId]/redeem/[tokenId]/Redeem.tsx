"use client";

import { notFound } from "next/navigation";
import { GuestGate } from "@/components/guest/GuestGate";
import { RedeemScreen } from "@/components/guest/RedeemScreen";

export function Redeem({ eventId, tokenId }: { eventId: string; tokenId: number }) {
  return (
    <GuestGate eventId={eventId}>
      {({ me, wallet }) => {
        const ticket = me.event.ticketTypes.find((t) => t.tokenId === tokenId);
        if (!ticket) notFound();
        return (
          <RedeemScreen
            eventId={eventId}
            ticket={ticket}
            remaining={me.status.remaining[tokenId] ?? 0}
            guestName={me.status.name}
            wallet={wallet}
            theme={me}
          />
        );
      }}
    </GuestGate>
  );
}
