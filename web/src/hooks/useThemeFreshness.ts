"use client";

import { useNow } from "./useNow";
import { pickTheme, type ResolvedTheme } from "@/lib/theme";

/** Small grace so a rotation that lands while a refetch is in flight doesn't flicker "stale". */
const GRACE_MS = 5_000;

export type ThemeWindow = { theme: ResolvedTheme | null; themeNext: ResolvedTheme | null; clockOffset: number };

/**
 * Auto-rotating colors carry `validUntil`, and /me also sends the NEXT slot, so a phone can
 * cross one rotation boundary on its own. Only beyond that (guest offline for a whole slot) is
 * the color unknown — callers then block the redeem and offer "↻ Sync connection".
 * Uses server-corrected time, so a phone with a wrong clock isn't flagged (or missed) wrongly.
 */
export function useThemeFreshness({ theme, themeNext, clockOffset }: ThemeWindow) {
  const now = useNow(1000);
  if (!theme || now === null) return { stale: false };
  const { stale } = pickTheme(theme, themeNext, now + clockOffset - GRACE_MS);
  return { stale };
}
