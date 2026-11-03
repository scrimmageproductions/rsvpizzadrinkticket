"use client";

import { useState } from "react";
import { Button, H1, Kicker, Pill, Shell } from "@/components/ui";
import { demoLogin } from "@/lib/backend/demo";
import { sleep } from "@/lib/demo/store";
import type { PublicEvent } from "@/lib/types";

/** Demo Mode login: any email or phone, 1 s fake verification, straight to the PIN screen. */
export function DemoAuthScreen({ event }: { event: PublicEvent | undefined }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function go(id: string) {
    setBusy(true);
    await sleep(1000);
    demoLogin(id);
  }

  return (
    <Shell right={<Pill tone="warn">demo mode</Pill>}>
      <div className="flex flex-1 flex-col justify-between gap-10 pt-6">
        <div className="space-y-4">
          <Kicker>{event?.venue ?? "You're on the list"}</Kicker>
          <H1>{event?.name ?? "Pizza Party"}</H1>
          <p className="max-w-xs text-mute">
            Log in with the email or phone you RSVP&apos;d with. Your drink tickets live here — no app, no crypto stuff.
          </p>
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) go(value);
          }}
        >
          <input
            autoFocus
            placeholder="any email or phone"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full border-2 border-paper bg-ink-2 px-4 py-4 text-lg outline-none placeholder:text-mute focus:border-tomato"
          />
          <Button type="submit" loading={busy} disabled={!value.trim()}>
            Let me in
          </Button>
          <p className="pt-2 text-center font-mono text-[11px] uppercase leading-relaxed tracking-widest text-mute">
            Demo: no code needed. Unknown emails join the list as walk-ins.
            <br />
            Try <button type="button" className="underline" onClick={() => go("pepper@example.com")}>pepper@example.com</button>{" "}
            (already checked in) — PIN on the host screen.
          </p>
        </form>
      </div>
    </Shell>
  );
}
