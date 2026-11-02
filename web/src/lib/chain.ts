import type { Chain } from "viem";
import { avalanche, avalancheFuji } from "viem/chains";

/** Avalanche C-Chain (~1s finality). Use Fuji for testing. */
export const chain: Chain = process.env.NEXT_PUBLIC_CHAIN === "avalanche" ? avalanche : avalancheFuji;

export const TICKETS_ADDRESS = (process.env.NEXT_PUBLIC_TICKETS_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;

export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || chain.rpcUrls.default.http[0];

export const explorerTx = (hash: string) => `${chain.blockExplorers?.default.url ?? "https://snowtrace.io"}/tx/${hash}`;
