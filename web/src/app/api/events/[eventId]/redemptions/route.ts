import { z } from "zod";
import { handler, json } from "@/lib/server/http";
import { HttpError, requireUser } from "@/lib/server/auth";
import { findRsvp, loadEvent } from "@/lib/server/guests";
import { db } from "@/lib/server/supabase";
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
  const { data, error } = await db().rpc("record_redemption", {
    p_id: body.redemptionId,
    p_event_id: eventId,
    p_rsvp_id: rsvp.id,
    p_token_id: body.tokenId,
    p_amount: body.amount,
    p_theme_color: theme.key,
  });

  if (error) {
    const code = ["insufficient_balance", "unknown_token", "not_claimed"].find((c) => error.message.includes(c));
    if (code) return json({ error: code, theme }, { status: 409 });
    throw error;
  }
  return json({ remaining: data as number, theme });
});

/** Background: attach the UserOperation / tx hash once the bundler accepts / mines the burn. */
export const PATCH = handler(async (req, ctx: RouteContext<"/api/events/[eventId]/redemptions">) => {
  const { eventId } = await ctx.params;
  const me = await requireUser(req);
  const body = Attach.parse(await req.json());
  const rsvp = await findRsvp(eventId, me);
  if (!rsvp) throw new HttpError(403, "not_on_list");

  const patch: Record<string, string> = {};
  if (body.userOpHash) patch.user_op_hash = body.userOpHash;
  if (body.txHash) patch.tx_hash = body.txHash;
  const { error } = await db()
    .from("redemptions")
    .update(patch)
    .eq("id", body.redemptionId)
    .eq("rsvp_id", rsvp.id);
  if (error) throw error;
  return json({ ok: true });
});
