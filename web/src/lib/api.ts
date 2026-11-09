"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback } from "react";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** fetch() with the Privy access token attached; throws ApiError on non-2xx. */
export function useApi() {
  const { getAccessToken } = usePrivy();
  return useCallback(
    async <T,>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> => {
      const token = await getAccessToken();
      const res = await fetch(path, {
        ...init,
        method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
        headers: {
          ...(init?.json !== undefined ? { "content-type": "application/json" } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...init?.headers,
        },
        body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!res.ok) throw new ApiError(res.status, body.error ?? "error", body.message ?? body.error ?? res.statusText, body);
      return body as T;
    },
    [getAccessToken],
  );
}

/** Refresh every wagmi contract read (on-chain balances, claimUsed). */
export const invalidateOnchain = (qc: import("@tanstack/react-query").QueryClient) =>
  qc.invalidateQueries({
    predicate: (q) => q.queryKey[0] === "readContract" || q.queryKey[0] === "readContracts",
  });
