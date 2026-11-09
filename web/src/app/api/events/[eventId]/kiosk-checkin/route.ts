import { z } from "zod";
import { handler, json } from "@/lib/server/http";
import { HttpError, requireUser } from "@/lib/server/auth";
import { findRsvp, loadEvent } from "@/lib/server/guests";
import { kioskCheckIn } from "@/lib/server/repo";
import { signToken, verifyToken } from "@/lib/server/tokens";
import { PRESENCE_TTL_MS, verifyKioskCode } from "@/lib/kiosk";

const Body = z.union([
  z.object({ code: z.string().trim().min(6).max(16) }),
  z.object({ presence: z.string().min(10).max(500) }),
]);

/**
 * Unmanned door — replaces Layer 1 (staff check-in) with proof of standing at the door screen.
 *
 *   1. { code }      — the rotating QR value. Valid for ≤ ~60 s.
 *        • not logged in yet → returns { presence }: a 10-minute pass the browser keeps
 *          in sessionStorage while the guest logs in (OTP can outlast the 30 s code).
 *        • logged in         → checks the guest in immediately.
 *   2. { presence }  — logged in now → checks the guest in.
 *
 * Layer 2 (the Event PIN on the sign inside) is unchanged and still required to mint.
 */
export const POST = handler(async (req, ctx: RouteContext<"/api/events/[eventId]/kiosk-checkin">) => {
  const { eventId } = await ctx.params;
  const body = Body.parse(await req.json());
  const event = await loadEvent(eventId);
  if (!event.kiosk_enabled || !event.kiosk_secret) {
    throw new HttpError(409, "kiosk_disabled", "Self check-in is off — see the door staff.");
  }

  if ("code" in body) {
    if (!(await verifyKioskCode(event.kiosk_secret, eventId, body.code))) {
      throw new HttpError(403, "kiosk_expired", "That door code expired. Scan the screen at the entrance again.");
    }
    if (!req.headers.get("authorization")) {
      return json({ presence: signToken({ k: "presence", e: eventId, x: Date.now() + PRESENCE_TTL_MS }) });
    }
  } else if (!verifyToken(body.presence, "presence", eventId)) {
    throw new HttpError(403, "presence_expired", "Your door scan expired. Scan the screen at the entrance again.");
  }

  const me = await requireUser(req);
  const rsvp = await findRsvp(eventId, me);
  if (!rsvp) throw new HttpError(403, "not_on_list", "We couldn't find your RSVP. Use the email or phone you RSVP'd with.");

  if (rsvp.status !== "checked_in") await kioskCheckIn(rsvp.id);
  return json({ checkedIn: true, name: rsvp.name });
});
