import type { Chain } from "viem";
import { base, baseSepolia } from "viem/chains";

/**
 * Base (Coinbase's OP-stack L2): ~2 s blocks, cents-or-less gas. Use Base Sepolia for testing.
 *
 * Everything chain-specific keys off this one object:
 *   • Pimlico bundler + paymaster URLs  → https://api.pimlico.io/v2/${chain.id}/rpc  (8453 / 84532)
 *   • EIP-712 voucher domain chainId    → must equal the contract's block.chainid
 *   • Privy `defaultChain` / `supportedChains` and the wagmi read config
 *
 * The 2 s block time is invisible to guests and bartenders: the success screen renders from the
 * off-chain ledger instantly; UserOperations confirm in the background.
 */
export const CHAINS = { base, baseSepolia } as const;
export type ChainName = keyof typeof CHAINS;

const requested = process.env.NEXT_PUBLIC_CHAIN;
if (requested && !(requested in CHAINS) && typeof window === "undefined") {
  // e.g. a leftover "avalanche" / "avalancheFuji" from before the Base migration
  console.warn(`[chain] Unknown NEXT_PUBLIC_CHAIN="${requested}" — falling back to baseSepolia. Use "base" or "baseSepolia".`);
}

export const chain: Chain = requested === "base" ? base : baseSepolia;

export const TICKETS_ADDRESS = (process.env.NEXT_PUBLIC_TICKETS_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;

/** Public RPCs are rate-limited — set NEXT_PUBLIC_RPC_URL (Alchemy / QuickNode / Coinbase CDP) in production. */
export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || chain.rpcUrls.default.http[0];

/** basescan.org (mainnet) or sepolia.basescan.org (testnet). */
export const explorerUrl = chain.blockExplorers?.default.url ?? (chain.id === base.id ? "https://basescan.org" : "https://sepolia.basescan.org");

export const explorerTx = (hash: string) => `${explorerUrl}/tx/${hash}`;

/** Human label for UI copy ("burning ticket on Base…"). */
export const chainLabel = chain.id === base.id ? "Base" : "Base Sepolia";
