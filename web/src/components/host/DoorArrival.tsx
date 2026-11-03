"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, ErrorNote, Kicker } from "@/components/ui";
import { hostBackend, type HostSettingsData } from "@/lib/backend";
import { DEMO } from "@/lib/mode";
import type { PreArrivalResult } from "@/lib/types";

/**
 * DOOR & ARRIVAL — the two ways to get guests through the door without a staff bottleneck:
 *   • Kiosk mode: unmanned self check-in via the rotating QR on /host/[eventId]/kiosk
 *   • Pre-arrival links: log in + wallet setup before they leave home
 */
export function DoorArrival({ eventId, data }: { eventId: string; data: HostSettingsData }) {
  const { saveSettings, sendPreArrivalLinks } = hostBackend.useHostActions(eventId);
  const { data: guests } = hostBackend.useHostGuests(eventId);
  const [busy, setBusy] = useState<"kiosk" | "links" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<PreArrivalResult | null>(null);
  const kioskOn = data.settings.kioskEnabled;
  const pending = (guests ?? []).filter((g) => g.status === "rsvpd" && !g.claimedAt).length;

  async function run<T>(key: "kiosk" | "links", fn: () => Promise<T>) {
    setErr(null);
    setBusy(key);
    try {
      return await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 border-2 border-line p-5 lg:col-span-2">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Kiosk */}
        <div className="space-y-3">
          <Kicker>Unmanned door · kiosk mode</Kicker>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-mute">
              Guests scan a rotating QR at the entrance to check themselves in. The code changes every 30 s.
            </p>
            <button
              role="switch"
              aria-checked={kioskOn}
              aria-label="Kiosk mode"
              disabled={busy === "kiosk"}
              onClick={() => run("kiosk", () => saveSettings({ kioskEnabled: !kioskOn }))}
              className={`relative h-9 w-16 shrink-0 border-2 border-paper transition-colors ${kioskOn ? "bg-basil" : "bg-ink-3"}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 bg-paper transition-all ${kioskOn ? "left-8" : "left-0.5"}`} />
            </button>
          </div>
          <Link
            href={`/host/${eventId}/kiosk`}
            target="_blank"
            className="inline-block border-2 border-paper px-3 py-2 font-mono text-xs uppercase"
          >
            Open door kiosk screen ↗
          </Link>
        </div>

        {/* Pre-arrival links */}
        <div className="space-y-3">
          <Kicker>Pre-arrival links</Kicker>
          <p className="text-sm text-mute">
            Email every guest who hasn&apos;t arrived ({pending}) a link that logs them in and sets up their wallet at
            home. At the door they only need the PIN.
          </p>
          <Button
            variant="paper"
            loading={busy === "links"}
            disabled={!pending}
            onClick={async () => {
              const r = await run("links", sendPreArrivalLinks);
              if (r) setResult(r);
            }}
          >
            Send pre-arrival links
          </Button>
        </div>
      </div>

      {result && (
        <div className="space-y-2 border-t-2 border-line pt-4">
          <p className="font-mono text-xs uppercase tracking-widest">
            {result.sent.length} link{result.sent.length === 1 ? "" : "s"} prepared
            {result.skipped.length ? ` · ${result.skipped.length} skipped` : ""}
            {result.sent.some((s) => !s.delivered) &&
              (DEMO ? " · demo mode — nothing was emailed" : " · email provider not connected — links logged on the server")}
          </p>
          <ul className="max-h-56 divide-y divide-line overflow-y-auto border border-line text-sm">
            {result.sent.map((s) => (
              <li key={s.rsvpId} className="flex flex-wrap items-center gap-x-3 px-3 py-2">
                <span className="font-bold">{s.name}</span>
                <span className="font-mono text-xs text-mute">{s.to}</span>
                <span className={`font-mono text-[11px] uppercase ${s.delivered ? "text-basil" : "text-cheese"}`}>
                  {s.delivered ? "emailed" : DEMO ? "demo · not emailed" : "not emailed"}
                </span>
                {DEMO && (
                  <a href={s.link} target="_blank" rel="noreferrer" className="ml-auto font-mono text-[11px] uppercase underline">
                    open as guest ↗
                  </a>
                )}
              </li>
            ))}
            {result.skipped.map((s) => (
              <li key={s.rsvpId} className="flex gap-3 px-3 py-2 text-mute">
                <span className="font-bold">{s.name}</span>
                <span className="font-mono text-xs">skipped: {s.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ErrorNote>{err}</ErrorNote>
    </div>
  );
}
