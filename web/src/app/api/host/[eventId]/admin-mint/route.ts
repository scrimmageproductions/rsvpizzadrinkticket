import { after } from "next/server";
import { z } from "zod";
import { handler, json } from "@/lib/server/http";
import { HttpError, requireHost } from "@/lib/server/auth";
import { getRsvp } from "@/lib/server/repo";
import { recordGrant, setGrantHashes } from "@/lib/server/ledger";
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
 *   1. recordGrant(): atomic ledger row (who, why) — counts toward balances + the budget bar
 *   2. respond immediately (host sees the new balance on the next poll)
 *   3. after(): gasless ADMIN_ROLE `adminMint` UserOp to the guest's wallet
 */
export const POST = handler(async (req, ctx: RouteContext<"/api/host/[eventId]/admin-mint">) => {
  const { eventId } = await ctx.params;
  const staff = await requireHost(req);
  const body = Body.parse(await req.json());

  const rsvp = await getRsvp(eventId, body.rsvpId);
  if (!rsvp) throw new HttpError(404, "rsvp_not_found");

  const r = await recordGrant({
    eventId,
    rsvpId: rsvp.id,
    tokenId: body.tokenId,
    amount: body.amount,
    reason: body.reason ?? null,
    grantedBy: staff.emails[0] ?? staff.userId,
  });
  if (!r.ok) throw new HttpError(409, r.code, MESSAGES[r.code] ?? r.code);
  const grantId = r.id;

  const wallet = rsvp.wallet_address as `0x${string}`;
  after(async () => {
    try {
      const { txHash } = await adminMintOnChain(wallet, body.tokenId, body.amount, async (userOpHash) => {
        await setGrantHashes(grantId, { userOpHash });
      });
      await setGrantHashes(grantId, { txHash });
    } catch (e) {
      // Ledger already credits the guest; ops can retry the mint from the grants table.
      console.error("adminMint failed", grantId, e);
    }
  });

  return json({ grantId });
});
