import "server-only";
import { db, type EventRow, type RsvpRow } from "./supabase";
import { HttpError, type Identity } from "./auth";
import type { GuestStatus, PublicEvent } from "@/lib/types";

export async function loadEvent(eventId: string): Promise<EventRow> {
  const { data, error } = await db().from("events").select("*").eq("id", eventId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "event_not_found");
  return data as EventRow;
}

export function toPublicEvent(e: EventRow): PublicEvent {
  return { id: e.id, name: e.name, venue: e.venue, startsAt: e.starts_at, ticketTypes: e.ticket_types };
}

/**
 * Find the RSVP that belongs to this Privy user: first by an already-bound privy_user_id,
 * otherwise by matching a verified email / phone from their Privy login, then bind it.
 */
export async function findRsvp(eventId: string, me: Identity): Promise<RsvpRow | null> {
  const bound = await db()
    .from("rsvps")
    .select("*")
    .eq("event_id", eventId)
    .eq("privy_user_id", me.userId)
    .maybeSingle();
  if (bound.error) throw bound.error;
  if (bound.data) return bound.data as RsvpRow;

  // Emails are stored lower-cased (see seed / sync), phones as E.164. Values are double-quoted
  // for PostgREST so dots / plus signs are literal.
  const q = (v: string) => `"${v.replace(/["\\]/g, "")}"`;
  const ors = [...me.emails.map((e) => `email.eq.${q(e)}`), ...me.phones.map((p) => `phone.eq.${q(p)}`)];
  if (!ors.length) return null;

  const { data, error } = await db()
    .from("rsvps")
    .select("*")
    .eq("event_id", eventId)
    .is("privy_user_id", null)
    .or(ors.join(","))
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // Bind (only if still unbound — avoids two accounts racing for one RSVP).
  const upd = await db()
    .from("rsvps")
    .update({ privy_user_id: me.userId })
    .eq("id", data.id)
    .is("privy_user_id", null)
    .select("*")
    .maybeSingle();
  if (upd.error) throw upd.error;
  return (upd.data as RsvpRow) ?? null;
}

export async function remainingFor(event: EventRow, rsvp: RsvpRow): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!rsvp.claimed_at) return out;
  const { data, error } = await db()
    .from("redemptions")
    .select("token_id, amount")
    .eq("rsvp_id", rsvp.id);
  if (error) throw error;
  for (const t of event.ticket_types) {
    const used = (data ?? [])
      .filter((r) => Number(r.token_id) === t.tokenId)
      .reduce((s, r) => s + r.amount, 0);
    out[t.tokenId] = Math.max(0, t.amount - used);
  }
  return out;
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
