"use client";

import type { ReactNode } from "react";
import { AuthScreen } from "./AuthScreen";
import { Button, H1, Kicker, Shell } from "@/components/ui";
import { Splash } from "@/components/Splash";
import { guestBackend, type GuestWallet, type MeResponse } from "@/lib/backend";

export type GuestCtx = {
  me: MeResponse & { status: Exclude<MeResponse["status"], { state: "not_on_list" }> };
  wallet: GuestWallet;
};

/** Handles loading → login → "not on the list" so every guest screen gets a ready context. */
export function GuestGate({ eventId, children }: { eventId: string; children: (ctx: GuestCtx) => ReactNode }) {
  const { ready, authenticated, logout } = guestBackend.useSession();
  const publicEvent = guestBackend.usePublicEvent(eventId);
  const me = guestBackend.useMe(eventId);
  const wallet = guestBackend.useWallet();

  if (!ready) return <Splash />;
  if (!authenticated) return <AuthScreen event={publicEvent} />;
  if (!me.data) return me.isError ? <Problem title="Can't reach the party" onRetry={me.refetch} /> : <Splash />;

  if (me.data.status.state === "not_on_list") {
    return (
      <Shell>
        <div className="flex flex-1 flex-col justify-center gap-6">
          <Kicker>{me.data.event.name}</Kicker>
          <H1>Not on the list</H1>
          <p className="text-mute">
            We couldn&apos;t match this login to an RSVP. Use the same email or phone you RSVP&apos;d with on rsv.pizza.
          </p>
          <Button variant="ghost" onClick={logout}>
            Try another login
          </Button>
        </div>
      </Shell>
    );
  }

  return <>{children({ me: me.data as GuestCtx["me"], wallet })}</>;
}

function Problem({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <Shell>
      <div className="flex flex-1 flex-col justify-center gap-6">
        <H1>{title}</H1>
        <Button onClick={onRetry}>Retry</Button>
      </div>
    </Shell>
  );
}
