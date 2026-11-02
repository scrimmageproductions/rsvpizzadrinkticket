import { decodeFunctionData, isAddressEqual, parseAbi, type Hex } from "viem";
import { handler, json } from "@/lib/server/http";
import { HttpError, requireUser } from "@/lib/server/auth";
import { chain, TICKETS_ADDRESS } from "@/lib/chain";

/**
 * ERC-4337 bundler + paymaster proxy (Pimlico).
 *
 * The browser's smart-account client points its bundler AND paymaster transports here, so:
 *   • the Pimlico API key never ships to the client,
 *   • only logged-in guests can request sponsorship,
 *   • we refuse to sponsor any UserOperation that calls anything other than RsvpTickets
 *     (defence in depth on top of the Pimlico sponsorship policy).
 */

const ALLOWED = new Set([
  "eth_chainId",
  "eth_supportedEntryPoints",
  "eth_estimateUserOperationGas",
  "eth_sendUserOperation",
  "eth_getUserOperationByHash",
  "eth_getUserOperationReceipt",
  "pimlico_getUserOperationGasPrice",
  "pimlico_getUserOperationStatus",
  "pm_getPaymasterStubData",
  "pm_getPaymasterData",
  "pm_validateSponsorshipPolicies",
]);

/** Methods that carry a UserOperation we might pay for. */
const SPONSORED = new Set(["pm_getPaymasterStubData", "pm_getPaymasterData", "eth_sendUserOperation"]);

const accountAbi = parseAbi([
  "function execute(address dest, uint256 value, bytes func)",
  "function executeBatch(address[] dest, uint256[] value, bytes[] func)",
  "function executeBatch(address[] dest, bytes[] func)",
]);

function assertOnlyTicketsContract(callData: Hex) {
  let targets: readonly Hex[];
  let values: readonly bigint[] = [];
  try {
    const { functionName, args } = decodeFunctionData({ abi: accountAbi, data: callData });
    if (functionName === "execute") {
      targets = [args[0]];
      values = [args[1]];
    } else if (args.length === 3) {
      targets = args[0];
      values = args[1];
    } else {
      targets = args[0];
    }
  } catch {
    throw new HttpError(403, "unsponsorable_calldata");
  }
  if (!targets.length || targets.some((t) => !isAddressEqual(t, TICKETS_ADDRESS)) || values.some((v) => v !== 0n)) {
    throw new HttpError(403, "unsponsorable_target");
  }
}

type RpcRequest = { jsonrpc: "2.0"; id: number | string; method: string; params?: unknown[] };

export const POST = handler(async (req) => {
  await requireUser(req);
  const key = process.env.PIMLICO_API_KEY;
  if (!key) throw new HttpError(500, "pimlico_not_configured");

  const payload = (await req.json()) as RpcRequest | RpcRequest[];
  const calls = Array.isArray(payload) ? payload : [payload];

  for (const call of calls) {
    if (!ALLOWED.has(call.method)) throw new HttpError(403, "method_not_allowed", call.method);

    if (SPONSORED.has(call.method)) {
      const userOp = call.params?.[0] as { callData?: Hex } | undefined;
      if (!userOp?.callData) throw new HttpError(400, "missing_user_operation");
      assertOnlyTicketsContract(userOp.callData);
    }

    // Pin our sponsorship policy server-side (pm_* params: [userOp, entryPoint, chainId, context]).
    const policy = process.env.PIMLICO_SPONSORSHIP_POLICY_ID;
    if (policy && call.method.startsWith("pm_getPaymaster") && call.params) {
      const ctx = (call.params[3] as Record<string, unknown> | undefined) ?? {};
      call.params[3] = { ...ctx, sponsorshipPolicyId: policy };
    }
  }

  const upstream = await fetch(`https://api.pimlico.io/v2/${chain.id}/rpc?apikey=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return json(await upstream.json(), { status: upstream.status });
});
