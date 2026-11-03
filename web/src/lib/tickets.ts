import { z } from "zod";
import type { TicketType } from "@/lib/types";

/**
 * Ticket configuration rules — shared by the live settings API and Demo Mode.
 * `amount` is the default allocation handed out at check-in for NEW claims (0 = not handed out,
 * e.g. a "Merch Item" you only give via Grant Tickets). Existing guests keep what they claimed.
 */
export const TicketTypeSchema = z.object({
  tokenId: z.number().int().min(1).max(1_000_000),
  label: z.string().trim().min(1, "Name the ticket").max(24),
  emoji: z.string().trim().min(1, "Pick an emoji").max(8),
  amount: z.number().int().min(0).max(20),
});

export const TicketTypesSchema = z
  .array(TicketTypeSchema)
  .min(1, "Keep at least one ticket type")
  .max(12)
  .refine((ts) => new Set(ts.map((t) => t.tokenId)).size === ts.length, "Duplicate ticket ids")
  .refine((ts) => ts.some((t) => t.amount > 0), "Hand out at least one ticket at check-in");

/** Reject deleting a ticket type that guests already hold (minted, granted or moved). */
export function ticketChangeError(prev: TicketType[], next: TicketType[], inUse: Set<number>): string | null {
  const kept = new Set(next.map((t) => t.tokenId));
  const removed = prev.filter((t) => !kept.has(t.tokenId) && inUse.has(t.tokenId));
  if (!removed.length) return null;
  return `Can't delete ${removed.map((t) => `${t.emoji} ${t.label}`).join(", ")} — guests already hold it. Set its check-in amount to 0 instead.`;
}

/** Next free token id for a new custom type. */
export const nextTokenId = (ts: TicketType[]) => Math.max(0, ...ts.map((t) => t.tokenId)) + 1;
