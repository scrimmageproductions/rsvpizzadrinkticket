"use client";

import { useState } from "react";
import { GuestGate, type GuestCtx } from "@/components/guest/GuestGate";
import { ClaimScreen } from "@/components/guest/ClaimScreen";
import { WalletDashboard } from "@/components/guest/WalletDashboard";
import { Splash } from "@/components/Splash";
import { useOnchainTickets } from "@/hooks/useOnchainTickets";

export function GuestHome({ eventId }: { eventId: string }) {
  return <GuestGate eventId={eventId}>{(ctx) => <Home {...ctx} />}</GuestGate>;
}

/**
 * Claim vs Wallet is decided in ONE place so the Claim screen stays mounted (same tree position)
 * while its mint UserOp is in flight — even though the server already reports "claimed" once the
 * voucher is signed. We only switch to the wallet when the chain says the voucher was used.
 */
function Home({ me, smartAccount }: GuestCtx) {
  const { status, event } = me;
  const onchain = useOnchainTickets(event, smartAccount?.address, status.claimId);
  const [last, setLast] = useState<"claim" | "wallet" | null>(null);

  const decided =
    status.state !== "claimed" ? "claim" : onchain.minted === true ? "wallet" : onchain.minted === false ? "claim" : null;
  if (decided && decided !== last) setLast(decided); // render-phase state adjustment
  const view = decided ?? last; // sticky while the on-chain read is (re)loading

  if (!view) return <Splash />;
  if (view === "claim") {
    return (
      <ClaimScreen
        event={event}
        guestName={status.name}
        checkedIn={status.state !== "rsvpd"}
        smartAccount={smartAccount}
        resume={status.state === "claimed"}
      />
    );
  }
  return (
    <WalletDashboard
      event={event}
      guestName={status.name}
      remaining={status.remaining}
      onchainTotal={onchain.total}
      smartAccount={smartAccount}
    />
  );
}
