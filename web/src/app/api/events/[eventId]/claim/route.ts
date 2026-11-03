import { createHash, timingSafeEqual } from "node:crypto";
import { getAddress, isAddressEqual } from "viem";
import { z } from "zod";
import { handler, json } from "@/lib/server/http";
import { HttpError, requireUser } from "@/lib/server/auth";
import { allocationOf, findRsvp, loadEvent } from "@/lib/server/guests";
import { db } from "@/lib/server/supabase";
import { claimIdFor, signClaimBatch, VOUCHER_TTL_SECONDS } from "@/lib/server/signer";
import { expectedSmartAccount } from "@/lib/server/chain";
import { chain, TICKETS_ADDRESS } from "@/lib/chain";
import type { ClaimVoucher } from "@/lib/types";

const Body = z.object({
  pin: z.string().trim().min(1).max(32),
  smartAccount: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

const MAX_PIN_FAILURES = 8;

const sameSecret = (a: string, b: string) => {
  // Hash first so lengths always match and timingSafeEqual can't leak the PIN length.
  const h = (s: string) => createHash("sha256").update(s.trim().toUpperCase()).digest();
  return timingSafeEqual(h(a), h(b));
};

/**
 * Dual-Layer Gated Minting.
 *   Layer 1 (physical presence, staff-verified): rsvps.status === 'checked_in' (door staff toggled it).
 *   Layer 2 (physical presence, guest-verified): submitted PIN === the PIN on the sign in the venue.
 * Only if both hold do we sign an EIP-712 voucher; RsvpTickets.claimTicketsBatch refuses to mint without it.
 */
export const POST = handler(async (req, ctx: RouteContext<"/api/events/[eventId]/claim">) => {
  const { eventId } = await ctx.params;
  const me = await requireUser(req);
  const body = Body.parse(await req.json());

  const event = await loadEvent(eventId);
  const rsvp = await findRsvp(eventId, me);
  if (!rsvp) throw new HttpError(403, "not_on_list", "We couldn't find your RSVP for this event.");

  // ── Layer 1: door check-in
  if (rsvp.status !== "checked_in") {
    throw new HttpError(403, "not_checked_in", "Check in with the door staff first.");
  }

  // ── Layer 2: venue PIN (with brute-force lockout)
  if (rsvp.pin_failures >= MAX_PIN_FAILURES) {
    throw new HttpError(429, "pin_locked", "Too many wrong PINs — ask the door staff for help.");
  }
  if (!sameSecret(body.pin, event.event_pin)) {
    await db().from("rsvps").update({ pin_failures: rsvp.pin_failures + 1 }).eq("id", rsvp.id);
    throw new HttpError(403, "wrong_pin", "That PIN doesn't match. Look for the sign in the venue.");
  }

  // ── Wallet binding: the voucher can only go to the smart account owned by THIS user's
  //    Privy embedded wallet, and an RSVP binds to exactly one wallet forever.
  if (!me.embeddedWallet) throw new HttpError(409, "no_wallet", "Wallet still being created — try again.");
  const expected = await expectedSmartAccount(me.embeddedWallet);
  if (!isAddressEqual(expected, getAddress(body.smartAccount))) {
    throw new HttpError(400, "wallet_mismatch", "Smart account does not belong to this login.");
  }
  if (rsvp.wallet_address && !isAddressEqual(rsvp.wallet_address as `0x${string}`, expected)) {
    throw new HttpError(409, "wallet_already_bound");
  }

  // ── Sign. claimId is fixed per RSVP, so re-issuing (e.g. after a failed UserOp) is safe:
  //    the contract marks it used on first mint.
  const claimId = claimIdFor(event.id, rsvp.id);
  // Snapshot the allocation on first claim; a re-issued voucher reuses it, so editing ticket
  // types mid-event never changes what an already-claiming guest gets (or what the ledger thinks).
  const bundle = rsvp.claimed_bundle ?? allocationOf(event);
  if (!bundle.length) throw new HttpError(409, "no_tickets", "No tickets are being handed out right now.");
  const ids = bundle.map((b) => BigInt(b.tokenId));
  const amounts = bundle.map((b) => BigInt(b.amount));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + VOUCHER_TTL_SECONDS);
  const signature = await signClaimBatch({ to: expected, ids, amounts, claimId, deadline });

  const { error } = await db()
    .from("rsvps")
    .update({
      wallet_address: expected,
      claim_id: claimId,
      claimed_at: rsvp.claimed_at ?? new Date().toISOString(),
      claimed_bundle: bundle,
      pin_failures: 0,
    })
    .eq("id", rsvp.id);
  if (error) throw error;

  const voucher: ClaimVoucher = {
    contract: TICKETS_ADDRESS,
    chainId: chain.id,
    to: expected,
    ids: ids.map(String),
    amounts: amounts.map(String),
    claimId,
    deadline: deadline.toString(),
    signature,
  };
  return json({ voucher });
});
