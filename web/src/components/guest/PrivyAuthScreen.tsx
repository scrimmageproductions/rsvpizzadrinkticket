"use client";

import { useState } from "react";
import { useLoginWithEmail, useLoginWithOAuth, useLoginWithSms } from "@privy-io/react-auth";
import { AnimatePresence, motion } from "framer-motion";
import { Button, ErrorNote, H1, Kicker, Shell } from "@/components/ui";
import type { PublicEvent } from "@/lib/types";

/**
 * 1. AUTH — plain Web2 login. Privy silently provisions a non-custodial embedded wallet;
 *    the guest never sees a seed phrase, an address, or a gas fee.
 */
export function PrivyAuthScreen({ event }: { event: PublicEvent | undefined }) {
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const email = useLoginWithEmail({ onError: (e) => setErr(String(e)) });
  const sms = useLoginWithSms({ onError: (e) => setErr(String(e)) });
  const { initOAuth } = useLoginWithOAuth();

  const flow = mode === "email" ? email : sms;
  const awaitingCode = flow.state.status === "awaiting-code-input" || flow.state.status === "submitting-code";

  async function send() {
    setErr(null);
    setBusy(true);
    try {
      if (mode === "email") await email.sendCode({ email: value.trim() });
      else await sms.sendCode({ phoneNumber: value.trim() });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't send code");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setErr(null);
    setBusy(true);
    try {
      await flow.loginWithCode({ code: code.trim() });
    } catch {
      setErr("That code didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="flex flex-1 flex-col justify-between gap-10 pt-6">
        <div className="space-y-4">
          <Kicker>{event?.venue ?? "You're on the list"}</Kicker>
          <H1>{event?.name ?? "Pizza Party"}</H1>
          <p className="max-w-xs text-mute">
            Log in with the email or phone you RSVP&apos;d with. Your drink tickets live here — no app, no crypto stuff.
          </p>
        </div>

        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {!awaitingCode ? (
              <motion.form
                key="id"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <div className="grid grid-cols-2 border-2 border-line font-mono text-xs uppercase tracking-widest">
                  {(["email", "phone"] as const).map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => {
                        setMode(m);
                        setValue("");
                      }}
                      className={`py-2 ${mode === m ? "bg-paper text-ink" : "text-mute"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <input
                  autoFocus
                  inputMode={mode === "email" ? "email" : "tel"}
                  autoComplete={mode === "email" ? "email" : "tel"}
                  placeholder={mode === "email" ? "you@pizza.com" : "+1 555 555 0123"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full border-2 border-paper bg-ink-2 px-4 py-4 text-lg outline-none placeholder:text-mute focus:border-tomato"
                />
                <Button type="submit" loading={busy} disabled={!value}>
                  Send code
                </Button>
              </motion.form>
            ) : (
              <motion.form
                key="code"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  verify();
                }}
              >
                <Kicker>Code sent to {value}</Kicker>
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="••••••"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full border-2 border-paper bg-ink-2 px-4 py-4 text-center font-mono text-3xl tracking-[0.5em] outline-none focus:border-tomato"
                />
                <Button type="submit" loading={busy} disabled={code.length < 6}>
                  Let me in
                </Button>
              </motion.form>
            )}
          </AnimatePresence>

          {!awaitingCode && (
            <>
              <div className="flex items-center gap-3 font-mono text-xs uppercase text-mute">
                <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
              </div>
              <Button variant="ghost" onClick={() => initOAuth({ provider: "google" })}>
                Continue with Google
              </Button>
            </>
          )}
          <ErrorNote>{err}</ErrorNote>
        </div>
      </div>
    </Shell>
  );
}
