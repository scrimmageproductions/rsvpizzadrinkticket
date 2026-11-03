import { after } from "next/server";
import { z } from "zod";
import { handler, json } from "@/lib/server/http";
import { HttpError, requireHost } from "@/lib/server/auth";
import { loadEvent } from "@/lib/server/guests";
import { db, type RsvpRow } from "@/lib/server/supabase";
import { adminRedeemOnChain } from "@/lib/server/adminAccount";
import { resolveTheme } from "@/lib/theme";

const Body = z.object({
  redemptionId: z.string().uuid(),
  tokenId: z.number().int().nonnegative(),
  /** Batch vouch (e.g. a VIP's whole round). The ledger rejects anything above the balance. */
  amount: z.number().int().positive().max(50).default(1),
});

/**
 * HOST VOUCH — guest's phone is dead. The host redeems `amount` tickets on their behalf:
 *   1. same atomic ledger check as a guest redemption (source = 'admin', who = staff email)
 *   2. respond immediately with the theme → host's device shows the Visual 2FA success screen
 *   3. after the response: gasless ADMIN_ROLE `adminRedeem` UserOp burns the guest's token
 */
export const POST = handler(async (req, ctx: RouteContext<"/api/host/[eventId]/guests/[rsvpId]/redeem">) => {
  const { eventId, rsvpId } = await ctx.params;
  const staff = await requireHost(req);
  const body = Body.parse(await req.json());

  const event = await loadEvent(eventId);
  const { data: rsvp, error: rErr } = await db()
    .from("rsvps").select("*").eq("id", rsvpId).eq("event_id", eventId).maybeSingle<RsvpRow>();
  if (rErr) throw rErr;
  if (!rsvp?.claimed_at || !rsvp.wallet_address) throw new HttpError(409, "not_claimed", "Guest hasn't claimed tickets.");

  const theme = resolveTheme(event);
  const { error } = await db().rpc("record_redemption", {
    p_id: body.redemptionId,
    p_event_id: eventId,
    p_rsvp_id: rsvp.id,
    p_token_id: body.tokenId,
    p_amount: body.amount,
    p_theme_color: theme.key,
    p_source: "admin",
    p_redeemed_by: staff.emails[0] ?? staff.userId,
  });
  if (error) {
    const code = ["insufficient_balance", "unknown_token", "not_claimed"].find((c) => error.message.includes(c));
    if (code) return json({ error: code, theme }, { status: 409 });
    throw error;
  }

  const wallet = rsvp.wallet_address as `0x${string}`;
  after(async () => {
    try {
      const { txHash } = await adminRedeemOnChain(wallet, body.tokenId, body.amount, async (userOpHash) => {
        await db().from("redemptions").update({ user_op_hash: userOpHash }).eq("id", body.redemptionId);
      });
      await db().from("redemptions").update({ tx_hash: txHash }).eq("id", body.redemptionId);
    } catch (e) {
      // The ledger already reflects the pour; the on-chain burn can be retried by ops.
      console.error("adminRedeem failed", body.redemptionId, e);
    }
  });

  return json({ theme });
});
