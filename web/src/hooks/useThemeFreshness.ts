"use client";

import { useNow } from "./useNow";
import type { ResolvedTheme } from "@/lib/theme";

/** Small grace so a rotation that lands while a refetch is in flight doesn't flicker "stale". */
const GRACE_MS = 5_000;

/**
 * Auto-rotating colors carry `validUntil`. If the cached one has expired (guest lost signal and
 * the 4 s poll stopped landing), the success screen would show LAST slot's color — which the
 * bartender would rightly reject. Callers block the redeem and offer "↻ Sync connection".
 */
export function useThemeFreshness(theme: ResolvedTheme | null) {
  const now = useNow(1000);
  const stale = !!theme?.validUntil && now !== null && now > theme.validUntil + GRACE_MS;
  return { stale };
}
