import { handler, json } from "@/lib/server/http";
import { HttpError, requireHost } from "@/lib/server/auth";
import { getRedemptionHashes } from "@/lib/server/ledger";

/** Host polls this after a Host Vouch to show the burn's on-chain status. */
export const GET = handler(async (req, ctx: RouteContext<"/api/host/[eventId]/redemptions/[redemptionId]">) => {
  const { eventId, redemptionId } = await ctx.params;
  await requireHost(req);
  const data = await getRedemptionHashes(eventId, redemptionId);
  if (!data) throw new HttpError(404, "not_found");
  return json({ userOpHash: data.user_op_hash, txHash: data.tx_hash });
});
