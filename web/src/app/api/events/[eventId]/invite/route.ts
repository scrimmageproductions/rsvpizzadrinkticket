import { handler, json } from "@/lib/server/http";
import { HttpError } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { verifyToken } from "@/lib/server/tokens";

/**
 * Resolves a pre-arrival invite link to the guest's login identifier so the login screen can be
 * pre-filled and the Privy one-time code sent automatically. The token was emailed only to that
 * address, so returning it is no new disclosure.
 */
export const GET = handler(async (req, ctx: RouteContext<"/api/events/[eventId]/invite">) => {
  const { eventId } = await ctx.params;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const p = verifyToken(token, "invite", eventId);
  if (!p || typeof p.r !== "string") throw new HttpError(403, "invite_invalid", "This invite link is invalid or expired.");

  const { data, error } = await db()
    .from("rsvps").select("name, email, phone").eq("id", p.r).eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "invite_invalid", "This invite link is invalid or expired.");
  return json({ name: data.name, email: data.email, phone: data.phone });
});
