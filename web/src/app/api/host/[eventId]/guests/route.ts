import { handler, json } from "@/lib/server/http";
import { requireHost } from "@/lib/server/auth";
import { listRsvps } from "@/lib/server/repo";
import { ledgersFor, loadEvent } from "@/lib/server/guests";
import type { HostGuest } from "@/lib/types";

/** Door staff guest list + master ledger (polled). */
export const GET = handler(async (req, ctx: RouteContext<"/api/host/[eventId]/guests">) => {
  const { eventId } = await ctx.params;
  await requireHost(req);

  const event = await loadEvent(eventId);
  const rsvps = await listRsvps(eventId);
  const ledgers = await ledgersFor(event, rsvps);

  const guests: HostGuest[] = rsvps.map((r) => {
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
      checkedInBy: r.checked_in_by,
      invitedAt: r.invited_at,
      ...l,
    };
  });
  return json({ guests });
});
