"use client";

/**
 * Optimistic UI means the drink is poured BEFORE the burn is on-chain. If the background
 * UserOperation fails (flaky bar Wi-Fi, tab closed), the burn is persisted here and retried
 * the next time the wallet screen is open, so the chain eventually matches reality.
 */
export type PendingBurn = {
  redemptionId: string;
  eventId: string;
  tokenId: number;
  amount: number;
  /** Set once the bundler accepted it — never resend after that, only poll the receipt. */
  userOpHash?: `0x${string}`;
  attempts?: number;
  createdAt: number;
};

const KEY = "rsvpizza:pending-burns";

function read(): PendingBurn[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}
function write(list: PendingBurn[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode — best effort */
  }
}

export const burnQueue = {
  all: read,
  put(b: PendingBurn) {
    write([...read().filter((x) => x.redemptionId !== b.redemptionId), b]);
  },
  remove(id: string) {
    write(read().filter((x) => x.redemptionId !== id));
  },
};
