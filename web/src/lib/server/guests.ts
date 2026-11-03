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

export type Ledger = {
  remaining: Record<string, number>;
  minted: number;
  granted: number;
  redeemedByGuest: number;
  redeemedByAdmin: number;
  transferredIn: number;
  transferredOut: number;
};

/**
 * Off-chain ledger per RSVP: minted (on claim) + transfers in − transfers out − redemptions
 * (guest + admin). Mirrors SQL `ticket_balance()`; this version batches a whole event.
 */
export async function ledgersFor(event: EventRow, rsvps: RsvpRow[]): Promise<Map<string, Ledger>> {
  const ids = rsvps.map((r) => r.id);
  const out = new Map<string, Ledger>();
  if (!ids.length) return out;
  const [red, tr, gr] = await Promise.all([
    db().from("redemptions").select("rsvp_id, token_id, amount, source").eq("event_id", event.id).in("rsvp_id", ids),
    db().from("transfers").select("from_rsvp_id, to_rsvp_id, token_id, amount").eq("event_id", event.id),
    db().from("grants").select("rsvp_id, token_id, amount").eq("event_id", event.id).in("rsvp_id", ids),
  ]);
  if (red.error) throw red.error;
  if (tr.error) throw tr.error;
  if (gr.error) throw gr.error;

  for (const r of rsvps) {
    const l: Ledger = {
      remaining: {}, minted: 0, granted: 0, redeemedByGuest: 0, redeemedByAdmin: 0, transferredIn: 0, transferredOut: 0,
    };
    const bundle = bundleOf(event, r);
    for (const t of event.ticket_types) {
      // What THIS guest minted at claim time — not today's (editable) config.
      const minted = bundle.find((b) => b.tokenId === t.tokenId)?.amount ?? 0;
      const granted = (gr.data ?? []).filter((x) => x.rsvp_id === r.id && Number(x.token_id) === t.tokenId).reduce((a, x) => a + x.amount, 0);
      const mine = (red.data ?? []).filter((x) => x.rsvp_id === r.id && Number(x.token_id) === t.tokenId);
      const byGuest = mine.filter((x) => x.source !== "admin").reduce((a, x) => a + x.amount, 0);
      const byAdmin = mine.filter((x) => x.source === "admin").reduce((a, x) => a + x.amount, 0);
      const tin = (tr.data ?? []).filter((x) => x.to_rsvp_id === r.id && Number(x.token_id) === t.tokenId).reduce((a, x) => a + x.amount, 0);
      const tout = (tr.data ?? []).filter((x) => x.from_rsvp_id === r.id && Number(x.token_id) === t.tokenId).reduce((a, x) => a + x.amount, 0);
      l.remaining[t.tokenId] = Math.max(0, minted + granted + tin - tout - byGuest - byAdmin);
      l.minted += minted;
      l.granted += granted;
      l.redeemedByGuest += byGuest;
      l.redeemedByAdmin += byAdmin;
      l.transferredIn += tin;
      l.transferredOut += tout;
    }
    out.set(r.id, l);
  }
  return out;
}

/** The bundle a guest actually claimed. Pre-0004 claims fall back to the event's config. */
export function bundleOf(event: EventRow, r: RsvpRow): { tokenId: number; amount: number }[] {
  if (!r.claimed_at) return [];
  if (r.claimed_bundle) return r.claimed_bundle.map((b) => ({ tokenId: Number(b.tokenId), amount: Number(b.amount) }));
  return event.ticket_types.filter((t) => t.amount > 0).map((t) => ({ tokenId: t.tokenId, amount: t.amount }));
}

/** Allocation handed out at check-in for NEW claims (zero-amount types are skipped). */
export const allocationOf = (event: EventRow) =>
  event.ticket_types.filter((t) => t.amount > 0).map((t) => ({ tokenId: t.tokenId, amount: t.amount }));

const RECENT_WINDOW_MS = 30 * 60_000;

/** Bartender safety net: this guest's redemptions in the last 30 min, newest first. */
export async function recentRedemptions(rsvpId: string) {
  const since = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
  const { data, error } = await db()
    .from("redemptions")
    .select("id, token_id, amount, source, created_at")
    .eq("rsvp_id", rsvpId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    tokenId: Number(r.token_id),
    amount: r.amount as number,
    at: r.created_at as string,
    byHost: r.source === "admin",
  }));
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
