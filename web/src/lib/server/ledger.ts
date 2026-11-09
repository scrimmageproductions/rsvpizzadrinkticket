import "server-only";
import { d1, type EventRow, type RsvpRow } from "./d1";

/**
 * Off-chain ticket ledger on D1.
 *
 * Postgres used plpgsql functions + advisory locks for the double-spend guard. D1 has neither,
 * but it executes statements serially per database, so each write below is ONE
 *   INSERT … SELECT … WHERE <balance check>
 * statement: the check and the write cannot be separated by another request (two phones racing
 * for the last drink → exactly one row lands; the other gets 0 changes → VOID).
 *
 * balance(rsvp, token) = claimed bundle + grants + transfers in − transfers out − redemptions.
 */

/** SQL for one guest's balance of one token. `r` and `t` are parameter placeholders (e.g. "?3"). */
const balanceSql = (r: string, t: string) => `(
  COALESCE((
    SELECT SUM(CAST(json_extract(b.value, '$.amount') AS INTEGER))
      FROM rsvps rs,
           json_each(COALESCE(rs.claimed_bundle, (
             -- claims made before bundles were snapshotted fall back to the event's allocation
             SELECT json_group_array(json(t2.value)) FROM events e2, json_each(e2.ticket_types) t2
              WHERE e2.id = rs.event_id AND CAST(json_extract(t2.value, '$.amount') AS INTEGER) > 0
           ))) b
     WHERE rs.id = ${r} AND rs.claimed_at IS NOT NULL
       AND CAST(json_extract(b.value, '$.tokenId') AS INTEGER) = ${t}), 0)
  + COALESCE((SELECT SUM(amount) FROM grants      WHERE rsvp_id      = ${r} AND token_id = ${t}), 0)
  + COALESCE((SELECT SUM(amount) FROM transfers   WHERE to_rsvp_id   = ${r} AND token_id = ${t}), 0)
  - COALESCE((SELECT SUM(amount) FROM transfers   WHERE from_rsvp_id = ${r} AND token_id = ${t}), 0)
  - COALESCE((SELECT SUM(amount) FROM redemptions WHERE rsvp_id      = ${r} AND token_id = ${t}), 0)
)`;

const tokenExistsSql = (e: string, t: string) =>
  `EXISTS (SELECT 1 FROM events ev, json_each(ev.ticket_types) tt
            WHERE ev.id = ${e} AND CAST(json_extract(tt.value, '$.tokenId') AS INTEGER) = ${t})`;

/** Recipient of a transfer / grant: claimed, so it has a wallet to mint to. */
const recipientReadySql = (e: string, r: string, requireCheckedIn: boolean) =>
  `EXISTS (SELECT 1 FROM rsvps rr WHERE rr.id = ${r} AND rr.event_id = ${e}
            AND rr.claimed_at IS NOT NULL AND rr.wallet_address IS NOT NULL
            ${requireCheckedIn ? "AND rr.status = 'checked_in'" : ""})`;

export async function balanceOf(rsvpId: string, tokenId: number): Promise<number> {
  const row = await d1()
    .prepare(`SELECT ${balanceSql("?1", "?2")} AS balance`)
    .bind(rsvpId, tokenId)
    .first<{ balance: number }>();
  return Number(row?.balance ?? 0);
}

export type LedgerError = "insufficient_balance" | "unknown_token" | "not_claimed" | "recipient_not_ready" | "same_guest";
export type LedgerResult<T> = ({ ok: true } & T) | { ok: false; code: LedgerError };

/**
 * Guest redemption or Host Vouch. Idempotent on `id` (client-generated): a retried request
 * returns the current balance instead of double-spending.
 */
export async function recordRedemption(p: {
  id: string;
  eventId: string;
  rsvpId: string;
  tokenId: number;
  amount: number;
  themeColor: string;
  source: "guest" | "admin";
  redeemedBy?: string | null;
}): Promise<LedgerResult<{ remaining: number }>> {
  const db = d1();
  const pre = await db
    .prepare(
      `SELECT ${tokenExistsSql("?1", "?3")} AS token_ok,
              EXISTS (SELECT 1 FROM rsvps WHERE id = ?2 AND event_id = ?1 AND claimed_at IS NOT NULL) AS claimed`,
    )
    .bind(p.eventId, p.rsvpId, p.tokenId)
    .first<{ token_ok: number; claimed: number }>();
  if (!pre?.token_ok) return { ok: false, code: "unknown_token" };
  if (!pre.claimed) return { ok: false, code: "not_claimed" };

  // The atomic check-and-insert.
  const res = await db
    .prepare(
      `INSERT INTO redemptions (id, event_id, rsvp_id, token_id, amount, theme_color, source, redeemed_by)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
        WHERE NOT EXISTS (SELECT 1 FROM redemptions WHERE id = ?1)
          AND ${balanceSql("?3", "?4")} >= ?5`,
    )
    .bind(p.id, p.eventId, p.rsvpId, p.tokenId, p.amount, p.themeColor, p.source, p.redeemedBy ?? null)
    .run();

  if (res.meta.changes === 0) {
    const existing = await db.prepare(`SELECT 1 AS x FROM redemptions WHERE id = ?1`).bind(p.id).first();
    if (!existing) return { ok: false, code: "insufficient_balance" };
    // idempotent retry of an already-recorded redemption → fall through and report the balance
  }
  return { ok: true, remaining: await balanceOf(p.rsvpId, p.tokenId) };
}

