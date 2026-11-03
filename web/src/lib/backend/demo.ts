"use client";

import { useCallback } from "react";
import { keccak256, toHex } from "viem";
import { demoDB, fakeHash, sleep, useDemoDB, useDemoGuestSession, useDemoStaffSession, type DemoDB, type DemoGuest } from "@/lib/demo/store";
import { useNow } from "@/hooks/useNow";
import { resolveTheme, type ResolvedTheme } from "@/lib/theme";
import type { GuestStatus, HostGuest, PublicEvent } from "@/lib/types";
import type { AdminRedeemHandle, GuestBackend, HostBackend, RedeemOutcome, TransferInput } from "./types";

/**
 * Demo Mode backend: same contract as live.ts, but every "server" and "chain" step is simulated
 * against the localStorage mock DB, with realistic delays so the pitch feels like the real thing.
 */

const themeOf = (db: DemoDB, now: number): ResolvedTheme =>
  resolveTheme(
    {
      theme_mode: db.event.themeMode,
      theme_color: db.event.themeColor,
      theme_palette: db.event.themePalette,
      rotation_minutes: db.event.rotationMinutes,
    },
    now,
  );

const toPublicEvent = (db: DemoDB, id: string): PublicEvent => ({
  id,
  name: db.event.name,
  venue: db.event.venue,
  startsAt: db.event.startsAt,
  ticketTypes: db.event.ticketTypes,
});

/** Per-token ledger for one guest: minted + transfers in − transfers out − redeemed (guest + admin). */
export function ledgerOf(db: DemoDB, g: DemoGuest) {
  const per = db.event.ticketTypes.map((t) => {
    const minted = g.claimedAt ? t.amount : 0;
    const tin = db.transfers.filter((x) => x.to === g.id && x.tokenId === t.tokenId).reduce((a, x) => a + x.amount, 0);
    const tout = db.transfers.filter((x) => x.from === g.id && x.tokenId === t.tokenId).reduce((a, x) => a + x.amount, 0);
    const byGuest = g.redeemed[t.tokenId] ?? 0;
    const byAdmin = g.adminRedeemed?.[t.tokenId] ?? 0;
    return { tokenId: t.tokenId, minted, tin, tout, byGuest, byAdmin, left: Math.max(0, minted + tin - tout - byGuest - byAdmin) };
  });
  const sum = (k: keyof (typeof per)[number]) => per.reduce((a, x) => a + (x[k] as number), 0);
  return {
    remaining: Object.fromEntries(per.map((x) => [x.tokenId, x.left])) as Record<string, number>,
    minted: sum("minted"),
    redeemedByGuest: sum("byGuest"),
    redeemedByAdmin: sum("byAdmin"),
    transferredIn: sum("tin"),
    transferredOut: sum("tout"),
  };
}

const remainingOf = (db: DemoDB, g: DemoGuest): Record<string, number> => (g.claimedAt ? ledgerOf(db, g).remaining : {});

const findGuest = (db: DemoDB | null, id: string | null | undefined) => (id ? db?.guests.find((g) => g.id === id) : undefined);

/** Demo login: any email / phone works. Unknown identities are added to the list as walk-in RSVPs. */
export function demoLogin(identifier: string): string {
  const raw = identifier.trim();
  const isEmail = raw.includes("@");
  const email = isEmail ? raw.toLowerCase() : null;
  const phone = isEmail ? null : raw.replace(/[^\d+]/g, "");
  const digits = (p: string | null) => (p ?? "").replace(/\D/g, "");
  let id = demoDB
    .get()
    .guests.find((g) => (email && g.email === email) || (phone && digits(g.phone) && digits(g.phone) === digits(phone)))?.id;

  if (!id) {
    id = `walkin-${Date.now().toString(36)}`;
    const name = email
      ? email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : `Guest ${digits(phone).slice(-4) || "????"}`;
    const newId = id;
    demoDB.update((db) => ({
      ...db,
      guests: [
        { id: newId, name, email, phone, status: "rsvpd", checkedInAt: null, claimedAt: null, redeemed: {}, adminRedeemed: {} },
        ...db.guests,
      ],
    }));
  }
  demoDB.setGuestSession(id);
  return id;
}

// ═════════════════════════════════════════════════════════════ guest

