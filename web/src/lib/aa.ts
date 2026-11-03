"use client";

import { createPublicClient, encodeFunctionData, http, type EIP1193Provider, type Hex } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { createSmartAccountClient, type SmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { chain, rpcUrl, TICKETS_ADDRESS } from "@/lib/chain";
import { rsvpTicketsAbi } from "@/lib/abi";
import type { ClaimVoucher } from "@/lib/types";

/**
 * Gasless transactions via ERC-4337 (EntryPoint v0.7).
 *
 *   Privy embedded EOA (owner, never funded)
 *        │ signs userOpHash
 *        ▼
 *   SimpleAccount (counterfactual, deployed on first UserOp)  ──holds──▶  RsvpTickets ERC-1155
 *        │ UserOperation
 *        ▼
 *   /api/aa  ──▶  Pimlico bundler + verifying paymaster (pays the ETH gas)  ──▶  Base
 */

const entryPoint = { address: entryPoint07Address, version: "0.7" } as const;

export type GuestSmartAccount = {
  address: Hex;
  client: SmartAccountClient;
};

export async function createGuestSmartAccount(
  owner: EIP1193Provider,
  getAccessToken: () => Promise<string | null>,
): Promise<GuestSmartAccount> {
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  const account = await toSimpleSmartAccount({ client: publicClient, owner, entryPoint });

  // Bundler + paymaster both go through our authenticated proxy (no API key in the browser).
  const aaTransport = http(`${window.location.origin}/api/aa`, {
    fetchFn: async (input, init) => {
      const headers = new Headers(init?.headers);
      const token = await getAccessToken();
      if (token) headers.set("authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
  });

  const pimlico = createPimlicoClient({ chain, transport: aaTransport, entryPoint });

  const client = createSmartAccountClient({
    account,
    chain,
    bundlerTransport: aaTransport,
    paymaster: pimlico, // ← sponsors 100% of gas
    userOperation: {
      estimateFeesPerGas: async () => (await pimlico.getUserOperationGasPrice()).fast,
    },
  });

  return { address: account.address, client: client as unknown as SmartAccountClient };
}

/** Mint the guest's perk bundle using the backend-signed EIP-712 voucher. */
export async function sendClaim(sa: GuestSmartAccount, v: ClaimVoucher) {
  const data = encodeFunctionData({
    abi: rsvpTicketsAbi,
    functionName: "claimTicketsBatch",
    args: [v.to, v.ids.map(BigInt), v.amounts.map(BigInt), v.claimId, BigInt(v.deadline), v.signature],
  });
  return sendSponsored(sa, data);
}

/** The bartender tap: burn (send to 0x…dEaD) one perk. */
export async function sendRedeem(sa: GuestSmartAccount, tokenId: number, amount = 1) {
  const data = encodeFunctionData({
    abi: rsvpTicketsAbi,
    functionName: "redeemTicket",
    args: [sa.address, BigInt(tokenId), BigInt(amount)],
  });
  return sendSponsored(sa, data);
}

/**
 * Submits the UserOperation and resolves as soon as the bundler accepts it (→ userOpHash),
 * exposing a second promise for the mined receipt. Callers that need speed only await the first.
 */
async function sendSponsored(sa: GuestSmartAccount, data: Hex) {
  const client = sa.client;
  const userOpHash = await client.sendUserOperation({
    account: client.account!,
    calls: [{ to: TICKETS_ADDRESS, value: 0n, data }],
  });
  const receipt = client
    .waitForUserOperationReceipt({ hash: userOpHash, timeout: 60_000 })
    .then((r) => {
      if (!r.success) throw new Error(r.reason ?? "UserOperation reverted");
      return r.receipt.transactionHash;
    });
  return { userOpHash, receipt };
}
