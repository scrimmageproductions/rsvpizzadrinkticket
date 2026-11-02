export type TicketType = {
  tokenId: number;
  label: string;
  emoji: string;
  amount: number;
};

export type PublicEvent = {
  id: string;
  name: string;
  venue: string | null;
  startsAt: string | null;
  ticketTypes: TicketType[];
};

export type GuestStatus =
  | { state: "not_on_list" }
  | {
      state: "rsvpd" | "checked_in" | "claimed";
      rsvpId: string;
      name: string;
      walletAddress: string | null;
      /** bytes32 claimId — `RsvpTickets.claimUsed(claimId)` tells us if the mint landed on-chain. */
      claimId: string | null;
      /** Off-chain ledger balances (entitled − redeemed) keyed by tokenId. */
      remaining: Record<string, number>;
    };

export type ClaimVoucher = {
  contract: `0x${string}`;
  chainId: number;
  to: `0x${string}`;
  ids: string[];
  amounts: string[];
  claimId: `0x${string}`;
  deadline: string;
  signature: `0x${string}`;
};

export type HostGuest = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: "rsvpd" | "checked_in";
  checkedInAt: string | null;
  claimedAt: string | null;
  walletAddress: string | null;
  redeemed: number;
};

export type HostSettings = {
  eventPin: string;
  themeMode: "manual" | "auto";
  themeColor: string;
  themePalette: string[];
  rotationMinutes: number;
};