export const demoGuest: GuestBackend = {
  useSession() {
    const db = useDemoDB();
    const session = useDemoGuestSession();
    return {
      ready: db !== null && session !== undefined,
      authenticated: !!findGuest(db, session),
      logout: () => demoDB.setGuestSession(null),
    };
  },

  usePublicEvent(eventId) {
    const db = useDemoDB();
    return db ? toPublicEvent(db, eventId) : undefined;
  },

  useMe(eventId) {
    const db = useDemoDB();
    const g = findGuest(db, useDemoGuestSession());
    const now = useNow(1000);
    if (!db || !g || now === null) return { data: undefined, isError: false, refetch: () => {} };
    const status: GuestStatus = {
      state: g.claimedAt ? "claimed" : g.status,
      rsvpId: g.id,
      name: g.name,
      walletAddress: null,
      claimId: g.claimedAt ? keccak256(toHex(`demo:${g.id}`)) : null,
      remaining: remainingOf(db, g),
    };
    return {
      data: { event: toPublicEvent(db, eventId), status, theme: g.claimedAt ? themeOf(db, now) : null },
      isError: false,
      refetch: () => {},
    };
  },

  useWallet() {
    const id = useDemoGuestSession();
    return {
      ready: true,
      address: id ? (keccak256(toHex(`wallet:${id}`)).slice(0, 42) as `0x${string}`) : undefined,
      sa: null,
    };
  },

  useClaim() {
    const session = useDemoGuestSession();
    return useCallback(
      async (pin, onPhase) => {
        onPhase("verifying");
        await sleep(600);
        const db = demoDB.get();
        const g = findGuest(db, session);
        if (!g) throw new Error("We couldn't find your RSVP for this event.");
        // Layer 1: door check-in
        if (g.status !== "checked_in") throw new Error("Check in with the door staff first.");
        // Layer 2: venue PIN
        if (pin.trim().toUpperCase() !== db.event.pin.toUpperCase()) {
          throw new Error("That PIN doesn't match. Look for the sign in the venue.");
        }
        onPhase("minting");
        await sleep(2000); // simulated gasless mint on Avalanche
        demoDB.update((d) => ({
          ...d,
          guests: d.guests.map((x) => (x.id === g.id ? { ...x, claimedAt: x.claimedAt ?? new Date().toISOString() } : x)),
        }));
      },
      [session],
    );
  },

  useAfterClaim() {
    return useCallback(() => {}, []);
  },

  useMintStatus(_wallet, event, _claimId, claimed) {
    return { minted: claimed, onchainTotal: undefined };
  },

  useBackgroundSync() {},

  useRefreshMe() {
    return useCallback(() => {}, []);
  },

  useRedeem() {
    const session = useDemoGuestSession();
    return useCallback(
      (tokenId: number, opts?: { forceConflict?: boolean }) => {
        const db = demoDB.get();
        const g = findGuest(db, session);
        if (!g?.claimedAt) return { theme: null, outcome: Promise.resolve({ verdict: "offline" } as RedeemOutcome), burn: () => {} };
        const theme = themeOf(db, Date.now());

        // Simulated server ledger: ~120 ms round trip, then an atomic check-and-increment.
        const outcome: Promise<RedeemOutcome> = sleep(120).then(() => {
          const fresh = demoDB.get();
          const me = findGuest(fresh, session);
          const left = me ? ledgerOf(fresh, me).remaining[tokenId] ?? 0 : 0;
          const used = me?.redeemed[tokenId] ?? 0;
          if (opts?.forceConflict || !me || left < 1) return { verdict: "void", code: "insufficient_balance" };
          demoDB.update((d) => ({
            ...d,
            guests: d.guests.map((x) => (x.id === me.id ? { ...x, redeemed: { ...x.redeemed, [tokenId]: used + 1 } } : x)),
          }));
          return { verdict: "ok", theme: themeOf(fresh, Date.now()) };
        });

        return {
          theme,
          outcome,
          burn: (onState) => {
            // Simulated ERC-4337 burn: submit → bundler accepts → mined.
            onState({ phase: "submitting" });
            setTimeout(() => onState({ phase: "pending", userOpHash: fakeHash() }), 500);
            setTimeout(() => onState({ phase: "confirmed", txHash: fakeHash(), simulated: true }), 1800);
          },
        };
      },
      [session],
    );
  },
};

// ═════════════════════════════════════════════════════════════ host

