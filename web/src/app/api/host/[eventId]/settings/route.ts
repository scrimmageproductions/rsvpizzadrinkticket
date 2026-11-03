import { z } from "zod";
import { handler, json } from "@/lib/server/http";
import { HttpError, requireHost } from "@/lib/server/auth";
import { ticketChangeError, TicketTypesSchema } from "@/lib/tickets";
import { loadEvent } from "@/lib/server/guests";
import { db } from "@/lib/server/supabase";
import { isThemeKey, resolveTheme } from "@/lib/theme";
import { randomSecretHex } from "@/lib/kiosk";
import type { HostSettings } from "@/lib/types";

const Patch = z.object({
  eventPin: z.string().trim().min(3).max(12).regex(/^[A-Za-z0-9]+$/).optional(),
  themeMode: z.enum(["manual", "auto"]).optional(),
  themeColor: z.string().refine(isThemeKey, "unknown color").optional(),
  themePalette: z.array(z.string().refine(isThemeKey, "unknown color")).min(2).optional(),
  rotationMinutes: z.number().int().min(1).max(240).optional(),
  kioskEnabled: z.boolean().optional(),
  eventBudget: z.number().int().min(0).max(1_000_000).nullable().optional(),
  ticketTypes: TicketTypesSchema.optional(),
});

export const GET = handler(async (req, ctx: RouteContext<"/api/host/[eventId]/settings">) => {
  const { eventId } = await ctx.params;
  await requireHost(req);
  const e = await loadEvent(eventId);
  const settings: HostSettings = {
    eventPin: e.event_pin,
    themeMode: e.theme_mode,
    themeColor: e.theme_color,
    themePalette: e.theme_palette,
    rotationMinutes: e.rotation_minutes,
    kioskEnabled: e.kiosk_enabled,
    eventBudget: e.event_budget,
  };
  return json({ eventName: e.name, settings, theme: resolveTheme(e), ticketTypes: e.ticket_types, serverTime: Date.now() });
});

export const PATCH = handler(async (req, ctx: RouteContext<"/api/host/[eventId]/settings">) => {
  const { eventId } = await ctx.params;
  await requireHost(req);
  const p = Patch.parse(await req.json());

  const update: Record<string, unknown> = {};
  if (p.eventPin !== undefined) update.event_pin = p.eventPin.toUpperCase();
  if (p.themeMode !== undefined) update.theme_mode = p.themeMode;
  if (p.themeColor !== undefined) update.theme_color = p.themeColor;
  if (p.themePalette !== undefined) update.theme_palette = p.themePalette;
  if (p.rotationMinutes !== undefined) update.rotation_minutes = p.rotationMinutes;
  if (p.kioskEnabled !== undefined) {
    update.kiosk_enabled = p.kioskEnabled;
    // Fresh key on every off→on: any photo of an earlier QR can never validate again.
    // (Re-sending "on" while already on must not rotate it under guests mid-scan.)
    if (p.kioskEnabled) {
      const current = await loadEvent(eventId);
      if (!current.kiosk_enabled || !current.kiosk_secret) update.kiosk_secret = randomSecretHex();
    }
  }

  if (p.eventBudget !== undefined) update.event_budget = p.eventBudget;
  if (p.ticketTypes !== undefined) {
    const current = await loadEvent(eventId);
    const err = ticketChangeError(current.ticket_types, p.ticketTypes, await tokensInUse(eventId));
    if (err) throw new HttpError(409, "ticket_in_use", err);
    // Only affects claims made from now on — each guest's bundle is snapshotted at claim.
    update.ticket_types = p.ticketTypes;
  }

  const { error } = await db().from("events").update(update).eq("id", eventId);
  if (error) throw error;
  return json({ theme: resolveTheme(await loadEvent(eventId)) });
});

/** Token ids any guest holds or has held: claimed bundles, grants, transfers. */
async function tokensInUse(eventId: string): Promise<Set<number>> {
  const [r, g, t] = await Promise.all([
    db().from("rsvps").select("claimed_bundle").eq("event_id", eventId).not("claimed_at", "is", null),
    db().from("grants").select("token_id").eq("event_id", eventId),
    db().from("transfers").select("token_id").eq("event_id", eventId),
  ]);
  for (const x of [r, g, t]) if (x.error) throw x.error;
  const used = new Set<number>();
  for (const row of r.data ?? []) for (const b of (row.claimed_bundle ?? []) as { tokenId: number; amount: number }[]) if (b.amount > 0) used.add(Number(b.tokenId));
  for (const row of [...(g.data ?? []), ...(t.data ?? [])]) used.add(Number(row.token_id));
  return used;
}
