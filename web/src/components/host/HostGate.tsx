"use client";

import type { ReactNode } from "react";
import { Button, H1, Kicker, Logo, Pill, Spinner } from "@/components/ui";
import { hostBackend, type HostSettingsData } from "@/lib/backend";
import { DEMO } from "@/lib/mode";

/**
 * Everything staff-only — guest list, Event PIN, the Visual 2FA color picker, the master ledger,
 * the bar display — renders only inside this gate. Guests never load any of it.
 */
export function HostGate({ eventId, children }: { eventId: string; children: (s: HostSettingsData) => ReactNode }) {
  const { ready, authenticated, login, logout } = hostBackend.useStaffSession();
  const settings = hostBackend.useHostSettings(eventId);

  const center = (c: ReactNode) => (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">{c}</div>
  );

  if (!ready) return center(<Spinner className="mx-auto h-10 w-10 text-tomato" />);
  if (!authenticated)
    return center(
      <>
        <div className="flex items-center justify-between">
          <Logo className="text-3xl" />
          {DEMO && <Pill tone="warn">demo mode</Pill>}
        </div>
        <Kicker>Host & door staff</Kicker>
        <H1>Staff login</H1>
        <Button onClick={login}>{DEMO ? "Enter as host (demo)" : "Log in"}</Button>
        {DEMO && (
          <p className="text-sm text-mute">Demo Mode skips staff auth. In production this is a Privy login checked against HOST_EMAILS.</p>
        )}
      </>,
    );
  if (settings.error) {
    return center(
      <>
        <H1>{settings.error.forbidden ? "Staff only" : "Event not found"}</H1>
        <p className="text-mute">
          {settings.error.forbidden ? "This login isn't on the staff list (HOST_EMAILS)." : settings.error.message}
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
