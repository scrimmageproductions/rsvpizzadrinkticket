"use client";

import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useApi } from "@/lib/api";
import type { GuestStatus, PublicEvent } from "@/lib/types";
import type { ResolvedTheme } from "@/lib/theme";

export type MeResponse = {
  event: PublicEvent;
  status: GuestStatus;
  theme: ResolvedTheme | null;
  serverTime: number;
};

/**
 * Polls the guest's state. Shared query key → the Redemption screen reads the already-cached
 * Theme Color synchronously at tap time (no network on the critical path).
 */
export function useGuest(eventId: string) {
  const { authenticated } = usePrivy();
  const api = useApi();
  return useQuery({
    queryKey: ["me", eventId],
    queryFn: () => api<MeResponse>(`/api/events/${eventId}/me`),
    enabled: authenticated,
    refetchInterval: (q) => {
      const theme = q.state.data?.theme;
      // Refresh right as an auto-rotating color expires, otherwise every 4s.
      if (theme?.validUntil) return Math.max(500, Math.min(4000, theme.validUntil - Date.now() + 250));
      return 4000;
    },
  });
}
