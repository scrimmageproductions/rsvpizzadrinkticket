import { handler, json } from "@/lib/server/http";
import { HttpError, requireHost } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";

/** Host polls this after a Host Vouch to show the burn's on-chain status. */
export const GET = handler(async (req, ctx: RouteContext<"/api/host/[eventId]/redemptions/[redemptionId]">) => {
  const { eventId, redemptionId } = await ctx.params;
  await requireHost(req);
  const { data, error } = await db()
    .from("redemptions")
    .select("user_op_hash, tx_hash")
    .eq("id", redemptionId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "not_found");
  return json({ userOpHash: data.user_op_hash, txHash: data.tx_hash });
});
