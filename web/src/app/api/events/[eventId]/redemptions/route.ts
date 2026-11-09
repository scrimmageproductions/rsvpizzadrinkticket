import { z } from "zod";
import { handler, json } from "@/lib/server/http";
import { HttpError, requireUser } from "@/lib/server/auth";
import { findRsvp, loadEvent } from "@/lib/server/guests";
import { recordRedemption, setRedemptionHashes } from "@/lib/server/ledger";
import { resolveTheme } from "@/lib/theme";

const Create = z.object({
  redemptionId: z.string().uuid(),
  tokenId: z.number().int().nonnegative(),
  amount: z.number().int().positive().max(10).default(1),
});

const Attach = z.object({
  redemptionId: z.string().uuid(),
  userOpHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
});

/**
 * Called the instant the bartender taps REDEEM — in parallel with (not after) the on-chain burn.
 * The client has ALREADY rendered the success screen; this is the real-time double-spend guard.
 * If it answers 409 the guest's screen flips to VOID in front of the bartender.
 */
export const POST = handler(async (req, ctx: RouteContext<"/api/events/[eventId]/redemptions">) => {
  const { eventId } = await ctx.params;
  const me = await requireUser(req);
  const body = Create.parse(await req.json());

  const event = await loadEvent(eventId);
  const rsvp = await findRsvp(eventId, me);
  if (!rsvp?.claimed_at) throw new HttpError(403, "not_claimed");

  const theme = resolveTheme(event);
  // Atomic check-and-insert on D1 (lib/server/ledger.ts) — the real-time double-spend guard.
  const r = await recordRedemption({
    id: body.redemptionId,
    eventId,
    rsvpId: rsvp.id,
    tokenId: body.tokenId,
    amount: body.amount,
    themeColor: theme.key,
    source: "guest",
  });
  if (!r.ok) return json({ error: r.code, theme }, { status: 409 });
  return json({ remaining: r.remaining, theme });
});

/** Background: attach the UserOperation / tx hash once the bundler accepts / mines the burn. */
export const PATCH = handler(async (req, ctx: RouteContext<"/api/events/[eventId]/redemptions">) => {
  const { eventId } = await ctx.params;
  const me = await requireUser(req);
  const body = Attach.parse(await req.json());
  const rsvp = await findRsvp(eventId, me);
  if (!rsvp) throw new HttpError(403, "not_on_list");

  await setRedemptionHashes(body.redemptionId, { userOpHash: body.userOpHash, txHash: body.txHash }, rsvp.id);
  return json({ ok: true });
});
