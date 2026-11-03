import { after } from "next/server";
import { z } from "zod";
import { handler, json } from "@/lib/server/http";
import { HttpError, requireHost } from "@/lib/server/auth";
import { db, type RsvpRow } from "@/lib/server/supabase";
import { adminTransferOnChain } from "@/lib/server/adminAccount";

const Body = z.object({
  fromRsvpId: z.string().uuid(),
  toRsvpId: z.string().uuid(),
  tokenId: z.number().int().nonnegative(),
  amount: z.number().int().positive().max(20),
});

const MESSAGES: Record<string, string> = {
  insufficient_balance: "That guest doesn't have that many tickets left.",
  recipient_not_ready: "The friend must be checked in and have claimed their own tickets (so they have a wallet).",
  same_guest: "Pick a different guest.",
};

/**
 * WINGMAN TRANSFER — move tickets from a guest whose phone died to a friend at the venue.
 * Ledger first (atomic, both sides locked), then a gasless ADMIN_ROLE `adminTransfer` UserOp —
 * the only path around the soulbound rule.
 */
export const POST = handler(async (req, ctx: RouteContext<"/api/host/[eventId]/transfers">) => {
  const { eventId } = await ctx.params;
  const staff = await requireHost(req);
  const body = Body.parse(await req.json());

  const { data: rows, error: rErr } = await db()
    .from("rsvps").select("*").eq("event_id", eventId).in("id", [body.fromRsvpId, body.toRsvpId]);
  if (rErr) throw rErr;
  const from = (rows as RsvpRow[]).find((r) => r.id === body.fromRsvpId);
  const to = (rows as RsvpRow[]).find((r) => r.id === body.toRsvpId);
  if (!from || !to) throw new HttpError(404, "rsvp_not_found");
  if (!from.wallet_address) throw new HttpError(409, "not_claimed", "That guest never claimed tickets.");

  const { data: transferId, error } = await db().rpc("record_transfer", {
    p_event_id: eventId,
    p_from: from.id,
    p_to: to.id,
    p_token_id: body.tokenId,
    p_amount: body.amount,
    p_moved_by: staff.emails[0] ?? staff.userId,
  });
  if (error) {
    const code = Object.keys(MESSAGES).find((c) => error.message.includes(c));
    if (code) throw new HttpError(409, code, MESSAGES[code]);
    throw error;
  }

  after(async () => {
    try {
      const { txHash } = await adminTransferOnChain(
        from.wallet_address as `0x${string}`,
        to.wallet_address as `0x${string}`,
        body.tokenId,
        body.amount,
        async (userOpHash) => {
          await db().from("transfers").update({ user_op_hash: userOpHash }).eq("id", transferId);
        },
      );
      await db().from("transfers").update({ tx_hash: txHash }).eq("id", transferId);
    } catch (e) {
      console.error("adminTransfer failed", transferId, e);
    }
  });

  return json({ transferId });
});
