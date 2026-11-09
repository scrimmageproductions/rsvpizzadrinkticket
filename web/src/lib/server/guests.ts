import "server-only";
import { HttpError, type Identity } from "./auth";
import { findRsvpForUser, getEvent } from "./repo";
import { ledgersFor } from "./ledger";
import type { EventRow, RsvpRow } from "./d1";
import type { GuestStatus, PublicEvent } from "@/lib/types";

export { allocationOf, bundleOf, ledgersFor, recentRedemptions, type Ledger } from "./ledger";

export async function loadEvent(eventId: string): Promise<EventRow> {
  const event = await getEvent(eventId);
  if (!event) throw new HttpError(404, "event_not_found");
  return event;
}

export function toPublicEvent(e: EventRow): PublicEvent {
  return { id: e.id, name: e.name, venue: e.venue, startsAt: e.starts_at, ticketTypes: e.ticket_types };
}

/** The RSVP for this Privy login (by bound user id, else verified email / phone — then bound). */
export function findRsvp(eventId: string, me: Identity): Promise<RsvpRow | null> {
  return findRsvpForUser(eventId, me.userId, me.emails, me.phones);
}

export async function remainingFor(event: EventRow, rsvp: RsvpRow): Promise<Record<string, number>> {
  if (!rsvp.claimed_at) return {};
  return (await ledgersFor(event, [rsvp])).get(rsvp.id)!.remaining;
}

export async function guestStatus(event: EventRow, rsvp: RsvpRow | null): Promise<GuestStatus> {
  if (!rsvp) return { state: "not_on_list" };
  return {
    state: rsvp.claimed_at ? "claimed" : rsvp.status,
    rsvpId: rsvp.id,
    name: rsvp.name,
    walletAddress: rsvp.wallet_address,
    claimId: rsvp.claim_id,
    remaining: await remainingFor(event, rsvp),
  };
}
