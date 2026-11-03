"use client";

import { useSyncExternalStore } from "react";
import { DEMO_EVENT_ID } from "@/lib/mode";
import type { TicketType } from "@/lib/types";
import type { ThemeKey } from "@/lib/theme";

/**
 * Mock database for Demo Mode, persisted in localStorage.
 * Every tab subscribes to the browser `storage` event, so changing the color in the Host tab
 * or checking someone in on the Door tab updates the Guest tab live — like the real backend.
 */

export type DemoGuest = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: "rsvpd" | "checked_in";
  checkedInAt: string | null;
  /** "door" (staff toggle) | "kiosk" (QR self check-in) */
  checkedInBy: string | null;
  invitedAt: string | null;
  claimedAt: string | null;
  /** tokenId → number redeemed by the guest at the bar */
  redeemed: Record<string, number>;
  /** tokenId → number redeemed by the host on the guest's behalf (Host Vouch) */
  adminRedeemed: Record<string, number>;
};

export type DemoTransfer = { from: string; to: string; tokenId: number; amount: number; at: string };

export type DemoEvent = {
  id: string;
  name: string;
  venue: string;
  startsAt: string;
  pin: string;
  themeMode: "manual" | "auto";
  themeColor: ThemeKey;
  themePalette: ThemeKey[];
  rotationMinutes: number;
  ticketTypes: TicketType[];
  /** Door QR on/off. The demo key itself is fixed per event (see demoKioskSecret). */
  kioskEnabled: boolean;
};

export type DemoDB = { version: 3; event: DemoEvent; guests: DemoGuest[]; transfers: DemoTransfer[] };

const DB_KEY = "rsvpizza:demo:db";
const GUEST_KEY = "rsvpizza:demo:guest-session";
const STAFF_KEY = "rsvpizza:demo:staff-session";

const guest = (id: string, name: string, email: string | null, phone: string | null, over: Partial<DemoGuest> = {}): DemoGuest => ({
  id, name, email, phone, status: "rsvpd", checkedInAt: null, checkedInBy: null, invitedAt: null,
  claimedAt: null, redeemed: {}, adminRedeemed: {}, ...over,
});

export function seed(): DemoDB {
  const t = new Date().toISOString();
  return {
    version: 3,
    event: {
      id: DEMO_EVENT_ID,
      name: "Global Pizza Party — NYC",
      venue: "Joe's Basement Bar, Brooklyn",
      startsAt: t,
      pin: "4209",
      themeMode: "manual",
      themeColor: "neon-green",
      themePalette: ["neon-green", "hot-pink", "electric-blue", "safety-orange", "ultra-violet"],
      rotationMinutes: 10,
      ticketTypes: [
        { tokenId: 1, label: "Free Drink", emoji: "🍺", amount: 2 },
        { tokenId: 2, label: "Pizza Slice", emoji: "🍕", amount: 1 },
      ],
      kioskEnabled: false,
    },
    guests: [
      guest("g1", "Ada Lovelace", "ada@example.com", null),
      guest("g2", "Satoshi Slice", "satoshi@example.com", null),
      guest("g3", "Margherita Quattro", null, "+15555550123"),
      guest("g4", "Pepper Roni", "pepper@example.com", null, { status: "checked_in", checkedInAt: t, checkedInBy: "door" }),
      guest("g5", "Cal Zone", "cal@example.com", null, {
        status: "checked_in", checkedInAt: t, checkedInBy: "door", claimedAt: t, redeemed: { "1": 1 },
      }),
      guest("g6", "Burrata Bell", "burrata@example.com", null),
      guest("g7", "Anchovy Andy", null, "+15555550188"),
      guest("g8", "Basil Hayden", "basil@example.com", null, {
        status: "checked_in", checkedInAt: t, checkedInBy: "door", claimedAt: t,
      }),
    ],
    transfers: [],
  };
}

// ── tiny external store ───────────────────────────────────────────────────────────────────
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function readKey<T>(key: string, fallback: () => T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    /* storage blocked */
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value: T;
  try {
    value = raw ? (JSON.parse(raw) as T) : fallback();
  } catch {
    value = fallback();
  }
  cache.set(key, { raw, value });
  return value;
}

function writeKey(key: string, value: unknown) {
  const raw = value === null ? null : JSON.stringify(value);
  try {
    if (raw === null) localStorage.removeItem(key);
    else localStorage.setItem(key, raw);
  } catch {
    /* storage blocked: keep in memory for this tab */
  }
  cache.set(key, { raw, value });
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key?.startsWith("rsvpizza:demo:") && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

const SEED = { current: null as DemoDB | null };
const getDB = () => {
  const db = readKey<DemoDB>(DB_KEY, () => (SEED.current ??= seed()));
  // Older demo data shape → start fresh.
  return db?.version === 3 ? db : (SEED.current ??= seed());
};

/** null during SSR / prerender → callers render a loading state. */
export function useDemoDB(): DemoDB | null {
  return useSyncExternalStore(subscribe, getDB, () => null);
}
export function useDemoGuestSession(): string | null | undefined {
  return useSyncExternalStore(subscribe, () => readKey<string | null>(GUEST_KEY, () => null), () => undefined);
}
export function useDemoStaffSession(): boolean | undefined {
  return useSyncExternalStore(subscribe, () => readKey<boolean>(STAFF_KEY, () => false), () => undefined);
}

// ── mutations (single-threaded in the browser = naturally atomic) ─────────────────────────
export const demoDB = {
  get: getDB,
  update(fn: (db: DemoDB) => DemoDB) {
    writeKey(DB_KEY, fn(structuredClone(getDB())));
  },
  reset() {
    SEED.current = null;
    writeKey(DB_KEY, seed());
    writeKey(GUEST_KEY, null);
    writeKey(STAFF_KEY, null);
  },
  setGuestSession(id: string | null) {
    writeKey(GUEST_KEY, id);
  },
  setStaffSession(on: boolean) {
    writeKey(STAFF_KEY, on || null);
  },
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const fakeHash = () =>
  `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
