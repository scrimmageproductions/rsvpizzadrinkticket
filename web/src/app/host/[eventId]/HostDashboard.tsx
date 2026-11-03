"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HostGate } from "@/components/host/HostGate";
import { GuestList } from "@/components/host/GuestList";
import { MasterLedger } from "@/components/host/MasterLedger";
import { SettingsPanel } from "@/components/host/SettingsPanel";
import { ExportReport } from "@/components/host/ExportReport";
import { Logo, Pill } from "@/components/ui";
import { hostBackend } from "@/lib/backend";
import { DEMO } from "@/lib/mode";

const TABS = [
  ["door", "Door list"],
  ["ledger", "Guest ledger"],
  ["settings", "Event settings"],
] as const;
type Tab = (typeof TABS)[number][0];

export function HostDashboard({ eventId }: { eventId: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const tab: Tab = (TABS.map((t) => t[0]) as string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "door";
  const { logout } = hostBackend.useStaffSession();
  const setTab = (t: Tab) => router.replace(`/host/${eventId}?tab=${t}`, { scroll: false });

  return (
    <HostGate eventId={eventId}>
      {(data) => (
        <div className="mx-auto w-full max-w-5xl px-5 py-6">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-paper pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Logo />
                {DEMO && <Pill tone="warn">demo</Pill>}
              </div>
              <h1 className="font-display text-3xl uppercase leading-none">{data.eventName}</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-6 w-6 border-2 border-paper" style={{ backgroundColor: data.theme.hex }} title="Tonight's color (staff only)" />
              <Link href={`/host/${eventId}/kiosk`} target="_blank" className="border-2 border-paper px-3 py-2 font-mono text-xs uppercase">
                Door kiosk ↗
              </Link>
              <Link href={`/host/${eventId}/display`} target="_blank" className="border-2 border-paper px-3 py-2 font-mono text-xs uppercase">
                Bar display ↗
              </Link>
              <button onClick={logout} className="px-3 py-2 font-mono text-xs uppercase text-mute">
                Log out
              </button>
            </div>
          </header>

          <nav className="my-6 grid grid-cols-3 border-2 border-paper font-display text-sm uppercase sm:w-[36rem] sm:text-lg">
            {TABS.map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)} className={`px-2 py-3 ${tab === t ? "bg-tomato text-ink" : "text-paper"}`}>
                {label}
              </button>
            ))}
          </nav>

          {tab === "door" && <GuestList eventId={eventId} />}
          {tab === "ledger" && <MasterLedger eventId={eventId} settings={data} />}
          {tab === "settings" && <SettingsPanel eventId={eventId} data={data} />}

          <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t-2 border-line pt-6">
            <ExportReport eventId={eventId} />
            <p className="font-mono text-[11px] uppercase tracking-widest text-mute">
              Minted + transferred − redeemed (guest + vouch) = remaining
            </p>
          </footer>
        </div>
      )}
    </HostGate>
  );
}
