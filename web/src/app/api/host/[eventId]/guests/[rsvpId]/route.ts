import { z } from "zod";
import { handler, json } from "@/lib/server/http";
import { HttpError, requireHost } from "@/lib/server/auth";
import { setCheckIn } from "@/lib/server/repo";

const Body = z.object({ checkedIn: z.boolean() });

/** Door staff toggle: Layer 1 of the dual-layer mint gate. */
export const PATCH = handler(async (req, ctx: RouteContext<"/api/host/[eventId]/guests/[rsvpId]">) => {
  const { eventId, rsvpId } = await ctx.params;
  const staff = await requireHost(req);
  const { checkedIn } = Body.parse(await req.json());

  const data = await setCheckIn(eventId, rsvpId, checkedIn, staff.emails[0] ?? staff.userId);
  if (!data) throw new HttpError(404, "rsvp_not_found");
  return json({ guest: data });
});
