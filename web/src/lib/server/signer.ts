import "server-only";
import { encodePacked, keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, TICKETS_ADDRESS } from "@/lib/chain";

/** Must match `EIP712("RsvPizzaTickets", "1")` and CLAIM_BATCH_TYPEHASH in RsvpTickets.sol. */
export const claimDomain = (chainId: number, verifyingContract: Hex) =>
  ({ name: "RsvPizzaTickets", version: "1", chainId, verifyingContract }) as const;

export const claimBatchTypes = {
  ClaimBatch: [
    { name: "to", type: "address" },
    { name: "ids", type: "uint256[]" },
    { name: "amounts", type: "uint256[]" },
    { name: "claimId", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** Vouchers are short-lived: the guest is standing in the venue right now. */
export const VOUCHER_TTL_SECONDS = 10 * 60;

/**
 * One claimId per RSVP. The contract burns it on first use, so the backend can safely
 * re-issue a voucher (e.g. the first UserOperation failed) without enabling a double mint.
 */
export function claimIdFor(eventId: string, rsvpId: string): Hex {
  return keccak256(encodePacked(["string", "string", "string"], ["rsv.pizza:claim", eventId, rsvpId]));
}

export async function signClaimBatch(params: {
  to: Hex;
  ids: bigint[];
  amounts: bigint[];
  claimId: Hex;
  deadline: bigint;
  chainId?: number;
  verifyingContract?: Hex;
}): Promise<Hex> {
  const pk = process.env.CLAIM_SIGNER_PRIVATE_KEY as Hex | undefined;
  if (!pk) throw new Error("CLAIM_SIGNER_PRIVATE_KEY not set");
  const signer = privateKeyToAccount(pk);

  return signer.signTypedData({
    domain: claimDomain(params.chainId ?? chain.id, params.verifyingContract ?? TICKETS_ADDRESS),
    types: claimBatchTypes,
    primaryType: "ClaimBatch",
    message: {
      to: params.to,
      ids: params.ids,
      amounts: params.amounts,
      claimId: params.claimId,
      deadline: params.deadline,
    },
  });
}
