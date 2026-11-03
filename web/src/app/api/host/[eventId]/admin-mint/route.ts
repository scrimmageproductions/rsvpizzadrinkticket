import { after } from "next/server";
import { z } from "zod";
import { handler, json } from "@/lib/server/http";
import { HttpError, requireHost } from "@/lib/server/auth";
import { db, type RsvpRow } from "@/lib/server/supabase";
import { adminMintOnChain } from "@/lib/server/adminAccount";

const Body = z.object({
  rsvpId: z.string().uuid(),
  tokenId: z.number().int().min(1),
  amount: z.number().int().positive().max(20),
  reason: z.string().trim().max(140).optional(),
});

const MESSAGES: Record<string, string> = {
  recipient_not_ready: "This guest hasn't claimed tickets yet, so there's no wallet to send to.",
  unknown_token: "That ticket type doesn't exist for this event.",
};

/**
 * "MAKE IT RIGHT" — grant extra tickets to one guest mid-event (comp, VIP, apology round).
 *   1. record_grant(): atomic ledger row (who, why) — counts toward balances + the budget bar
 *   2. respond immediately (host sees the new balance on the next poll)
 *   3. after(): gasless ADMIN_ROLE `adminMint` UserOp to the guest's wallet
 */
export const POST = handler(async (req, ctx: RouteContext<"/api/host/[eventId]/admin-mint">) => {
  const { eventId } = await ctx.params;
  const staff = await requireHost(req);
  const body = Body.parse(await req.json());

  const { data: rsvp, error: rErr } = await db()
    .from("rsvps").select("*").eq("id", body.rsvpId).eq("event_id", eventId).maybeSingle<RsvpRow>();
  if (rErr) throw rErr;
  if (!rsvp) throw new HttpError(404, "rsvp_not_found");

  const { data: grantId, error } = await db().rpc("record_grant", {
    p_event_id: eventId,
    p_rsvp_id: rsvp.id,
    p_token_id: body.tokenId,
    p_amount: body.amount,
    p_reason: body.reason ?? null,
    p_granted_by: staff.emails[0] ?? staff.userId,
  });
  if (error) {
    const code = Object.keys(MESSAGES).find((c) => error.message.includes(c));
    if (code) throw new HttpError(409, code, MESSAGES[code]);
    throw error;
  }

  const wallet = rsvp.wallet_address as `0x${string}`;
  after(async () => {
    try {
      const { txHash } = await adminMintOnChain(wallet, body.tokenId, body.amount, async (userOpHash) => {
        await db().from("grants").update({ user_op_hash: userOpHash }).eq("id", grantId);
      });
      await db().from("grants").update({ tx_hash: txHash }).eq("id", grantId);
    } catch (e) {
      // Ledger already credits the guest; ops can retry the mint from the grants table.
      console.error("adminMint failed", grantId, e);
    }
  });

  return json({ grantId });
});
