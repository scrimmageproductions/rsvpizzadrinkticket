"use client";

import { useReadContracts } from "wagmi";
import { rsvpTicketsAbi } from "@/lib/abi";
import { TICKETS_ADDRESS } from "@/lib/chain";
import type { PublicEvent } from "@/lib/types";

/** On-chain truth for the guest's smart account: perk balances + whether their claim voucher was used. */
export function useOnchainTickets(event: PublicEvent, address: `0x${string}` | undefined, claimId: string | null) {
  const q = useReadContracts({
    contracts: [
      {
        address: TICKETS_ADDRESS,
        abi: rsvpTicketsAbi,
        functionName: "balanceOfBatch",
        args: address
          ? [event.ticketTypes.map(() => address), event.ticketTypes.map((t) => BigInt(t.tokenId))]
          : undefined,
      },
      {
        address: TICKETS_ADDRESS,
        abi: rsvpTicketsAbi,
        functionName: "claimUsed",
        args: claimId ? [claimId as `0x${string}`] : undefined,
      },
    ],
    query: { enabled: !!address && !!claimId, refetchInterval: 6000 },
  });

  const [balances, claimed] = q.data ?? [];
  return {
    /** undefined while loading */
    minted: claimed?.status === "success" ? claimed.result : undefined,
    total: balances?.status === "success" ? balances.result.reduce((a, b) => a + Number(b), 0) : undefined,
  };
}
