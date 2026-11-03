"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sendRedeem, type GuestSmartAccount } from "@/lib/aa";
import { burnQueue, type PendingBurn } from "@/lib/burnQueue";
import { invalidateOnchain, useApi } from "@/lib/api";

export type BurnState =
  | { phase: "submitting" }
  | { phase: "pending"; userOpHash: `0x${string}` }
  | { phase: "confirmed"; txHash: `0x${string}`; simulated?: boolean }
  | { phase: "queued"; error: string };

/**
 * Fire-and-forget gasless burn. Never awaited by the UI — the success screen is already up.
 */
export function useBurn(smartAccount: GuestSmartAccount | null) {
  const api = useApi();
  const qc = useQueryClient();

  const burn = useCallback(
    async (b: PendingBurn, onState?: (s: BurnState) => void) => {
      burnQueue.put(b);
      if (!smartAccount) {
        onState?.({ phase: "queued", error: "wallet not ready" });
        return;
      }
      let userOpHash = b.userOpHash;
      try {
        let receipt: Promise<`0x${string}`>;
        if (userOpHash) {
          // Already accepted by the bundler earlier: just wait for it, never double-send.
          receipt = smartAccount.client
            .waitForUserOperationReceipt({ hash: userOpHash, timeout: 60_000 })
            .then((r) => {
              if (!r.success) throw new Error(r.reason ?? "reverted");
              return r.receipt.transactionHash;
            });
        } else {
          onState?.({ phase: "submitting" });
          const sent = await sendRedeem(smartAccount, b.tokenId, b.amount);
          userOpHash = sent.userOpHash;
          receipt = sent.receipt;
          burnQueue.put({ ...b, userOpHash });
        }
        onState?.({ phase: "pending", userOpHash });
        api(`/api/events/${b.eventId}/redemptions`, {
          method: "PATCH",
          json: { redemptionId: b.redemptionId, userOpHash },
        }).catch(() => {});

        const txHash = await receipt;
        burnQueue.remove(b.redemptionId);
        onState?.({ phase: "confirmed", txHash });
        api(`/api/events/${b.eventId}/redemptions`, {
          method: "PATCH",
          json: { redemptionId: b.redemptionId, txHash },
        }).catch(() => {});
        invalidateOnchain(qc);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const attempts = (b.attempts ?? 0) + 1;
        // A burn that reverts for lack of balance will never succeed — the off-chain ledger
        // already voided it. Give up on that, or after a handful of transient failures.
        if (/InsufficientBalance|reverted/i.test(msg) || attempts >= 5) burnQueue.remove(b.redemptionId);
        else burnQueue.put({ ...b, attempts, userOpHash }); // keep hash → never double-send
        onState?.({ phase: "queued", error: msg });
      }
    },
    [smartAccount, api, qc],
  );

  return burn;
}

/** Drains any burns left over from a previous session (call on the wallet dashboard). */
export function useDrainBurnQueue(smartAccount: GuestSmartAccount | null, eventId: string) {
  const burn = useBurn(smartAccount);
  const ran = useRef(false);
  useEffect(() => {
    if (!smartAccount || ran.current) return;
    ran.current = true;
    for (const b of burnQueue.all().filter((x) => x.eventId === eventId)) void burn(b);
  }, [smartAccount, eventId, burn]);
}
