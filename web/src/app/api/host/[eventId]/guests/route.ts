import { handler, json } from "@/lib/server/http";
import { requireHost } from "@/lib/server/auth";
import { db, type RsvpRow } from "@/lib/server/supabase";
import type { HostGuest } from "@/lib/types";

/** Door staff guest list (polled). */
export const GET = handler(async (req, ctx: RouteContext<"/api/host/[eventId]/guests">) => {
  const { eventId } = await ctx.params;
  await requireHost(req);

  const [rsvps, redemptions] = await Promise.all([
    db().from("rsvps").select("*").eq("event_id", eventId).order("name"),
    db().from("redemptions").select("rsvp_id, amount").eq("event_id", eventId),
  ]);
  if (rsvps.error) throw rsvps.error;
  if (redemptions.error) throw redemptions.error;

  const redeemed = new Map<string, number>();
  for (const r of redemptions.data ?? []) redeemed.set(r.rsvp_id, (redeemed.get(r.rsvp_id) ?? 0) + r.amount);

  const guests: HostGuest[] = (rsvps.data as RsvpRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    status: r.status,
    checkedInAt: r.checked_in_at,
    claimedAt: r.claimed_at,
    walletAddress: r.wallet_address,
    redeemed: redeemed.get(r.id) ?? 0,
  }));
  return json({ guests });
});
