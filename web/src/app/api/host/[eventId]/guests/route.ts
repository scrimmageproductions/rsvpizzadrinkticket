import { handler, json } from "@/lib/server/http";
import { requireHost } from "@/lib/server/auth";
import { db, type RsvpRow } from "@/lib/server/supabase";
import { ledgersFor, loadEvent } from "@/lib/server/guests";
import type { HostGuest } from "@/lib/types";

/** Door staff guest list + master ledger (polled). */
export const GET = handler(async (req, ctx: RouteContext<"/api/host/[eventId]/guests">) => {
  const { eventId } = await ctx.params;
  await requireHost(req);

  const event = await loadEvent(eventId);
  const rsvps = await db().from("rsvps").select("*").eq("event_id", eventId).order("name");
  if (rsvps.error) throw rsvps.error;
  const ledgers = await ledgersFor(event, rsvps.data as RsvpRow[]);

  const guests: HostGuest[] = (rsvps.data as RsvpRow[]).map((r) => {
    const l = ledgers.get(r.id)!;
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      status: r.status,
      checkedInAt: r.checked_in_at,
      claimedAt: r.claimed_at,
      walletAddress: r.wallet_address,
      redeemed: l.redeemedByGuest + l.redeemedByAdmin,
      ...l,
    };
  });
  return json({ guests });
});
