import "server-only";
import { d1, nowIso, placeholders, toEvent, toRsvp, type BundleItem, type EventRow, type RsvpRow } from "./d1";
import type { TicketType } from "@/lib/types";

/** Events + RSVPs on D1. All SQL lives here and in ledger.ts — routes never build queries. */

// ─────────────────────────────────────────────────────────── events

export async function getEvent(id: string): Promise<EventRow | null> {
  const row = await d1().prepare(`SELECT * FROM events WHERE id = ?1`).bind(id).first();
  return row ? toEvent(row) : null;
}

export type EventPatch = Partial<{
  event_pin: string;
  theme_mode: "manual" | "auto";
  theme_color: string;
  theme_palette: string[];
  rotation_minutes: number;
  kiosk_enabled: boolean;
  kiosk_secret: string;
  event_budget: number | null;
  ticket_types: TicketType[];
}>;

const EVENT_COLUMNS = new Set<keyof EventPatch>([
  "event_pin", "theme_mode", "theme_color", "theme_palette", "rotation_minutes",
  "kiosk_enabled", "kiosk_secret", "event_budget", "ticket_types",
]);

/** Encode app values for SQLite: arrays → JSON text, booleans → 0/1. */
const encode = (v: unknown) =>
  Array.isArray(v) ? JSON.stringify(v) : typeof v === "boolean" ? (v ? 1 : 0) : v === undefined ? null : v;

export async function updateEvent(id: string, patch: EventPatch): Promise<void> {
  const cols = (Object.keys(patch) as (keyof EventPatch)[]).filter((k) => EVENT_COLUMNS.has(k));
  if (!cols.length) return;
  const sets = cols.map((c, i) => `${c} = ?${i + 1}`);
  const args = cols.map((c) => encode(patch[c]));
  await d1()
    .prepare(`UPDATE events SET ${sets.join(", ")}, updated_at = ?${args.length + 1} WHERE id = ?${args.length + 2}`)
    .bind(...args, nowIso(), id)
    .run();
}

// ─────────────────────────────────────────────────────────── rsvps: reads

export async function getRsvp(eventId: string, id: string): Promise<RsvpRow | null> {
  const row = await d1().prepare(`SELECT * FROM rsvps WHERE id = ?1 AND event_id = ?2`).bind(id, eventId).first();
  return row ? toRsvp(row) : null;
}

export async function listRsvps(eventId: string): Promise<RsvpRow[]> {
  const { results } = await d1().prepare(`SELECT * FROM rsvps WHERE event_id = ?1 ORDER BY name`).bind(eventId).all();
  return results.map(toRsvp);
}

/** Pre-arrival link targets: RSVP'd, not checked in, not claimed. */
export async function listInviteTargets(eventId: string): Promise<RsvpRow[]> {
  const { results } = await d1()
    .prepare(`SELECT * FROM rsvps WHERE event_id = ?1 AND status = 'rsvpd' AND claimed_at IS NULL ORDER BY name`)
    .bind(eventId)
    .all();
  return results.map(toRsvp);
}

/**
 * The RSVP that belongs to this Privy user: first by an already-bound privy_user_id, otherwise by
 * a verified email / phone from their login — then bound, only if still unbound (two accounts
 * racing for one RSVP: exactly one UPDATE matches).
 */
export async function findRsvpForUser(
  eventId: string,
  userId: string,
  emails: string[],
  phones: string[],
): Promise<RsvpRow | null> {
  const db = d1();
  const bound = await db.prepare(`SELECT * FROM rsvps WHERE event_id = ?1 AND privy_user_id = ?2`).bind(eventId, userId).first();
  if (bound) return toRsvp(bound);
  if (!emails.length && !phones.length) return null;

  const conds: string[] = [];
  if (emails.length) conds.push(`email IN (${placeholders(emails.length)})`);
  if (phones.length) conds.push(`phone IN (${placeholders(phones.length)})`);
  const match = await db
    .prepare(`SELECT id FROM rsvps WHERE event_id = ? AND privy_user_id IS NULL AND (${conds.join(" OR ")}) LIMIT 1`)
    .bind(eventId, ...emails, ...phones)
    .first<{ id: string }>();
  if (!match) return null;

  const updated = await db
    .prepare(`UPDATE rsvps SET privy_user_id = ?1 WHERE id = ?2 AND privy_user_id IS NULL RETURNING *`)
    .bind(userId, match.id)
    .first();
  return updated ? toRsvp(updated) : null;
}

export async function getRsvpContact(eventId: string, id: string) {
  return d1()
    .prepare(`SELECT name, email, phone FROM rsvps WHERE id = ?1 AND event_id = ?2`)
    .bind(id, eventId)
    .first<{ name: string; email: string | null; phone: string | null }>();
}

// ─────────────────────────────────────────────────────────── rsvps: writes

export async function recordPinFailure(rsvpId: string): Promise<void> {
  await d1().prepare(`UPDATE rsvps SET pin_failures = pin_failures + 1 WHERE id = ?1`).bind(rsvpId).run();
}

/** Successful claim: bind the wallet, snapshot the bundle, reset PIN failures. */
export async function recordClaim(
  rsvpId: string,
  c: { wallet: string; claimId: string; claimedAt: string; bundle: BundleItem[] },
): Promise<void> {
  await d1()
    .prepare(
      `UPDATE rsvps SET wallet_address = ?1, claim_id = ?2, claimed_at = COALESCE(claimed_at, ?3),
              claimed_bundle = COALESCE(claimed_bundle, ?4), pin_failures = 0
        WHERE id = ?5`,
    )
    .bind(c.wallet, c.claimId, c.claimedAt, JSON.stringify(c.bundle), rsvpId)
    .run();
}

/** Door staff toggle (Layer 1). Returns the new state, or null if the RSVP isn't in this event. */
export async function setCheckIn(eventId: string, rsvpId: string, checkedIn: boolean, by: string | null) {
  const stmt = checkedIn
    ? d1()
        .prepare(
          `UPDATE rsvps SET status = 'checked_in', checked_in_at = ?1, checked_in_by = ?2
            WHERE id = ?3 AND event_id = ?4 RETURNING id, status, checked_in_at`,
        )
        .bind(nowIso(), by, rsvpId, eventId)
    : d1()
        .prepare(
          `UPDATE rsvps SET status = 'rsvpd', checked_in_at = NULL, checked_in_by = NULL
            WHERE id = ?1 AND event_id = ?2 RETURNING id, status, checked_in_at`,
        )
        .bind(rsvpId, eventId);
  return stmt.first<{ id: string; status: string; checked_in_at: string | null }>();
}

/** Kiosk self check-in (only flips rsvpd → checked_in). */
export async function kioskCheckIn(rsvpId: string): Promise<void> {
  await d1()
    .prepare(`UPDATE rsvps SET status = 'checked_in', checked_in_at = ?1, checked_in_by = 'kiosk' WHERE id = ?2 AND status = 'rsvpd'`)
    .bind(nowIso(), rsvpId)
    .run();
}

/** Bind a pre-created Privy user to an RSVP (only if still unbound). */
export async function bindPrivyUser(rsvpId: string, userId: string): Promise<void> {
  await d1().prepare(`UPDATE rsvps SET privy_user_id = ?1 WHERE id = ?2 AND privy_user_id IS NULL`).bind(userId, rsvpId).run();
}

export async function recordInvite(rsvpId: string): Promise<void> {
  await d1()
    .prepare(`UPDATE rsvps SET invited_at = ?1, invite_count = invite_count + 1 WHERE id = ?2`)
    .bind(nowIso(), rsvpId)
    .run();
}
