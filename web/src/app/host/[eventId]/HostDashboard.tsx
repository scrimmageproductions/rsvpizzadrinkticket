"use client";

import Link from "next/link";
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { HostGate } from "@/components/host/HostGate";
import { GuestList } from "@/components/host/GuestList";
import { SettingsPanel } from "@/components/host/SettingsPanel";
import { Logo } from "@/components/ui";

export function HostDashboard({ eventId }: { eventId: string }) {
  const [tab, setTab] = useState<"door" | "settings">("door");
  const { logout } = usePrivy();

  return (
    <HostGate eventId={eventId}>
      {(data) => (
        <div className="mx-auto w-full max-w-5xl px-5 py-6">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-paper pb-4">
            <div>
              <Logo />
              <h1 className="font-display text-3xl uppercase leading-none">{data.eventName}</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-6 w-6 border-2 border-paper" style={{ backgroundColor: data.theme.hex }} />
              <Link
                href={`/host/${eventId}/display`}
                target="_blank"
                className="border-2 border-paper px-3 py-2 font-mono text-xs uppercase"
              >
                Bar display ↗
              </Link>
              <button onClick={logout} className="px-3 py-2 font-mono text-xs uppercase text-mute">
                Log out
              </button>
            </div>
          </header>

          <nav className="my-6 grid grid-cols-2 border-2 border-paper font-display text-lg uppercase sm:w-96">
            {(["door", "settings"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`py-3 ${tab === t ? "bg-tomato text-ink" : "text-paper"}`}
              >
                {t === "door" ? "Guest list" : "Event settings"}
              </button>
            ))}
          </nav>

          {tab === "door" ? <GuestList eventId={eventId} /> : <SettingsPanel eventId={eventId} data={data} />}
        </div>
      )}
    </HostGate>
  );
}
