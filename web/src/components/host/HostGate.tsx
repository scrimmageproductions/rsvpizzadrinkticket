"use client";

import { usePrivy } from "@privy-io/react-auth";
import type { ReactNode } from "react";
import { Button, H1, Kicker, Logo, Spinner } from "@/components/ui";
import { useHostSettings, type SettingsResponse } from "@/hooks/useHost";
import { ApiError } from "@/lib/api";

export function HostGate({ eventId, children }: { eventId: string; children: (s: SettingsResponse) => ReactNode }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const settings = useHostSettings(eventId);

  const center = (c: ReactNode) => (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">{c}</div>
  );

  if (!ready) return center(<Spinner className="mx-auto h-10 w-10 text-tomato" />);
  if (!authenticated)
    return center(
      <>
        <Logo className="text-3xl" />
        <Kicker>Host & door staff</Kicker>
        <H1>Staff login</H1>
        <Button onClick={login}>Log in</Button>
      </>,
    );
  if (settings.error) {
    const forbidden = settings.error instanceof ApiError && settings.error.status === 403;
    return center(
      <>
        <H1>{forbidden ? "Staff only" : "Event not found"}</H1>
        <p className="text-mute">
          {forbidden ? "This login isn't on the staff list (HOST_EMAILS)." : String(settings.error.message)}
        </p>
        <Button variant="ghost" onClick={logout}>
          Switch account
        </Button>
      </>,
    );
  }
  if (!settings.data) return center(<Spinner className="mx-auto h-10 w-10 text-tomato" />);
  return <>{children(settings.data)}</>;
}
