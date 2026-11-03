import type { GuestStatus, HostGuest, HostSettings, PublicEvent, TicketType } from "@/lib/types";
import type { ResolvedTheme } from "@/lib/theme";
import type { GuestSmartAccount } from "@/lib/aa";
import type { BurnState } from "@/hooks/useBurn";

/**
 * The UI talks only to these hooks. Two implementations:
 *   live.ts — Privy auth, Next.js API routes (Supabase), ERC-4337 via Pimlico, Avalanche
 *   demo.ts — localStorage mock DB, simulated mint / ledger / burn
 */

export type MeResponse = {
  event: PublicEvent;
  status: GuestStatus;
  theme: ResolvedTheme | null;
};

export type GuestWallet = {
  /** true once the wallet can send (live: smart-account client built). */
  ready: boolean;
  address?: `0x${string}`;
  /** live only */
  sa: GuestSmartAccount | null;
};

export type ClaimPhase = "verifying" | "minting";

export type RedeemOutcome =
  | { verdict: "ok"; theme: ResolvedTheme }
  | { verdict: "void"; code: string }
  | { verdict: "offline" };

export type RedeemHandle = {
  /** Theme to paint THIS frame — already in memory, no network. null = can't redeem yet. */
  theme: ResolvedTheme | null;
  /** Double-spend check (server ledger / mock ledger). */
  outcome: Promise<RedeemOutcome>;
  /** Kick off the on-chain (or simulated) burn. Only call after outcome is not "void". */
  burn: (onState: (s: BurnState) => void) => void;
};

export interface GuestBackend {
  useSession(): { ready: boolean; authenticated: boolean; logout: () => void };
  usePublicEvent(eventId: string): PublicEvent | undefined;
  useMe(eventId: string): { data?: MeResponse; isError: boolean; refetch: () => void };
  useWallet(): GuestWallet;
  /** Resolves when the tickets are minted; throws Error(userMessage) on rejection. */
  useClaim(eventId: string, wallet: GuestWallet): (pin: string, onPhase: (p: ClaimPhase) => void) => Promise<void>;
  /** Called after the success animation so the wallet view picks up the new state. */
  useAfterClaim(eventId: string): () => void;
  useMintStatus(wallet: GuestWallet, event: PublicEvent, claimId: string | null, claimed: boolean): {
    minted: boolean | undefined;
    onchainTotal: number | undefined;
  };
  useBackgroundSync(eventId: string, wallet: GuestWallet): void;
  useRedeem(eventId: string, wallet: GuestWallet): (tokenId: number, opts?: { forceConflict?: boolean }) => RedeemHandle;
  useRefreshMe(eventId: string): () => void;
}

export type HostSettingsData = {
  eventName: string;
  settings: HostSettings;
  theme: ResolvedTheme;
  ticketTypes: TicketType[];
};

/** Host Vouch: admin burns on a guest's behalf (dead phone). Theme comes from the host's own settings feed. */
export type AdminRedeemHandle = {
  outcome: Promise<RedeemOutcome>;
  burn: (onState: (s: BurnState) => void) => void;
};

export type TransferInput = { fromRsvpId: string; toRsvpId: string; tokenId: number; amount: number };

export interface HostBackend {
  useStaffSession(): { ready: boolean; authenticated: boolean; login: () => void; logout: () => void };
  useHostSettings(eventId: string): { data?: HostSettingsData; error?: { forbidden: boolean; message: string } };
  useHostGuests(eventId: string): { data?: HostGuest[]; isLoading: boolean };
  useHostActions(eventId: string): {
    setCheckedIn: (rsvpId: string, checkedIn: boolean) => Promise<void>;
    saveSettings: (patch: Partial<HostSettings>) => Promise<void>;
    adminRedeem: (rsvpId: string, tokenId: number) => AdminRedeemHandle;
    /** Wingman Transfer — throws Error(userMessage) if rejected. */
    transfer: (t: TransferInput) => Promise<void>;
  };
}