/** Wingman Transfer: move tickets between two guests of the same event. */
export async function recordTransfer(p: {
  eventId: string;
  fromRsvpId: string;
  toRsvpId: string;
  tokenId: number;
  amount: number;
  movedBy: string | null;
}): Promise<LedgerResult<{ id: string }>> {
  if (p.fromRsvpId === p.toRsvpId) return { ok: false, code: "same_guest" };
  const id = crypto.randomUUID();
  const db = d1();
  const res = await db
    .prepare(
      `INSERT INTO transfers (id, event_id, from_rsvp_id, to_rsvp_id, token_id, amount, moved_by)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
        WHERE ${recipientReadySql("?2", "?4", true)}
          AND ${balanceSql("?3", "?5")} >= ?6`,
    )
    .bind(id, p.eventId, p.fromRsvpId, p.toRsvpId, p.tokenId, p.amount, p.movedBy)
    .run();
  if (res.meta.changes === 1) return { ok: true, id };

  const why = await db
    .prepare(`SELECT ${recipientReadySql("?1", "?2", true)} AS ready`)
    .bind(p.eventId, p.toRsvpId)
    .first<{ ready: number }>();
  return { ok: false, code: why?.ready ? "insufficient_balance" : "recipient_not_ready" };
}

/** "Make It Right": credit extra tickets to a claimed guest. */
export async function recordGrant(p: {
  eventId: string;
  rsvpId: string;
  tokenId: number;
  amount: number;
  reason: string | null;
  grantedBy: string | null;
}): Promise<LedgerResult<{ id: string }>> {
  const id = crypto.randomUUID();
  const db = d1();
  const res = await db
    .prepare(
      `INSERT INTO grants (id, event_id, rsvp_id, token_id, amount, reason, granted_by)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
        WHERE ${tokenExistsSql("?2", "?4")}
          AND ${recipientReadySql("?2", "?3", false)}`,
    )
    .bind(id, p.eventId, p.rsvpId, p.tokenId, p.amount, p.reason, p.grantedBy)
    .run();
  if (res.meta.changes === 1) return { ok: true, id };

  const why = await db
    .prepare(`SELECT ${tokenExistsSql("?1", "?2")} AS token_ok`)
    .bind(p.eventId, p.tokenId)
    .first<{ token_ok: number }>();
  return { ok: false, code: why?.token_ok ? "recipient_not_ready" : "unknown_token" };
}

// ─────────────────────────────────────────────────────────── on-chain hash bookkeeping

type Hashes = { userOpHash?: string; txHash?: string };

async function setHashes(table: "redemptions" | "transfers" | "grants", id: string, h: Hashes, rsvpId?: string) {
  const sets: string[] = [];
  const args: unknown[] = [];
  const arg = (v: unknown) => {
    args.push(v);
    return `?${args.length}`;
  };
  if (h.userOpHash) sets.push(`user_op_hash = ${arg(h.userOpHash)}`);
  if (h.txHash) sets.push(`tx_hash = ${arg(h.txHash)}`);
  if (!sets.length) return;
  let where = `id = ${arg(id)}`;
  if (rsvpId) where += ` AND rsvp_id = ${arg(rsvpId)}`;
  await d1().prepare(`UPDATE ${table} SET ${sets.join(", ")} WHERE ${where}`).bind(...args).run();
}

export const setRedemptionHashes = (id: string, h: Hashes, rsvpId?: string) => setHashes("redemptions", id, h, rsvpId);
export const setTransferHashes = (id: string, h: Hashes) => setHashes("transfers", id, h);
export const setGrantHashes = (id: string, h: Hashes) => setHashes("grants", id, h);

export async function getRedemptionHashes(eventId: string, id: string) {
  return d1()
    .prepare(`SELECT user_op_hash, tx_hash FROM redemptions WHERE id = ?1 AND event_id = ?2`)
    .bind(id, eventId)
    .first<{ user_op_hash: string | null; tx_hash: string | null }>();
}

// ─────────────────────────────────────────────────────────── reads

export type Ledger = {
  remaining: Record<string, number>;
  minted: number;
  granted: number;
  redeemedByGuest: number;
  redeemedByAdmin: number;
  transferredIn: number;
  transferredOut: number;
};

/** The bundle a guest actually claimed (falls back to the event allocation for legacy rows). */
export function bundleOf(event: EventRow, r: RsvpRow): { tokenId: number; amount: number }[] {
  if (!r.claimed_at) return [];
  if (r.claimed_bundle) return r.claimed_bundle;
  return allocationOf(event);
}

