import { after } from "next/server";
import { z } from "zod";
import { handler, json } from "@/lib/server/http";
import { HttpError, requireHost } from "@/lib/server/auth";
import { getRsvp } from "@/lib/server/repo";
import { recordTransfer, setTransferHashes } from "@/lib/server/ledger";
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

  const [from, to] = await Promise.all([getRsvp(eventId, body.fromRsvpId), getRsvp(eventId, body.toRsvpId)]);
  if (!from || !to) throw new HttpError(404, "rsvp_not_found");
  if (!from.wallet_address) throw new HttpError(409, "not_claimed", "That guest never claimed tickets.");

  // Atomic: both balances checked and the row written in one D1 statement (lib/server/ledger.ts).
  const r = await recordTransfer({
    eventId,
    fromRsvpId: from.id,
    toRsvpId: to.id,
    tokenId: body.tokenId,
    amount: body.amount,
    movedBy: staff.emails[0] ?? staff.userId,
  });
  if (!r.ok) throw new HttpError(409, r.code, MESSAGES[r.code] ?? r.code);
  const transferId = r.id;

  after(async () => {
    try {
      const { txHash } = await adminTransferOnChain(
        from.wallet_address as `0x${string}`,
        to.wallet_address as `0x${string}`,
        body.tokenId,
        body.amount,
        async (userOpHash) => {
          await setTransferHashes(transferId, { userOpHash });
        },
      );
      await setTransferHashes(transferId, { txHash });
    } catch (e) {
      console.error("adminTransfer failed", transferId, e);
    }
  });

  return json({ transferId });
});
