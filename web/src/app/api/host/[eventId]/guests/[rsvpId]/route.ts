import { z } from "zod";
import { handler, json } from "@/lib/server/http";
import { HttpError, requireHost } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";

const Body = z.object({ checkedIn: z.boolean() });

/** Door staff toggle: Layer 1 of the dual-layer mint gate. */
export const PATCH = handler(async (req, ctx: RouteContext<"/api/host/[eventId]/guests/[rsvpId]">) => {
  const { eventId, rsvpId } = await ctx.params;
  const staff = await requireHost(req);
  const { checkedIn } = Body.parse(await req.json());

  const { data, error } = await db()
    .from("rsvps")
    .update(
      checkedIn
        ? { status: "checked_in", checked_in_at: new Date().toISOString(), checked_in_by: staff.emails[0] }
        : { status: "rsvpd", checked_in_at: null, checked_in_by: null },
    )
    .eq("id", rsvpId)
    .eq("event_id", eventId)
    .select("id, status, checked_in_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "rsvp_not_found");
  return json({ guest: data });
});