/** Allocation handed out at check-in for NEW claims (zero-amount types are skipped). */
export const allocationOf = (event: EventRow) =>
  event.ticket_types.filter((t) => t.amount > 0).map((t) => ({ tokenId: t.tokenId, amount: t.amount }));

/**
 * Whole-event ledger in three queries (event-scoped, so no IN-list parameter limits).
 * Same math as balanceSql, computed in JS for the host dashboard / CSV.
 */
export async function ledgersFor(event: EventRow, rsvps: RsvpRow[]): Promise<Map<string, Ledger>> {
  const out = new Map<string, Ledger>();
  if (!rsvps.length) return out;
  const db = d1();
  // One guest (the /me poll, every few seconds per phone) → only that guest's rows, via indexes.
  const one = rsvps.length === 1 ? rsvps[0].id : null;
  const [red, tr, gr] = await db.batch<Record<string, unknown>>(
    one
      ? [
          db.prepare(`SELECT rsvp_id, token_id, amount, source FROM redemptions WHERE rsvp_id = ?1`).bind(one),
          db.prepare(
            `SELECT from_rsvp_id, to_rsvp_id, token_id, amount FROM transfers WHERE from_rsvp_id = ?1 OR to_rsvp_id = ?1`,
          ).bind(one),
          db.prepare(`SELECT rsvp_id, token_id, amount FROM grants WHERE rsvp_id = ?1`).bind(one),
        ]
      : [
          db.prepare(`SELECT rsvp_id, token_id, amount, source FROM redemptions WHERE event_id = ?1`).bind(event.id),
          db.prepare(`SELECT from_rsvp_id, to_rsvp_id, token_id, amount FROM transfers WHERE event_id = ?1`).bind(event.id),
          db.prepare(`SELECT rsvp_id, token_id, amount FROM grants WHERE event_id = ?1`).bind(event.id),
        ],
  );
  const R = red.results, T = tr.results, G = gr.results;
  const n = (v: unknown) => Number(v);

  for (const r of rsvps) {
    const l: Ledger = { remaining: {}, minted: 0, granted: 0, redeemedByGuest: 0, redeemedByAdmin: 0, transferredIn: 0, transferredOut: 0 };
    const bundle = bundleOf(event, r);
    for (const t of event.ticket_types) {
      const minted = bundle.find((b) => b.tokenId === t.tokenId)?.amount ?? 0;
      const sum = (rows: Record<string, unknown>[], match: (x: Record<string, unknown>) => boolean) =>
        rows.filter((x) => n(x.token_id) === t.tokenId && match(x)).reduce((a, x) => a + n(x.amount), 0);
      const granted = sum(G, (x) => x.rsvp_id === r.id);
      const byGuest = sum(R, (x) => x.rsvp_id === r.id && x.source !== "admin");
      const byAdmin = sum(R, (x) => x.rsvp_id === r.id && x.source === "admin");
      const tin = sum(T, (x) => x.to_rsvp_id === r.id);
      const tout = sum(T, (x) => x.from_rsvp_id === r.id);
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

const RECENT_WINDOW_MS = 30 * 60_000;

/** Bartender safety net: this guest's redemptions in the last 30 min, newest first. */
export async function recentRedemptions(rsvpId: string) {
  const since = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
  const { results } = await d1()
    .prepare(
      `SELECT id, token_id, amount, source, created_at FROM redemptions
        WHERE rsvp_id = ?1 AND created_at >= ?2 ORDER BY created_at DESC LIMIT 20`,
    )
    .bind(rsvpId, since)
    .all<{ id: string; token_id: number; amount: number; source: string; created_at: string }>();
  return results.map((r) => ({
    id: r.id,
    tokenId: Number(r.token_id),
    amount: Number(r.amount),
    at: r.created_at,
    byHost: r.source === "admin",
  }));
}

/** Token ids any guest holds or has held (claimed bundle, grants, transfers) — can't be deleted. */
export async function tokensInUse(eventId: string): Promise<Set<number>> {
  const db = d1();
  const [bundles, other] = await db.batch<{ token_id: number }>([
    db.prepare(
      `SELECT DISTINCT CAST(json_extract(b.value, '$.tokenId') AS INTEGER) AS token_id
         FROM rsvps r, json_each(COALESCE(r.claimed_bundle, '[]')) b
        WHERE r.event_id = ?1 AND r.claimed_at IS NOT NULL AND CAST(json_extract(b.value, '$.amount') AS INTEGER) > 0`,
    ).bind(eventId),
    db.prepare(
      `SELECT token_id FROM grants WHERE event_id = ?1 UNION SELECT token_id FROM transfers WHERE event_id = ?1`,
    ).bind(eventId),
  ]);
  return new Set([...bundles.results, ...other.results].map((x) => Number(x.token_id)));
}
