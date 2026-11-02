import { handler, json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { findRsvp, guestStatus, loadEvent, toPublicEvent } from "@/lib/server/guests";
import { resolveTheme } from "@/lib/theme";

/**
 * Polled by the guest app (~every 4s): RSVP / check-in state, off-chain balances, and —
 * only once the guest actually holds tickets — the current Theme Color of the Night.
 * The color is pre-fetched so the Success Screen can render it with zero latency.
 */
export const GET = handler(async (req, ctx: RouteContext<"/api/events/[eventId]/me">) => {
  const { eventId } = await ctx.params;
  const me = await requireUser(req);
  const event = await loadEvent(eventId);
  const rsvp = await findRsvp(eventId, me);
  const status = await guestStatus(event, rsvp);

  return json({
    event: toPublicEvent(event),
    status,
    theme: status.state === "claimed" ? resolveTheme(event) : null,
    serverTime: Date.now(),
  });
});
