"use client";

import { useState } from "react";
import { Button, ErrorNote, Kicker } from "@/components/ui";
import { hostBackend, type HostSettingsData } from "@/lib/backend";
import { nextTokenId, TicketTypesSchema } from "@/lib/tickets";
import type { TicketType } from "@/lib/types";

const EMOJI = ["🍺", "🍕", "🍸", "🥤", "🍷", "🌮", "👕", "🧢", "🎟️", "⭐"];

/**
 * TICKETS & BUDGET — what every guest gets at check-in, custom types (e.g. 👕 Merch Item), and
 * the event budget that drives the progress bar. Edits stay local until saved. Already-claimed
 * guests keep the bundle they minted; changes apply to claims from now on.
 */
export function TicketConfig({ eventId, data }: { eventId: string; data: HostSettingsData }) {
  const { saveSettings } = hostBackend.useHostActions(eventId);
  const { data: guests } = hostBackend.useHostGuests(eventId);
  const [draft, setDraft] = useState<TicketType[] | null>(null);
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState<"tickets" | "budget" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const types = draft ?? data.ticketTypes;
  const dirty = draft !== null;
  const edit = (i: number, patch: Partial<TicketType>) =>
    setDraft(types.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  const bundle = types.filter((t) => t.amount > 0);
  const perGuest = bundle.reduce((a, t) => a + t.amount, 0);
  const rsvps = guests?.length ?? 0;
  const budget = data.settings.eventBudget;

  async function save(kind: "tickets" | "budget", fn: () => Promise<void>) {
    setErr(null);
    setSaved(null);
    setBusy(kind);
    try {
      await fn();
      setSaved(kind === "tickets" ? "Ticket setup saved" : "Budget saved");
      if (kind === "tickets") setDraft(null);
      else setBudgetDraft(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  function saveTickets() {
    const parsed = TicketTypesSchema.safeParse(types.map((t) => ({ ...t, label: t.label.trim() })));
    if (!parsed.success) return setErr(parsed.error.issues[0]?.message ?? "Check your ticket types");
    void save("tickets", () => saveSettings({ ticketTypes: parsed.data }));
  }

  function saveBudget() {
    const raw = (budgetDraft ?? "").trim();
    const n = raw === "" ? null : Number(raw);
    if (n !== null && (!Number.isInteger(n) || n < 0)) return setErr("Budget must be a whole number of tickets.");
    void save("budget", () => saveSettings({ eventBudget: n }));
  }

  return (
    <div className="space-y-6 border-2 border-line p-5 lg:col-span-2">
      {/* Ticket configuration */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Kicker>Tickets handed out at check-in</Kicker>
          <p className="font-mono text-[11px] uppercase tracking-widest text-mute">
            {bundle.length ? `each new guest gets ${bundle.map((t) => `${t.amount}× ${t.emoji}`).join(" + ")}` : "nothing — add an amount"}
          </p>
        </div>

        <ul className="divide-y-2 divide-line border-2 border-line">
          {types.map((t, i) => (
            <li key={t.tokenId} className="flex flex-wrap items-center gap-3 px-3 py-3">
              <select
                aria-label={`Emoji for ${t.label}`}
                value={EMOJI.includes(t.emoji) ? t.emoji : "custom"}
                onChange={(e) => e.target.value !== "custom" && edit(i, { emoji: e.target.value })}
                className="border-2 border-line bg-ink-2 px-2 py-2 text-xl"
              >
                {!EMOJI.includes(t.emoji) && <option value="custom">{t.emoji}</option>}
                {EMOJI.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
              <input
                aria-label="Ticket name"
                value={t.label}
                maxLength={24}
                onChange={(e) => edit(i, { label: e.target.value })}
                className="min-w-40 flex-1 border-2 border-line bg-ink-2 px-3 py-2 font-display uppercase outline-none focus:border-tomato"
              />
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] uppercase text-mute">at check-in</span>
                <div className="flex items-center border-2 border-paper">
                  <button className="px-3 py-1 font-display" aria-label={`Fewer ${t.label}`} disabled={t.amount <= 0} onClick={() => edit(i, { amount: t.amount - 1 })}>
                    −
                  </button>
                  <span className="w-8 text-center font-display tabular-nums">{t.amount}</span>
                  <button className="px-3 py-1 font-display" aria-label={`More ${t.label}`} disabled={t.amount >= 20} onClick={() => edit(i, { amount: t.amount + 1 })}>
                    +
                  </button>
                </div>
              </div>
              <span className="font-mono text-[10px] uppercase text-mute">id {t.tokenId}</span>
              <button
                aria-label={`Delete ${t.label}`}
                disabled={types.length <= 1}
                onClick={() => setDraft(types.filter((_, j) => j !== i))}
                className="px-2 font-mono text-xs text-mute hover:text-void disabled:opacity-30"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() =>
              setDraft([...types, { tokenId: nextTokenId(types), label: "Merch Item", emoji: "👕", amount: 1 }])
            }
            disabled={types.length >= 12}
            className="border-2 border-dashed border-line px-3 py-2 font-mono text-xs uppercase text-paper hover:border-paper"
          >
            + Add ticket type
          </button>
          {dirty && (
            <>
              <Button variant="paper" className="w-auto px-4 py-2 text-sm" loading={busy === "tickets"} onClick={saveTickets}>
                Save tickets
              </Button>
              <button onClick={() => setDraft(null)} className="font-mono text-xs uppercase text-mute">
                discard
              </button>
            </>
          )}
        </div>
        <p className="text-sm text-mute">
          Changes apply to guests who claim from now on — anyone who already claimed keeps their bundle. Set a type to 0 to
          stop handing it out but keep it available for 🎁 Grant tickets. Types guests already hold can&apos;t be deleted.
        </p>
      </div>

      {/* Budget */}
      <div className="space-y-3 border-t-2 border-line pt-5">
        <Kicker>Event budget (tickets you&apos;ll pay for)</Kicker>
        <div className="flex flex-wrap items-center gap-3">
          <input
            inputMode="numeric"
            aria-label="Event budget"
            placeholder="no budget"
            value={budgetDraft ?? (budget === null ? "" : String(budget))}
            onChange={(e) => setBudgetDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
            className="w-40 border-2 border-paper bg-ink-2 px-3 py-2 font-display text-2xl tabular-nums outline-none focus:border-tomato"
          />
          <Button
            variant="paper"
            className="w-auto px-4 py-2 text-sm"
            loading={busy === "budget"}
            disabled={budgetDraft === null}
            onClick={saveBudget}
          >
            Save budget
          </Button>
          {rsvps > 0 && perGuest > 0 && (
            <button
              onClick={() => setBudgetDraft(String(rsvps * perGuest))}
              className="font-mono text-[11px] uppercase text-mute underline"
            >
              suggest {rsvps * perGuest} ({rsvps} RSVPs × {perGuest})
            </button>
          )}
        </div>
        <p className="text-sm text-mute">Shown as the progress bar at the top of the dashboard. Leave empty for no budget.</p>
      </div>

      {saved && <p className="font-mono text-xs uppercase tracking-widest text-basil">✓ {saved}</p>}
      <ErrorNote>{err}</ErrorNote>
    </div>
  );
}
