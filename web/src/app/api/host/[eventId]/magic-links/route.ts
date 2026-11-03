import { PrivyClient } from "@privy-io/node";
import { handler, json } from "@/lib/server/http";
import { requireHost } from "@/lib/server/auth";
import { loadEvent } from "@/lib/server/guests";
import { db, type RsvpRow } from "@/lib/server/supabase";
import { signToken } from "@/lib/server/tokens";
import { preArrivalEmail, sendEmail } from "@/lib/server/email";
import type { PreArrivalResult } from "@/lib/types";

const INVITE_TTL_MS = 3 * 24 * 60 * 60_000;

/**
 * PRE-ARRIVAL LINKS — kill the login bottleneck at the door.
 *
 * For every guest still `rsvpd` and unclaimed:
 *   1. Pre-create their Privy user (by email) with a pregenerated embedded wallet, so at the door
 *      there is nothing to provision — and bind it to the RSVP.
 *   2. Sign an invite link  /e/<eventId>?invite=<token>  (HMAC, kind-scoped, 3-day expiry).
 *      Opening it pre-fills the login and fires the Privy email code automatically.
 *   3. Hand it to the abstract email sender (lib/server/email.ts — provider TODO).
 *
 * Note: Privy's Node SDK has no API that mints a log-in-without-code link; that needs Privy's
 * custom-JWT auth. Guests still type one 6-digit code — but they do it on the sofa, not in line.
 */
export const POST = handler(async (req, ctx: RouteContext<"/api/host/[eventId]/magic-links">) => {
  const { eventId } = await ctx.params;
  await requireHost(req);
  const event = await loadEvent(eventId);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin).replace(/\/$/, "");

  const { data, error } = await db()
    .from("rsvps").select("*").eq("event_id", eventId).eq("status", "rsvpd").is("claimed_at", null);
  if (error) throw error;

  const privy = new PrivyClient({ appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!, appSecret: process.env.PRIVY_APP_SECRET! });
  const result: PreArrivalResult = { sent: [], skipped: [] };

  const one = async (r: RsvpRow) => {
    if (!r.email) {
      // SMS would go here too; this MVP only wires email.
      result.skipped.push({ rsvpId: r.id, name: r.name, reason: "no email on RSVP (phone-only)" });
      return;
    }
    try {
      const userId = r.privy_user_id ?? (await ensurePrivyUser(privy, r.email));
      if (!r.privy_user_id) {
        await db().from("rsvps").update({ privy_user_id: userId }).eq("id", r.id).is("privy_user_id", null);
      }
      const token = signToken({ k: "invite", e: eventId, r: r.id, x: Date.now() + INVITE_TTL_MS });
      const link = `${appUrl}/e/${encodeURIComponent(eventId)}?invite=${token}`;
      const delivered = await sendEmail({
        to: r.email,
        ...preArrivalEmail({ name: r.name, eventName: event.name, venue: event.venue, link }),
      });
      await db()
        .from("rsvps")
        .update({ invited_at: new Date().toISOString(), invite_count: (r.invite_count ?? 0) + 1 })
        .eq("id", r.id);
      result.sent.push({ rsvpId: r.id, name: r.name, to: r.email, link, delivered });
    } catch (e) {
      console.error("pre-arrival link failed", r.id, e);
      result.skipped.push({ rsvpId: r.id, name: r.name, reason: "Privy user setup failed" });
    }
  };

  // Small batches keep us well under Privy / email provider rate limits.
  const rows = data as RsvpRow[];
  for (let i = 0; i < rows.length; i += 5) await Promise.all(rows.slice(i, i + 5).map(one));
  return json(result);
});

/** Find the Privy user for this email, or create one with a pregenerated embedded EVM wallet. */
async function ensurePrivyUser(privy: PrivyClient, email: string): Promise<string> {
  try {
    return (await privy.users().getByEmailAddress({ address: email })).id;
  } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
  }
  const user = await privy.users().create({
    linked_accounts: [{ type: "email", address: email }],
    wallets: [{ chain_type: "ethereum" }],
  });
  return user.id;
}
