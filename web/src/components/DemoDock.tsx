"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { demoDB } from "@/lib/demo/store";
import { DEMO_EVENT_ID } from "@/lib/mode";

const PANELS = [
  ["Guest phone", `/e/${DEMO_EVENT_ID}`],
  ["Door staff", `/host/${DEMO_EVENT_ID}?tab=door`],
  ["Door kiosk (QR)", `/host/${DEMO_EVENT_ID}/kiosk`],
  ["Host ledger", `/host/${DEMO_EVENT_ID}?tab=ledger`],
  ["Host settings", `/host/${DEMO_EVENT_ID}?tab=settings`],
  ["Bar display", `/host/${DEMO_EVENT_ID}/display`],
] as const;

/**
 * Demo Mode only: a tiny launcher to jump between the four personas while pitching.
 * Tip: open Guest and Host in two tabs side by side — state syncs live via localStorage.
 * Hidden on the redemption screen so it never sits near the REDEEM button.
 */
export function DemoDock() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  if (path.includes("/redeem/") || path.endsWith("/display") || path.endsWith("/kiosk")) return null;

  return (
    <div className="fixed bottom-3 right-3 z-30 flex flex-col items-end gap-2 font-mono text-[11px] uppercase">
      {open && (
        <div className="flex w-52 flex-col border-2 border-cheese bg-ink shadow-brutal">
          {PANELS.map(([label, href]) => (
            <Link key={href} href={href} target="_blank" onClick={() => setOpen(false)} className="border-b border-line px-3 py-2 text-paper hover:bg-ink-3">
              {label} ↗
            </Link>
          ))}
          <button
            onClick={() => {
              demoDB.reset();
              setOpen(false);
            }}
            className="px-3 py-2 text-left text-void hover:bg-ink-3"
          >
            Reset demo data
          </button>
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} className="border-2 border-cheese bg-ink px-3 py-1.5 tracking-widest text-cheese">
        Demo {open ? "✕" : "▴"}
      </button>
    </div>
  );
}
