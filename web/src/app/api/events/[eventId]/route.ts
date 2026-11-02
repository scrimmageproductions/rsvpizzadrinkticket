import { handler, json } from "@/lib/server/http";
import { loadEvent, toPublicEvent } from "@/lib/server/guests";

/** Public event info (never includes the PIN or the theme color). */
export const GET = handler(async (_req, ctx: RouteContext<"/api/events/[eventId]">) => {
  const { eventId } = await ctx.params;
  return json({ event: toPublicEvent(await loadEvent(eventId)) });
});
