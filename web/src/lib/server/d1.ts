import "server-only";
import { env } from "cloudflare:workers";
import type { TicketType } from "@/lib/types";

/**
 * Cloudflare D1 (SQLite) — the app's database, bound as `DB` in cloudflare.config.ts.
 * Only reachable from this Worker; there is no public endpoint and no anon key.
 */
export function d1(): D1Database {
  const db = (env as { DB?: D1Database }).DB;
  if (!db) throw new Error("D1 binding `DB` is missing — check cloudflare.config.ts");
  return db;
}

/** ISO-8601 UTC, the format every timestamp column uses (sortable, Date.parse-able). */
export const nowIso = () => new Date().toISOString();

// ─────────────────────────────────────────────────────────── row types (decoded)

export type BundleItem = { tokenId: number; amount: number };

export type EventRow = {
  id: string;
  name: string;
  venue: string | null;
  starts_at: string | null;
  event_pin: string;
  theme_mode: "manual" | "auto";
  theme_color: string;
  theme_palette: string[];
  rotation_minutes: number;
  ticket_types: TicketType[];
  kiosk_enabled: boolean;
  kiosk_secret: string | null;
  event_budget: number | null;
};

export type RsvpRow = {
  id: string;
  event_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: "rsvpd" | "checked_in";
  checked_in_at: string | null;
  checked_in_by: string | null;
  privy_user_id: string | null;
  wallet_address: string | null;
  claim_id: string | null;
  claimed_at: string | null;
  /** What this guest actually minted at claim time */
  claimed_bundle: BundleItem[] | null;
  pin_failures: number;
  invited_at: string | null;
  invite_count: number;
};

// ─────────────────────────────────────────────────────────── decoding (SQLite → app)

type Raw = Record<string, unknown>;

const json = <T>(v: unknown, fallback: T): T => {
  if (typeof v !== "string") return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};

export function toEvent(r: Raw): EventRow {
  return {
    id: r.id as string,
    name: r.name as string,
    venue: (r.venue as string) ?? null,
    starts_at: (r.starts_at as string) ?? null,
    event_pin: r.event_pin as string,
    theme_mode: r.theme_mode as EventRow["theme_mode"],
    theme_color: r.theme_color as string,
    theme_palette: json<string[]>(r.theme_palette, []),
    rotation_minutes: Number(r.rotation_minutes),
    ticket_types: json<TicketType[]>(r.ticket_types, []).map((t) => ({ ...t, tokenId: Number(t.tokenId), amount: Number(t.amount) })),
    kiosk_enabled: Number(r.kiosk_enabled) === 1,
    kiosk_secret: (r.kiosk_secret as string) ?? null,
    event_budget: r.event_budget === null || r.event_budget === undefined ? null : Number(r.event_budget),
  };
}

export function toRsvp(r: Raw): RsvpRow {
  return {
    id: r.id as string,
    event_id: r.event_id as string,
    name: r.name as string,
    email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null,
    status: r.status as RsvpRow["status"],
    checked_in_at: (r.checked_in_at as string) ?? null,
    checked_in_by: (r.checked_in_by as string) ?? null,
    privy_user_id: (r.privy_user_id as string) ?? null,
    wallet_address: (r.wallet_address as string) ?? null,
    claim_id: (r.claim_id as string) ?? null,
    claimed_at: (r.claimed_at as string) ?? null,
    claimed_bundle:
      r.claimed_bundle == null
        ? null
        : json<BundleItem[]>(r.claimed_bundle, []).map((b) => ({ tokenId: Number(b.tokenId), amount: Number(b.amount) })),
    pin_failures: Number(r.pin_failures ?? 0),
    invited_at: (r.invited_at as string) ?? null,
    invite_count: Number(r.invite_count ?? 0),
  };
}

/** `?, ?, ?` for an IN (...) list. */
export const placeholders = (n: number) => Array.from({ length: n }, () => "?").join(", ");