export const demoHost: HostBackend = {
  useStaffSession() {
    const staff = useDemoStaffSession();
    return {
      ready: staff !== undefined,
      authenticated: !!staff,
      login: () => demoDB.setStaffSession(true),
      logout: () => demoDB.setStaffSession(false),
    };
  },

  useHostSettings() {
    const db = useDemoDB();
    const now = useNow(1000);
    if (!db || now === null) return {};
    const e = db.event;
    return {
      data: {
        eventName: e.name,
        settings: {
          eventPin: e.pin,
          themeMode: e.themeMode,
          themeColor: e.themeColor,
          themePalette: e.themePalette,
          rotationMinutes: e.rotationMinutes,
        },
        theme: themeOf(db, now),
        ticketTypes: e.ticketTypes,
      },
    };
  },

  useHostGuests() {
    const db = useDemoDB();
    if (!db) return { isLoading: true };
    const guests: HostGuest[] = db.guests.map((g) => {
      const l = ledgerOf(db, g);
      return {
        id: g.id,
        name: g.name,
        email: g.email,
        phone: g.phone,
        status: g.status,
        checkedInAt: g.checkedInAt,
        claimedAt: g.claimedAt,
        walletAddress: g.claimedAt ? keccak256(toHex(`wallet:${g.id}`)).slice(0, 42) : null,
        redeemed: l.redeemedByGuest + l.redeemedByAdmin,
        ...l,
      };
    });
    return { data: guests, isLoading: false };
  },

  useHostActions() {
    const setCheckedIn = useCallback(async (rsvpId: string, checkedIn: boolean) => {
      demoDB.update((d) => ({
        ...d,
        guests: d.guests.map((g) =>
          g.id === rsvpId
            ? { ...g, status: checkedIn ? "checked_in" : "rsvpd", checkedInAt: checkedIn ? new Date().toISOString() : null }
            : g,
        ),
      }));
    }, []);
    const saveSettings = useCallback(async (p: Parameters<ReturnType<HostBackend["useHostActions"]>["saveSettings"]>[0]) => {
      await sleep(150);
      demoDB.update((d) => ({
        ...d,
        event: {
          ...d.event,
          ...(p.eventPin !== undefined && { pin: p.eventPin.toUpperCase() }),
          ...(p.themeMode !== undefined && { themeMode: p.themeMode }),
          ...(p.themeColor !== undefined && { themeColor: p.themeColor as DemoDB["event"]["themeColor"] }),
          ...(p.themePalette !== undefined && { themePalette: p.themePalette as DemoDB["event"]["themePalette"] }),
          ...(p.rotationMinutes !== undefined && { rotationMinutes: p.rotationMinutes }),
        },
      }));
    }, []);

    /** Host Vouch: same ledger check as a guest redemption, flagged as admin, simulated server-side burn. */
    const adminRedeem = useCallback((rsvpId: string, tokenId: number): AdminRedeemHandle => {
      const outcome: Promise<RedeemOutcome> = sleep(120).then(() => {
        const db = demoDB.get();
        const g = db.guests.find((x) => x.id === rsvpId);
        if (!g?.claimedAt || (ledgerOf(db, g).remaining[tokenId] ?? 0) < 1) {
          return { verdict: "void", code: "insufficient_balance" };
        }
        demoDB.update((d) => ({
          ...d,
          guests: d.guests.map((x) =>
            x.id === rsvpId
              ? { ...x, adminRedeemed: { ...x.adminRedeemed, [tokenId]: (x.adminRedeemed?.[tokenId] ?? 0) + 1 } }
              : x,
          ),
        }));
        return { verdict: "ok", theme: themeOf(db, Date.now()) };
      });
      return {
        outcome,
        burn: (onState) => {
          onState({ phase: "submitting" });
          setTimeout(() => onState({ phase: "pending", userOpHash: fakeHash() }), 500);
          setTimeout(() => onState({ phase: "confirmed", txHash: fakeHash(), simulated: true }), 1800);
        },
      };
    }, []);

    /** Wingman Transfer: atomic move between two checked-in, claimed guests. */
    const transfer = useCallback(async ({ fromRsvpId, toRsvpId, tokenId, amount }: TransferInput) => {
      await sleep(900); // simulated admin UserOp
      const db = demoDB.get();
      const from = db.guests.find((g) => g.id === fromRsvpId);
      const to = db.guests.find((g) => g.id === toRsvpId);
      const err = transferError(db, from, to, tokenId, amount);
      if (err) throw new Error(err);
      demoDB.update((d) => ({
        ...d,
        transfers: [...d.transfers, { from: fromRsvpId, to: toRsvpId, tokenId, amount, at: new Date().toISOString() }],
      }));
    }, []);

    return { setCheckedIn, saveSettings, adminRedeem, transfer };
  },
};

function transferError(db: DemoDB, from: DemoGuest | undefined, to: DemoGuest | undefined, tokenId: number, amount: number) {
  if (!from || !to) return "Guest not found.";
  if (from.id === to.id) return "Pick a different guest.";
  if (to.status !== "checked_in") return `${to.name} isn't checked in.`;
  if (!to.claimedAt) return `${to.name} needs to claim their own tickets first (so they have a wallet).`;
  if (!Number.isInteger(amount) || amount < 1) return "Amount must be at least 1.";
  if ((ledgerOf(db, from).remaining[tokenId] ?? 0) < amount) return `${from.name} doesn't have that many left.`;
  return null;
}
