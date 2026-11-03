"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { ApiError, invalidateOnchain, useApi } from "@/lib/api";
import { sendClaim } from "@/lib/aa";
import { useSmartAccount } from "@/hooks/useSmartAccount";
import { useBurn, useDrainBurnQueue } from "@/hooks/useBurn";
import { useOnchainTickets } from "@/hooks/useOnchainTickets";
import type { ClaimVoucher, HostGuest, HostSettings, PublicEvent } from "@/lib/types";
import type { ResolvedTheme } from "@/lib/theme";
import type {
  AdminRedeemHandle,
  GuestBackend,
  GuestWallet,
  HostBackend,
  HostSettingsData,
  MeResponse,
  RedeemOutcome,
  TransferInput,
} from "./types";

// ═════════════════════════════════════════════════════════════ guest

function useMe(eventId: string) {
  const { authenticated } = usePrivy();
  const api = useApi();
  return useQuery({
    queryKey: ["me", eventId],
    queryFn: () => api<MeResponse>(`/api/events/${eventId}/me`),
    enabled: authenticated,
    refetchInterval: (q) => {
      // Refresh right as an auto-rotating color expires, otherwise every 4s.
      const until = q.state.data?.theme?.validUntil;
      return until ? Math.max(500, Math.min(4000, until - Date.now() + 250)) : 4000;
    },
  });
}

export const liveGuest: GuestBackend = {
  useSession() {
    const { ready, authenticated, logout } = usePrivy();
    return { ready, authenticated, logout };
  },

  usePublicEvent(eventId) {
    return useQuery({
      queryKey: ["event", eventId],
      queryFn: async () => (await (await fetch(`/api/events/${eventId}`)).json()).event as PublicEvent,
    }).data;
  },

  useMe,

  useWallet(): GuestWallet {
    const { smartAccount } = useSmartAccount();
    return { ready: !!smartAccount, address: smartAccount?.address, sa: smartAccount };
  },

  useClaim(eventId, wallet) {
    const api = useApi();
    return useCallback(
      async (pin, onPhase) => {
        if (!wallet.sa) throw new Error("Wallet still loading — try again in a sec.");
        onPhase("verifying");
        let voucher: ClaimVoucher;
        try {
          ({ voucher } = await api<{ voucher: ClaimVoucher }>(`/api/events/${eventId}/claim`, {
            json: { pin, smartAccount: wallet.sa.address },
          }));
        } catch (e) {
          throw new Error(e instanceof ApiError ? e.message : "Couldn't reach the server.");
        }
        onPhase("minting");
        try {
          await (await sendClaim(wallet.sa, voucher)).receipt;
        } catch (e) {
          // Already minted (e.g. a retry after the first UserOp landed) counts as success.
          if (e instanceof Error && /VoucherAlreadyUsed/.test(e.message)) return;
          throw new Error("Couldn't mint your tickets. Try again in a sec.");
        }
      },
      [api, eventId, wallet.sa],
    );
  },

  useAfterClaim(eventId) {
    const qc = useQueryClient();
    return useCallback(() => {
      qc.invalidateQueries({ queryKey: ["me", eventId] });
      invalidateOnchain(qc);
    }, [qc, eventId]);
  },

  useMintStatus(wallet, event, claimId) {
    const { minted, total } = useOnchainTickets(event, wallet.address, claimId);
    return { minted, onchainTotal: total };
  },

  useBackgroundSync(eventId, wallet) {
    useDrainBurnQueue(wallet.sa, eventId);
  },

  useRefreshMe(eventId) {
    const qc = useQueryClient();
    return useCallback(() => qc.invalidateQueries({ queryKey: ["me", eventId] }), [qc, eventId]);
  },

  /**
   * tap ─┬─▶ same frame   theme from the /me cache (no network)
   *      ├─▶ ~100 ms      POST /redemptions → atomic Postgres ledger → VOID on 409
   *      └─▶ ~1–2 s       gasless redeemTicket UserOp (only after the ledger said OK)
   */
  useRedeem(eventId, wallet) {
    const qc = useQueryClient();
    const api = useApi();
    const burn = useBurn(wallet.sa);
    return useCallback(
      (tokenId: number) => {
        const cached = qc.getQueryData<MeResponse>(["me", eventId]);
        const theme = cached?.theme ?? null;
        const id = crypto.randomUUID();
        if (!theme || cached?.status.state === "not_on_list" || !cached) {
          return { theme: null, outcome: Promise.resolve({ verdict: "offline" } as RedeemOutcome), burn: () => {} };
        }

        // Optimistically decrement the local balance.
        const left = cached.status.remaining[tokenId] ?? 0;
        qc.setQueryData<MeResponse>(["me", eventId], (d) =>
          d && d.status.state !== "not_on_list"
            ? { ...d, status: { ...d.status, remaining: { ...d.status.remaining, [tokenId]: Math.max(0, left - 1) } } }
            : d,
        );

        const outcome: Promise<RedeemOutcome> = api<{ remaining: number; theme: ResolvedTheme }>(
          `/api/events/${eventId}/redemptions`,
          { json: { redemptionId: id, tokenId, amount: 1 } },
        ).then(
          (res) => ({ verdict: "ok", theme: res.theme }),
          (e) => {
            if (e instanceof ApiError && e.status === 409) {
              qc.invalidateQueries({ queryKey: ["me", eventId] });
              return { verdict: "void", code: e.code };
            }
            return { verdict: "offline" };
          },
        );

        return {
          theme,
          outcome,
          burn: (onState) =>
            void burn({ redemptionId: id, eventId, tokenId, amount: 1, createdAt: Date.now() }, onState),
        };
      },
      [qc, api, burn, eventId],
    );
  },
};

