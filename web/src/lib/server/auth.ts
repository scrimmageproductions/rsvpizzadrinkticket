import "server-only";
import { PrivyClient } from "@privy-io/node";
import { getAddress, type Address } from "viem";

let privy: PrivyClient | null = null;
function client() {
  if (!privy) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) throw new Error("NEXT_PUBLIC_PRIVY_APP_ID / PRIVY_APP_SECRET not set");
    privy = new PrivyClient({ appId, appSecret });
  }
  return privy;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type Identity = {
  userId: string;
  emails: string[];
  phones: string[];
  /** Privy embedded (non-custodial) EOA — the owner/signer of the guest's ERC-4337 smart account. */
  embeddedWallet: Address | null;
};

const normEmail = (e: string) => e.trim().toLowerCase();
export const normPhone = (p: string) => p.replace(/[^\d+]/g, "");

// Tiny per-instance cache: the guest app polls, we don't want a Privy API call every 5s.
const cache = new Map<string, { at: number; identity: Identity }>();
const TTL_MS = 60_000;

/** Verifies the Privy access token in `Authorization: Bearer …` and resolves the user's linked accounts. */
export async function requireUser(req: Request): Promise<Identity> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "unauthenticated");

  let userId: string;
  try {
    ({ user_id: userId } = await client().utils().auth().verifyAccessToken(token));
  } catch {
    throw new HttpError(401, "invalid_token");
  }

  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.identity;

  const user = await client().users()._get(userId);
  const identity: Identity = { userId, emails: [], phones: [], embeddedWallet: null };

  for (const acct of user.linked_accounts as unknown as Array<Record<string, unknown>>) {
    if (acct.type === "email" && typeof acct.address === "string") identity.emails.push(normEmail(acct.address));
    if (acct.type === "google_oauth" && typeof acct.email === "string") identity.emails.push(normEmail(acct.email));
    if (acct.type === "phone") {
      const n = (acct.phoneNumber ?? acct.number) as string | undefined;
      if (n) identity.phones.push(normPhone(n));
    }
    if (
      acct.type === "wallet" &&
      acct.wallet_client_type === "privy" &&
      acct.chain_type === "ethereum" &&
      typeof acct.address === "string"
    ) {
      identity.embeddedWallet = getAddress(acct.address);
    }
  }

  cache.set(userId, { at: Date.now(), identity });
  return identity;
}

/** Host + door staff: Privy login whose email is on the HOST_EMAILS allowlist. */
export async function requireHost(req: Request): Promise<Identity> {
  const me = await requireUser(req);
  const allow = (process.env.HOST_EMAILS ?? "")
    .split(",")
    .map((e) => normEmail(e))
    .filter(Boolean);
  if (!me.emails.some((e) => allow.includes(e))) throw new HttpError(403, "not_staff");
  return me;
}
