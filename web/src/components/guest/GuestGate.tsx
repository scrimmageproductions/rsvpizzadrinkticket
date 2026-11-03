"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AuthScreen, type AuthPrefill } from "./AuthScreen";
import { Button, H1, Kicker, Shell } from "@/components/ui";
import { Splash } from "@/components/Splash";
import { guestBackend, type GuestWallet, type MeResponse } from "@/lib/backend";
import { presenceKey } from "@/lib/kiosk";

export type GuestCtx = {
  me: MeResponse & { status: Exclude<MeResponse["status"], { state: "not_on_list" }> };
  wallet: GuestWallet;
};

type Notice = { tone: "ok" | "info" | "bad"; text: string } | null;

/**
 * Handles loading → login → "not on the list" so every guest screen gets a ready context.
 *
 * Also the landing point for two door flows that arrive as URL params:
 *   ?kiosk=<30 s code>  — scanned from the door screen. Exchanged at once for a 10-min presence
 *                         pass (sessionStorage), then redeemed for the check-in after login.
 *   ?invite=<token>     — pre-arrival link. Pre-fills the login and auto-sends the code.
 * Both params are stripped from the URL immediately, so they never linger in history or get shared.
 */
export function GuestGate({ eventId, children }: { eventId: string; children: (ctx: GuestCtx) => ReactNode }) {
  const { ready, authenticated, logout } = guestBackend.useSession();
  const publicEvent = guestBackend.usePublicEvent(eventId);
  const me = guestBackend.useMe(eventId);
  const wallet = guestBackend.useWallet();
  const door = guestBackend.useDoor(eventId);

  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [notice, setNotice] = useState<Notice>(null);
  const [prefill, setPrefill] = useState<AuthPrefill | null>(null);
  const [presenceTick, setPresenceTick] = useState(0);
  const handled = useRef<string | null>(null);

  const kioskParam = params.get("kiosk");
  const inviteParam = params.get("invite");

  // 1. Consume URL params once, then strip them.
  useEffect(() => {
    const sig = `${kioskParam}|${inviteParam}`;
    if ((!kioskParam && !inviteParam) || handled.current === sig) return;
    handled.current = sig;
    router.replace(pathname, { scroll: false });

    if (kioskParam) {
      door
        .kioskPresence(kioskParam)
        .then((pass) => {
          sessionStorage.setItem(presenceKey(eventId), pass);
          setNotice({ tone: "info", text: "Door scan ✓ — checking you in…" });
          setPresenceTick((t) => t + 1);
        })
        .catch((e: Error) => setNotice({ tone: "bad", text: e.message }));
    }
    if (inviteParam) {
      door
        .resolveInvite(inviteParam)
        .then((inv) => {
          if (inv.loggedIn) return setNotice({ tone: "ok", text: `Welcome, ${inv.name.split(" ")[0]} — you're all set.` });
          const identifier = inv.email ?? inv.phone;
          if (identifier) setPrefill({ identifier, kind: inv.email ? "email" : "phone", name: inv.name, autoSend: true });
        })
        .catch((e: Error) => setNotice({ tone: "bad", text: e.message }));
    }
  }, [kioskParam, inviteParam, door, eventId, pathname, router]);

  // 2. Logged in + holding a presence pass → finish the kiosk check-in (Layer 1).
  useEffect(() => {
    if (!ready || !authenticated) return;
    let pass: string | null = null;
    try {
      pass = sessionStorage.getItem(presenceKey(eventId));
      if (pass) sessionStorage.removeItem(presenceKey(eventId)); // one shot
    } catch {
      /* storage blocked */
    }
    if (!pass) return;
    door
      .kioskCheckin(pass)
      .then(() => setNotice({ tone: "ok", text: "Checked in at the door ✓ — now enter the PIN from the sign." }))
      .catch((e: Error) => setNotice({ tone: "bad", text: e.message }));
  }, [ready, authenticated, presenceTick, door, eventId]);

  // Auto-hide success / info toasts.
  useEffect(() => {
    if (!notice || notice.tone === "bad") return;
    const id = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  let body: ReactNode;
  if (!ready) body = <Splash />;
  else if (!authenticated) body = <AuthScreen event={publicEvent} prefill={prefill} />;
  else if (!me.data) body = me.isError ? <Problem title="Can't reach the party" onRetry={me.refetch} /> : <Splash />;
  else if (me.data.status.state === "not_on_list") {
    body = (
      <Shell>
        <div className="flex flex-1 flex-col justify-center gap-6">
          <Kicker>{me.data.event.name}</Kicker>
          <H1>Not on the list</H1>
          <p className="text-mute">
            We couldn&apos;t match this login to an RSVP. Use the same email or phone you RSVP&apos;d with on rsv.pizza.
          </p>
          <Button variant="ghost" onClick={logout}>
            Try another login
          </Button>
        </div>
      </Shell>
    );
  } else body = children({ me: me.data as GuestCtx["me"], wallet });

  return (
    <>
      {body}
      <DoorNotice notice={notice} onClose={() => setNotice(null)} />
    </>
  );
}

function DoorNotice({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const tone = { ok: "border-basil text-basil", info: "border-cheese text-cheese", bad: "border-void text-void" };
  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          role={notice.tone === "bad" ? "alert" : "status"}
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className={`fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 mx-auto flex max-w-md items-start gap-3 border-2 bg-ink px-4 py-3 shadow-brutal ${tone[notice.tone]}`}
        >
          <p className="flex-1 font-mono text-xs font-bold uppercase leading-relaxed tracking-wider">{notice.text}</p>
          <button onClick={onClose} aria-label="Dismiss" className="font-mono text-xs">
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Problem({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <Shell>
      <div className="flex flex-1 flex-col justify-center gap-6">
        <H1>{title}</H1>
        <Button onClick={onRetry}>Retry</Button>
      </div>
    </Shell>
  );
}
