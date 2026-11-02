"use client";

import { useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import type { EIP1193Provider } from "viem";
import { chain } from "@/lib/chain";
import { createGuestSmartAccount, type GuestSmartAccount } from "@/lib/aa";

/** Builds (once per login) the guest's gasless smart-account client on top of their Privy embedded wallet. */
export function useSmartAccount() {
  const { authenticated, getAccessToken } = usePrivy();
  const { wallets, ready } = useWallets();
  const [built, setBuilt] = useState<{ owner: string; account: GuestSmartAccount } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const embedded = wallets.find((w) => w.walletClientType === "privy");
  const owner = authenticated && ready ? embedded?.address : undefined;

  useEffect(() => {
    if (!owner || !embedded) return;
    let cancelled = false;
    (async () => {
      try {
        await embedded.switchChain(chain.id);
        const provider = (await embedded.getEthereumProvider()) as EIP1193Provider;
        const account = await createGuestSmartAccount(provider, getAccessToken);
        if (!cancelled) setBuilt({ owner, account });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  // Only expose the client that belongs to the currently logged-in owner.
  const smartAccount = built && built.owner === owner ? built.account : null;
  return { smartAccount, ownerAddress: owner, error };
}
