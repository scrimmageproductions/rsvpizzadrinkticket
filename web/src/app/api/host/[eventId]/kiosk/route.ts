import { handler, json } from "@/lib/server/http";
import { HttpError, requireHost } from "@/lib/server/auth";
import { loadEvent } from "@/lib/server/guests";
import { currentKioskCode, KIOSK_STEP_MS } from "@/lib/kiosk";

/**
 * Door screen polls this for the current rotating code. Staff-only: the kiosk iPad is logged
 * in as staff once, then left at the entrance. Never returns the secret itself.
 */
export const GET = handler(async (req, ctx: RouteContext<"/api/host/[eventId]/kiosk">) => {
  const { eventId } = await ctx.params;
  await requireHost(req);
  const event = await loadEvent(eventId);
  if (!event.kiosk_enabled || !event.kiosk_secret) throw new HttpError(409, "kiosk_disabled", "Kiosk mode is off.");
  const { code, expiresAt } = await currentKioskCode(event.kiosk_secret, eventId);
  return json({ code, expiresAt, stepMs: KIOSK_STEP_MS });
});
