"use client";

import { useState } from "react";
import { Button, ErrorNote, Kicker } from "@/components/ui";
import { ThemeCountdown } from "./ThemeCountdown";
import { DoorArrival } from "./DoorArrival";
import { PALETTE, THEME_KEYS, type ThemeKey } from "@/lib/theme";
import { hostBackend, type HostSettingsData } from "@/lib/backend";
import type { HostSettings } from "@/lib/types";

/**
 * HOST / ADMIN — Event PIN + Visual 2FA control. Staff-only (rendered inside HostGate);
 * this is the ONLY place the Theme Color can be picked or previewed before a redemption.
 */
export function SettingsPanel({ eventId, data }: { eventId: string; data: HostSettingsData }) {
  const { saveSettings } = hostBackend.useHostActions(eventId);
  const [pin, setPin] = useState(data.settings.eventPin);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const s = data.settings;

  async function save(key: string, patch: Partial<HostSettings>) {
    setErr(null);
    setSaving(key);
    try {
      await saveSettings(patch);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  const togglePalette = (k: ThemeKey) => {
    const next = s.themePalette.includes(k) ? s.themePalette.filter((x: string) => x !== k) : [...s.themePalette, k];
    if (next.length >= 2) save("palette", { themePalette: next });
  };

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      {/* Current color */}
      <div
        className="flex min-h-56 flex-col justify-between border-2 border-paper p-5 lg:col-span-2"
        style={{ backgroundColor: data.theme.hex, color: data.theme.ink }}
      >
        <p className="font-mono text-xs font-bold uppercase tracking-[0.3em]">Theme color of the night · live</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <p className="font-display text-6xl uppercase leading-none">{data.theme.name}</p>
          <p className="font-mono text-sm font-bold uppercase">
            <ThemeCountdown until={data.theme.validUntil} />
          </p>
        </div>
      </div>

      {/* PIN */}
      <div className="space-y-3 border-2 border-line p-5">
        <Kicker>Event PIN (print it on the sign)</Kicker>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^0-9a-z]/gi, "").toUpperCase().slice(0, 12))}
          className="w-full border-2 border-paper bg-ink-2 px-4 py-4 text-center font-display text-5xl tracking-[0.3em] outline-none focus:border-tomato"
        />
        <Button
          variant="paper"
          loading={saving === "pin"}
          disabled={pin === s.eventPin || pin.length < 3}
          onClick={() => save("pin", { eventPin: pin })}
        >
          Update PIN
        </Button>
        <p className="text-sm text-mute">
          Guests need this <em>and</em> a door check-in to mint. Changing it mid-event only affects new claims.
        </p>
      </div>

      {/* Visual 2FA */}
      <div className="space-y-4 border-2 border-line p-5">
        <Kicker>Visual 2FA mode</Kicker>
        <div className="grid grid-cols-2 border-2 border-paper font-display uppercase">
          {(["manual", "auto"] as const).map((m) => (
            <button
              key={m}
              onClick={() => save("mode", { themeMode: m })}
              className={`py-3 ${s.themeMode === m ? "bg-paper text-ink" : "text-paper"}`}
            >
              {m === "manual" ? "Manual" : "Auto-rotate"}
            </button>
          ))}
        </div>

        {s.themeMode === "auto" && (
          <label className="flex items-center justify-between gap-3">
            <span className="font-mono text-sm uppercase">Rotate every</span>
            <select
              value={s.rotationMinutes}
              onChange={(e) => save("rot", { rotationMinutes: Number(e.target.value) })}
              className="border-2 border-paper bg-ink-2 px-3 py-2 font-mono"
            >
              {[1, 5, 10, 15, 20, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
        )}

        <p className="font-mono text-xs uppercase text-mute">
          {s.themeMode === "manual" ? "Tap to set tonight's color" : "Colors in rotation (tap to include / exclude)"}
        </p>
        <div className="grid grid-cols-4 gap-2">
          {THEME_KEYS.map((k) => {
            const active = s.themeMode === "manual" ? s.themeColor === k : s.themePalette.includes(k);
            return (
              <button
                key={k}
                title={PALETTE[k].name}
                onClick={() => (s.themeMode === "manual" ? save("color", { themeColor: k }) : togglePalette(k))}
                className={`press aspect-square border-4 ${active ? "border-paper" : "border-transparent opacity-40"}`}
                style={{ backgroundColor: PALETTE[k].hex }}
              >
                <span className="sr-only">{PALETTE[k].name}</span>
                {active && <span style={{ color: PALETTE[k].ink }} className="font-display text-xl">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
      <DoorArrival eventId={eventId} data={data} />

      <div className="lg:col-span-2">
        <ErrorNote>{err}</ErrorNote>
      </div>
    </section>
  );
}
