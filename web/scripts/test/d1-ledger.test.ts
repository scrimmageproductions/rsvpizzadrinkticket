/**
 * Ledger + repository tests against a REAL local D1 (Miniflare), using the production migration.
 *   npm run test:db
 * Covers what the old Supabase/Postgres functions guaranteed: atomic double-spend protection,
 * idempotent retries, transfers, grants, claim snapshots, RSVP binding races.
 */
import { readFileSync, readdirSync } from "node:fs";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const results: [string, boolean, string][] = [];
const ok = (label: string, cond: boolean, extra = "") => results.push([label, cond, extra]);

/** Split a migration into statements (strip -- comments, split on ; at end of line). */
function statements(sql: string): string[] {
  return sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n")
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch() { return new Response('ok') } }",
      compatibilityDate: "2026-11-09",
      d1Databases: { DB: "test-db" }, // in-memory local D1 (same engine as `cf dev`)
    }),
  );
  const DB = await mf.getD1Database("DB");
  (globalThis as { __CF_ENV__?: Record<string, unknown> }).__CF_ENV__ = { DB };

  const migDir = new URL("../../migrations/", import.meta.url);
  for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
    for (const s of statements(readFileSync(new URL(f, migDir), "utf8"))) await DB.prepare(s).run();
  }
  for (const s of statements(readFileSync(new URL("../../d1/seed.sql", import.meta.url), "utf8"))) await DB.prepare(s).run();
  ok("migration + seed apply on D1", true);

  const repo = await import("../../src/lib/server/repo");
  const ledger = await import("../../src/lib/server/ledger");
  const EV = "pizza-night-nyc";
  const ADA = "8b6f1c1e-0000-4000-8000-000000000001";
  const SAT = "8b6f1c1e-0000-4000-8000-000000000002";
  const PEP = "8b6f1c1e-0000-4000-8000-000000000004";

  // ── events: JSON + boolean round trip
  const ev = (await repo.getEvent(EV))!;
  ok("event decoded (ticket_types JSON, kiosk bool, budget)", ev.ticket_types.length === 2 && ev.kiosk_enabled === false && ev.event_budget === 24);
  await repo.updateEvent(EV, { kiosk_enabled: true, kiosk_secret: "ab".repeat(32), theme_palette: ["hot-pink", "aqua-mint"] });
  const ev2 = (await repo.getEvent(EV))!;
  ok("updateEvent encodes bool + arrays", ev2.kiosk_enabled && ev2.theme_palette.join() === "hot-pink,aqua-mint");

  // ── RSVP binding: by email, then race between two Privy accounts for one RSVP
  const first = await repo.findRsvpForUser(EV, "privy:ada", ["ada@example.com"], []);
  ok("findRsvpForUser binds by email", first?.id === ADA && first.privy_user_id === "privy:ada");
  const again = await repo.findRsvpForUser(EV, "privy:ada", [], []);
  ok("…then finds it by bound user id", again?.id === ADA);
  const thief = await repo.findRsvpForUser(EV, "privy:imposter", ["ada@example.com"], []);
  ok("a second account can't take a bound RSVP", thief === null);
  const [r1, r2] = await Promise.all([
    repo.findRsvpForUser(EV, "privy:sat-a", ["satoshi@example.com"], []),
    repo.findRsvpForUser(EV, "privy:sat-b", ["satoshi@example.com"], []),
  ]);
  ok("parallel binding race → exactly one winner", [r1, r2].filter(Boolean).length === 1);
  const byPhone = await repo.findRsvpForUser(EV, "privy:marg", [], ["+15555550123"]);
  ok("binds by phone (E.164)", byPhone?.name === "Margherita Q.");

  // ── check-in + claim (bundle snapshot)
  ok("setCheckIn returns new state", (await repo.setCheckIn(EV, ADA, true, "door@x"))?.status === "checked_in");
  ok("setCheckIn on wrong event → null", (await repo.setCheckIn("other-event", ADA, true, "door@x")) === null);
  await repo.recordClaim(ADA, { wallet: "0xada", claimId: "0xc1", claimedAt: new Date().toISOString(), bundle: ledger.allocationOf(ev) });
  ok("claim: 2 drinks, 1 pizza", (await ledger.balanceOf(ADA, 1)) === 2 && (await ledger.balanceOf(ADA, 2)) === 1);
  await repo.updateEvent(EV, { ticket_types: [{ tokenId: 1, label: "Free Drink", emoji: "🍺", amount: 5 }, ...ev.ticket_types.slice(1)] });
  ok("snapshot: raising allocation to 5 doesn't change Ada's 2", (await ledger.balanceOf(ADA, 1)) === 2);
  await repo.recordClaim(ADA, { wallet: "0xada", claimId: "0xc1", claimedAt: new Date().toISOString(), bundle: [{ tokenId: 1, amount: 99 }] });
  ok("re-claim keeps the original snapshot (COALESCE)", (await ledger.balanceOf(ADA, 1)) === 2);

  // ── redemptions: unknown token / unclaimed / idempotent / insufficient
  const base = { eventId: EV, themeColor: "neon-green", source: "guest" as const };
  ok("unknown token rejected", !(await ledger.recordRedemption({ ...base, id: crypto.randomUUID(), rsvpId: ADA, tokenId: 99, amount: 1 })).ok);
  const unclaimed = await ledger.recordRedemption({ ...base, id: crypto.randomUUID(), rsvpId: PEP, tokenId: 1, amount: 1 });
  ok("unclaimed guest rejected", !unclaimed.ok && unclaimed.code === "not_claimed");
  const rid = crypto.randomUUID();
  const a = await ledger.recordRedemption({ ...base, id: rid, rsvpId: ADA, tokenId: 1, amount: 1 });
  const retry = await ledger.recordRedemption({ ...base, id: rid, rsvpId: ADA, tokenId: 1, amount: 1 });
  ok("redeem → 1 left; retry with same id is idempotent", a.ok && a.remaining === 1 && retry.ok && retry.remaining === 1);

  // ── THE double-spend race: 10 parallel redemptions (2 phones hammering), balance 1
  const race = await Promise.all(
    Array.from({ length: 10 }, () => ledger.recordRedemption({ ...base, id: crypto.randomUUID(), rsvpId: ADA, tokenId: 1, amount: 1 })),
  );
  const wins = race.filter((r) => r.ok).length;
  ok("10 parallel redemptions for the last drink → exactly 1 wins", wins === 1, `${wins} won`);
  ok("…the other 9 are insufficient_balance (→ VOID)", race.filter((r) => !r.ok && r.code === "insufficient_balance").length === 9);
  ok("balance never negative", (await ledger.balanceOf(ADA, 1)) === 0);

  // ── Host vouch counts against the same balance
  const vouch = await ledger.recordRedemption({ ...base, source: "admin", redeemedBy: "host@x", id: crypto.randomUUID(), rsvpId: ADA, tokenId: 2, amount: 1 });
  ok("host vouch redeems the pizza", vouch.ok && vouch.remaining === 0);

  // ── grants
  ok("grant to unclaimed guest → recipient_not_ready", (await ledger.recordGrant({ eventId: EV, rsvpId: PEP, tokenId: 1, amount: 1, reason: null, grantedBy: "h" })).ok === false);
  const g = await ledger.recordGrant({ eventId: EV, rsvpId: ADA, tokenId: 1, amount: 3, reason: "spilled", grantedBy: "h" });
  ok("grant 3 drinks", g.ok && (await ledger.balanceOf(ADA, 1)) === 3);
  const gBad = await ledger.recordGrant({ eventId: EV, rsvpId: ADA, tokenId: 42, amount: 1, reason: null, grantedBy: "h" });
  ok("grant of unknown token → unknown_token", !gBad.ok && gBad.code === "unknown_token");

  // ── transfers (Wingman): recipient must be checked in + claimed; balance enforced atomically
  await repo.setCheckIn(EV, PEP, true, "door@x");
  const tNotReady = await ledger.recordTransfer({ eventId: EV, fromRsvpId: ADA, toRsvpId: PEP, tokenId: 1, amount: 1, movedBy: "h" });
  ok("transfer to unclaimed guest → recipient_not_ready", !tNotReady.ok && tNotReady.code === "recipient_not_ready");
  await repo.recordClaim(PEP, { wallet: "0xpep", claimId: "0xc4", claimedAt: new Date().toISOString(), bundle: [{ tokenId: 1, amount: 5 }, { tokenId: 2, amount: 1 }] });
  ok("Pepper claimed AFTER the edit gets 5", (await ledger.balanceOf(PEP, 1)) === 5);
  const tSame = await ledger.recordTransfer({ eventId: EV, fromRsvpId: ADA, toRsvpId: ADA, tokenId: 1, amount: 1, movedBy: "h" });
  ok("transfer to self → same_guest", !tSame.ok && tSame.code === "same_guest");
  const tRace = await Promise.all(
    Array.from({ length: 6 }, () => ledger.recordTransfer({ eventId: EV, fromRsvpId: ADA, toRsvpId: PEP, tokenId: 1, amount: 1, movedBy: "h" })),
  );
  ok("6 parallel transfers of Ada's 3 drinks → exactly 3 succeed", tRace.filter((r) => r.ok).length === 3);
  ok("balances: Ada 0, Pepper 8", (await ledger.balanceOf(ADA, 1)) === 0 && (await ledger.balanceOf(PEP, 1)) === 8);

  // ── whole-event ledger matches the SQL balance; single-guest path matches too
  const rsvps = await repo.listRsvps(EV);
  const all = await ledger.ledgersFor((await repo.getEvent(EV))!, rsvps);
  const ada = all.get(ADA)!, pep = all.get(PEP)!;
  ok("ledgersFor (event): Ada minted 3 (2🍺+1🍕), granted 3, out 3, guest 2, admin 1", ada.minted === 3 && ada.granted === 3 && ada.transferredOut === 3 && ada.redeemedByGuest === 2 && ada.redeemedByAdmin === 1, JSON.stringify(ada));
  ok("ledgersFor (event): Pepper remaining 8 drinks, 1 pizza", pep.remaining[1] === 8 && pep.remaining[2] === 1);
  const solo = await ledger.ledgersFor((await repo.getEvent(EV))!, [rsvps.find((r) => r.id === PEP)!]);
  ok("ledgersFor (single guest path) == event path", JSON.stringify(solo.get(PEP)) === JSON.stringify(pep));

  // ── recent receipts, tokens in use, hashes
  const recent = await ledger.recentRedemptions(ADA);
  ok("recentRedemptions newest first, host vouch flagged", recent.length === 3 && recent.some((r) => r.byHost) && recent[0].at >= recent[recent.length - 1].at);
  const used = await ledger.tokensInUse(EV);
  ok("tokensInUse = {1, 2}", used.has(1) && used.has(2) && used.size === 2);
  await ledger.setRedemptionHashes(rid, { userOpHash: "0xop" });
  await ledger.setRedemptionHashes(rid, { txHash: "0xtx" }, "wrong-rsvp"); // scoped: must not apply
  const h = await ledger.getRedemptionHashes(EV, rid);
  ok("hash updates (and rsvp-scoped update can't touch others)", h?.user_op_hash === "0xop" && h?.tx_hash === null);

  // ── kiosk check-in + invites
  await repo.kioskCheckIn(SAT);
  const sat = (await repo.getRsvp(EV, SAT))!;
  ok("kiosk check-in marks checked_in_by = kiosk", sat.status === "checked_in" && sat.checked_in_by === "kiosk");
  await repo.recordInvite(SAT);
  await repo.recordInvite(SAT);
  ok("recordInvite increments", (await repo.getRsvp(EV, SAT))!.invite_count === 2);
  const targets = (await repo.listInviteTargets(EV)).map((r) => r.name);
  ok("listInviteTargets = only rsvpd + unclaimed (Margherita)", targets.join() === "Margherita Q.", targets.join());

  await mf.dispose();
  let failed = 0;
  for (const [l, c, x] of results) {
    console.log(`${c ? "✓" : "✗"} ${l}${x && !c ? `  (${x})` : ""}`);
    if (!c) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