// ═════════════════════════════════════════════════════════════ host

export const liveHost: HostBackend = {
  useStaffSession() {
    const { ready, authenticated, login, logout } = usePrivy();
    return { ready, authenticated, login, logout };
  },

  useHostSettings(eventId) {
    const { authenticated } = usePrivy();
    const api = useApi();
    const q = useQuery({
      queryKey: ["host-settings", eventId],
      queryFn: () => api<HostSettingsData>(`/api/host/${eventId}/settings`),
      enabled: authenticated,
      retry: false,
      refetchInterval: (q) => {
        const until = q.state.data?.theme.validUntil;
        return until ? Math.max(500, Math.min(5000, until - Date.now() + 250)) : 5000;
      },
    });
    return {
      data: q.data,
      error: q.error
        ? { forbidden: q.error instanceof ApiError && q.error.status === 403, message: q.error.message }
        : undefined,
    };
  },

  useHostGuests(eventId) {
    const { authenticated } = usePrivy();
    const api = useApi();
    const q = useQuery({
      queryKey: ["host-guests", eventId],
      queryFn: () => api<{ guests: HostGuest[] }>(`/api/host/${eventId}/guests`),
      enabled: authenticated,
      retry: false,
      refetchInterval: 5000,
    });
    return { data: q.data?.guests, isLoading: q.isLoading };
  },

  useHostActions(eventId) {
    const api = useApi();
    const qc = useQueryClient();
    const setCheckedIn = useCallback(
      async (rsvpId: string, checkedIn: boolean) => {
        qc.setQueryData<{ guests: HostGuest[] }>(["host-guests", eventId], (d) =>
          d && {
            guests: d.guests.map((x) => (x.id === rsvpId ? { ...x, status: checkedIn ? "checked_in" : "rsvpd" } : x)),
          },
        );
        try {
          await api(`/api/host/${eventId}/guests/${rsvpId}`, { method: "PATCH", json: { checkedIn } });
        } finally {
          qc.invalidateQueries({ queryKey: ["host-guests", eventId] });
        }
      },
      [api, qc, eventId],
    );
    const saveSettings = useCallback(
      async (patch: Partial<HostSettings>) => {
        try {
          await api(`/api/host/${eventId}/settings`, { method: "PATCH", json: patch });
        } catch (e) {
          throw new Error(e instanceof ApiError ? e.message : "Save failed");
        }
        await qc.invalidateQueries({ queryKey: ["host-settings", eventId] });
      },
      [api, qc, eventId],
    );

    /**
     * Host Vouch. The host's device paints the success screen immediately (theme from its own
     * settings feed); the server records the admin redemption in the ledger and submits the
     * ADMIN_ROLE burn as a sponsored UserOp in the background. We poll for the tx hash.
     */
    const adminRedeem = useCallback(
      (rsvpId: string, tokenId: number): AdminRedeemHandle => {
        const redemptionId = crypto.randomUUID();
        const outcome: Promise<RedeemOutcome> = api<{ theme: ResolvedTheme }>(
          `/api/host/${eventId}/guests/${rsvpId}/redeem`,
          { json: { redemptionId, tokenId } },
        ).then(
          (r) => {
            qc.invalidateQueries({ queryKey: ["host-guests", eventId] });
            return { verdict: "ok", theme: r.theme };
          },
          (e) =>
            e instanceof ApiError && e.status === 409 ? { verdict: "void", code: e.code } : { verdict: "offline" },
        );
        return {
          outcome,
          burn: (onState) => {
            onState({ phase: "submitting" });
            const started = Date.now();
            const poll = async () => {
              try {
                const r = await api<{ userOpHash: `0x${string}` | null; txHash: `0x${string}` | null }>(
                  `/api/host/${eventId}/redemptions/${redemptionId}`,
                );
                if (r.txHash) return onState({ phase: "confirmed", txHash: r.txHash });
                if (r.userOpHash) onState({ phase: "pending", userOpHash: r.userOpHash });
              } catch {
                /* keep polling */
              }
              if (Date.now() - started < 60_000) setTimeout(poll, 1500);
              else onState({ phase: "queued", error: "still confirming" });
            };
            setTimeout(poll, 800);
          },
        };
      },
      [api, qc, eventId],
    );

    const transfer = useCallback(
      async (t: TransferInput) => {
        try {
          await api(`/api/host/${eventId}/transfers`, { json: t });
        } catch (e) {
          throw new Error(e instanceof ApiError ? e.message : "Transfer failed");
        } finally {
          qc.invalidateQueries({ queryKey: ["host-guests", eventId] });
        }
      },
      [api, qc, eventId],
    );

    return { setCheckedIn, saveSettings, adminRedeem, transfer };
  },
};
