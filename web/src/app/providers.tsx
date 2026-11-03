"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { Suspense, useState, type ReactNode } from "react";
import { chain, rpcUrl } from "@/lib/chain";
import { DEMO } from "@/lib/mode";
import { DemoDock } from "@/components/DemoDock";

/** Read-only wagmi config: on-chain balances for the guest's smart account. Writes go through ERC-4337. */
const wagmiConfig = createConfig({
  chains: [chain],
  transports: { [chain.id]: http(rpcUrl) },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } } }),
  );

  const inner = (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
    </QueryClientProvider>
  );

  // Demo Mode: no Privy at all — the mock backend handles "auth" (see lib/backend/demo.ts).
  if (DEMO)
    return (
      <>
        {inner}
        <Suspense fallback={null}>
          <DemoDock />
        </Suspense>
      </>
    );
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;

  return (
    <PrivyProvider
      appId={appId}
      config={{
        // Web2 login only. No seed phrases, no extensions.
        loginMethods: ["email", "sms", "google"],
        appearance: { theme: "dark", accentColor: "#FF4D1C", walletChainType: "ethereum-only" },
        // Every guest silently gets a non-custodial embedded EOA. It's only ever used as the
        // *owner/signer* of their ERC-4337 smart account — it never holds ETH (the paymaster pays gas on Base).
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          // No "confirm transaction" modal: the bartender tap must be instant.
          showWalletUIs: false,
        },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      {inner}
    </PrivyProvider>
  );
}
