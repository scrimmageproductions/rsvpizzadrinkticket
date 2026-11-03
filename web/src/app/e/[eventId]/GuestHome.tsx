"use client";

import { useState } from "react";
import { GuestGate, type GuestCtx } from "@/components/guest/GuestGate";
import { ClaimScreen } from "@/components/guest/ClaimScreen";
import { WalletDashboard } from "@/components/guest/WalletDashboard";
import { Splash } from "@/components/Splash";
import { guestBackend } from "@/lib/backend";

export function GuestHome({ eventId }: { eventId: string }) {
  return <GuestGate eventId={eventId}>{(ctx) => <Home {...ctx} />}</GuestGate>;
}

/**
 * Claim vs Wallet is decided in ONE place. The Claim screen stays mounted while its mint is
 * in flight and during its celebration (`busy`), even though the server already reports
 * "claimed" once the voucher is signed. Afterwards we switch when the chain says it's minted.
 */
function Home({ me, wallet }: GuestCtx) {
  const { status, event } = me;
  const claimed = status.state === "claimed";
  const mint = guestBackend.useMintStatus(wallet, event, status.claimId, claimed);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<"claim" | "wallet" | null>(null);

  const decided = busy
    ? "claim"
    : !claimed
      ? "claim"
      : mint.minted === true
        ? "wallet"
        : mint.minted === false
          ? "claim"
          : null;
  if (decided && decided !== last) setLast(decided); // render-phase state adjustment
  const view = decided ?? last; // sticky while the on-chain read is (re)loading

  if (!view) return <Splash />;
  if (view === "claim") {
    return (
      <ClaimScreen
        event={event}
        guestName={status.name}
        checkedIn={status.state !== "rsvpd"}
        wallet={wallet}
        resume={claimed}
        onBusyChange={setBusy}
      />
    );
  }
  return (
    <WalletDashboard
      event={event}
      guestName={status.name}
      remaining={status.remaining}
      onchainTotal={mint.onchainTotal}
      wallet={wallet}
      theme={me}
      recent={me.recentRedemptions}
    />
  );
}
