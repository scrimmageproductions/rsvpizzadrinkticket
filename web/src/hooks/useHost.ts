"use client";

import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useApi } from "@/lib/api";
import type { HostGuest, HostSettings } from "@/lib/types";
import type { ResolvedTheme } from "@/lib/theme";

export type SettingsResponse = { eventName: string; settings: HostSettings; theme: ResolvedTheme; serverTime: number };

export function useHostSettings(eventId: string) {
  const { authenticated } = usePrivy();
  const api = useApi();
  return useQuery({
    queryKey: ["host-settings", eventId],
    queryFn: () => api<SettingsResponse>(`/api/host/${eventId}/settings`),
    enabled: authenticated,
    retry: false,
    refetchInterval: (q) => {
      const until = q.state.data?.theme.validUntil;
      return until ? Math.max(500, Math.min(5000, until - Date.now() + 250)) : 5000;
    },
  });
}

export function useHostGuests(eventId: string) {
  const { authenticated } = usePrivy();
  const api = useApi();
  return useQuery({
    queryKey: ["host-guests", eventId],
    queryFn: () => api<{ guests: HostGuest[] }>(`/api/host/${eventId}/guests`),
    enabled: authenticated,
    retry: false,
    refetchInterval: 5000,
  });
}
