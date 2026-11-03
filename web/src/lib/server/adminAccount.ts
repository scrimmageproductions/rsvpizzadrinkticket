import "server-only";
import { encodeFunctionData, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { chain, TICKETS_ADDRESS } from "@/lib/chain";
import { rsvpTicketsAbi } from "@/lib/abi";
import { publicClient } from "./chain";

/**
 * The host's override wallet: a SimpleAccount owned by ADMIN_PRIVATE_KEY, holding ADMIN_ROLE on
 * RsvpTickets. Its UserOps are sponsored by the same Pimlico paymaster, so Host Vouch and
 * Wingman Transfer are gasless too — no AVAX to top up on the server.
 */

const entryPoint = { address: entryPoint07Address, version: "0.7" } as const;
let clientPromise: ReturnType<typeof build> | null = null;

async function build() {
  const pk = process.env.ADMIN_PRIVATE_KEY as Hex | undefined;
  const key = process.env.PIMLICO_API_KEY;
  if (!pk || !key) throw new Error("ADMIN_PRIVATE_KEY / PIMLICO_API_KEY not set");
  const url = `https://api.pimlico.io/v2/${chain.id}/rpc?apikey=${key}`;
  const account = await toSimpleSmartAccount({ client: publicClient, owner: privateKeyToAccount(pk), entryPoint });
  const pimlico = createPimlicoClient({ chain, transport: http(url), entryPoint });
  const policy = process.env.PIMLICO_SPONSORSHIP_POLICY_ID;
  return createSmartAccountClient({
    account,
    chain,
    bundlerTransport: http(url),
    paymaster: pimlico,
    paymasterContext: policy ? { sponsorshipPolicyId: policy } : undefined,
    userOperation: { estimateFeesPerGas: async () => (await pimlico.getUserOperationGasPrice()).fast },
  });
}

const adminClient = () => (clientPromise ??= build());

/** Address to grant ADMIN_ROLE to (`npm run admin:address`). */
export async function adminSmartAccountAddress(): Promise<Address> {
  return (await adminClient()).account.address;
}

/** Host Vouch: burn one perk from a guest's wallet (ADMIN_ROLE). */
export async function adminRedeemOnChain(account: Address, tokenId: number, amount: number, onAccepted?: (h: Hex) => Promise<void>) {
  const data = encodeFunctionData({
    abi: rsvpTicketsAbi,
    functionName: "adminRedeem",
    args: [account, BigInt(tokenId), BigInt(amount)],
  });
  return sendTracked(data, onAccepted);
}

/** Wingman Transfer: move perks between two guests' wallets (ADMIN_ROLE). */
export async function adminTransferOnChain(from: Address, to: Address, tokenId: number, amount: number, onAccepted?: (h: Hex) => Promise<void>) {
  const data = encodeFunctionData({
    abi: rsvpTicketsAbi,
    functionName: "adminTransfer",
    args: [from, to, BigInt(tokenId), BigInt(amount)],
  });
  return sendTracked(data, onAccepted);
}

/** Submit an admin UserOp; `onAccepted` fires with the userOpHash as soon as the bundler takes it. */
async function sendTracked(data: Hex, onAccepted?: (h: Hex) => Promise<void>) {
  const client = await adminClient();
  const userOpHash = await client.sendUserOperation({ calls: [{ to: TICKETS_ADDRESS, value: 0n, data }] });
  await onAccepted?.(userOpHash);
  const receipt = await client.waitForUserOperationReceipt({ hash: userOpHash, timeout: 60_000 });
  if (!receipt.success) throw new Error(receipt.reason ?? "admin UserOperation reverted");
  return { userOpHash, txHash: receipt.receipt.transactionHash };
}
