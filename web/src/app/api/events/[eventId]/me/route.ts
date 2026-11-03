import { handler, json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { findRsvp, guestStatus, loadEvent, recentRedemptions, toPublicEvent } from "@/lib/server/guests";
import { nextTheme, resolveTheme } from "@/lib/theme";

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

  // Current color + only the NEXT slot (auto mode). Clients pick between them with
  // their clock corrected by serverTime, so a phone that's 5 min fast still shows the right one.
  const theme = status.state === "claimed" ? resolveTheme(event) : null;
  return json({
    event: toPublicEvent(event),
    status,
    theme,
    themeNext: theme ? nextTheme(event, theme) : null,
    // Safety net if the success screen auto-closed while the bartender looked away.
    recentRedemptions: rsvp?.claimed_at ? await recentRedemptions(rsvp.id) : [],
    serverTime: Date.now(),
  });
});
