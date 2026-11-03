import type { GuestStatus, HostGuest, HostSettings, PreArrivalResult, PublicEvent, TicketType } from "@/lib/types";
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
  /** Visual 2FA color for the current slot (only once tickets are claimed). */
  theme: ResolvedTheme | null;
  /** The following slot in auto-rotate mode (null in manual mode). */
  themeNext: ResolvedTheme | null;
  /**
   * serverTime − device time, in ms. Add to Date.now() before picking a theme so a guest whose
   * phone clock is wrong still shows the bartender's color. Measured at the RTT midpoint.
   */
  clockOffset: number;
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

export type InviteInfo = {
  name: string;
  email: string | null;
  phone: string | null;
  /** Demo Mode logs the guest straight in from the link. Live: login is pre-filled, code auto-sent. */
  loggedIn: boolean;
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
  /** Manual "↻ Sync connection": hard refetch of /me (theme + balances) with a loading state. */
  useSync(eventId: string): { sync: () => void; syncing: boolean };
  /** Door flows that arrive via URL params (?kiosk=…, ?invite=…). */
  useDoor(eventId: string): {
    /** Exchange the 30 s kiosk code for a 10-minute presence pass (works before login). */
    kioskPresence: (code: string) => Promise<string>;
    /** Logged in: redeem the pass → RSVP becomes checked_in. Throws Error(userMessage). */
    kioskCheckin: (presence: string) => Promise<{ name: string }>;
    resolveInvite: (token: string) => Promise<InviteInfo>;
  };
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
  /** Door screen: current rotating kiosk code (polls; null when kiosk mode is off). */
  useKioskCode(eventId: string, enabled: boolean): { data?: { code: string; expiresAt: number }; error?: string };
  useHostActions(eventId: string): {
    setCheckedIn: (rsvpId: string, checkedIn: boolean) => Promise<void>;
    saveSettings: (patch: Partial<HostSettings>) => Promise<void>;
    /** Host Vouch for `amount` tickets of one type in a single gesture. */
    adminRedeem: (rsvpId: string, tokenId: number, amount: number) => AdminRedeemHandle;
    /** Pre-arrival links for every rsvpd + unclaimed guest. */
    sendPreArrivalLinks: () => Promise<PreArrivalResult>;
    /** Wingman Transfer — throws Error(userMessage) if rejected. */
    transfer: (t: TransferInput) => Promise<void>;
  };
}
