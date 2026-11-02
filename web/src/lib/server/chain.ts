import "server-only";
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { chain, rpcUrl } from "@/lib/chain";

export const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

/** eth-infinitism SimpleAccountFactory for EntryPoint v0.7 (same address permissionless uses). */
export const SIMPLE_ACCOUNT_FACTORY_V07: Address = "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985";
export const ENTRY_POINT = entryPoint07Address;

const factoryAbi = parseAbi(["function getAddress(address owner, uint256 salt) view returns (address)"]);

/**
 * Counterfactual smart-account address owned by `owner` (index 0).
 * Lets the backend prove the wallet a voucher is minted to really belongs to the logged-in guest,
 * instead of trusting an address sent from the browser.
 */
export function expectedSmartAccount(owner: Address): Promise<Address> {
  return publicClient.readContract({
    address: SIMPLE_ACCOUNT_FACTORY_V07,
    abi: factoryAbi,
    functionName: "getAddress",
    args: [owner, 0n],
  });
}
