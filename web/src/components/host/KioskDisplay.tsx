"use client";

import QRCode from "qrcode";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button, Logo } from "@/components/ui";
import { hostBackend, type HostSettingsData } from "@/lib/backend";
import { KIOSK_STEP_MS } from "@/lib/kiosk";
import { useNow } from "@/hooks/useNow";

/**
 * UNMANNED DOOR — guest-facing iPad / TV at the entrance.
 *
 * Shows a screen-filling QR of  <app>/e/<eventId>?kiosk=<code>  where the code rotates every 30 s
 * (see lib/kiosk.ts). Scanning it with the phone camera checks the guest in (Layer 1) — no staff
 * tap needed. Layer 2 (the Event PIN on the sign inside) still applies.
 *
 * Deliberately NOT the bar display: this screen faces guests, so it never shows the Visual 2FA color.
 */
export function KioskDisplay({ eventId, data }: { eventId: string; data: HostSettingsData }) {
  const enabled = data.settings.kioskEnabled;
  const { saveSettings } = hostBackend.useHostActions(eventId);
  const kiosk = hostBackend.useKioskCode(eventId, enabled);
  const [busy, setBusy] = useState(false);
  const now = useNow(250);
  const [qr, setQr] = useState<{ url: string; svg: string } | null>(null);

  const origin = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
  const url = kiosk.data ? `${origin}/e/${encodeURIComponent(eventId)}?kiosk=${kiosk.data.code}` : null;

  // Render the QR as SVG (crisp at any size, works offline once the page is loaded).
  useEffect(() => {
    if (!url) return;
    let live = true;
    QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#000000", light: "#FFFFFF" } }).then(
      (svg) => live && setQr({ url, svg }),
    );
    return () => {
      live = false;
    };
  }, [url]);

  // Keep the kiosk awake (Screen Wake Lock API; silently ignored where unsupported).
  useEffect(() => {
    if (!enabled) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const acquire = () => nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    acquire();
    const onVis = () => document.visibilityState === "visible" && acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
    };
  }, [enabled]);

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      await saveSettings({ kioskEnabled: on });
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6">
        <Logo className="text-3xl" />
        <h1 className="font-display text-5xl uppercase leading-[0.9]">Kiosk mode is off</h1>
        <p className="text-mute">
          Turn it on to let guests self-check-in by scanning a QR at the entrance — no door staff needed. The code
          rotates every 30 seconds, so a photo sent to someone at home stops working within a minute. Guests still need
          the Event PIN from the sign inside to claim tickets.
        </p>
        <Button onClick={() => toggle(true)} loading={busy}>
          Turn on kiosk mode
        </Button>
      </div>
    );
  }

  const left = kiosk.data && now !== null ? Math.max(0, kiosk.data.expiresAt - now) : KIOSK_STEP_MS;
  const showQr = qr && qr.url === url;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-between gap-4 bg-ink px-6 py-6 text-center">
      <header className="flex w-full items-center justify-between">
        <Logo />
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-widest">
          <span className="text-basil">● kiosk mode on</span>
          <button onClick={() => toggle(false)} disabled={busy} className="border-2 border-line px-3 py-1 text-mute hover:border-paper">
            Turn off
          </button>
        </div>
      </header>

      <div>
        <p className="font-mono text-sm uppercase tracking-[0.3em] text-mute">{data.eventName}</p>
        <h1 className="font-display text-[9vmin] uppercase leading-none">Scan to check in</h1>
      </div>

      <div className="relative bg-white p-[2vmin] shadow-brutal-tomato" style={{ width: "min(70vh, 88vw)", aspectRatio: "1 / 1" }}>
        {showQr ? (
          <motion.div
            key={qr.url}
            initial={{ opacity: 0.4, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
            role="img"
            data-url={qr.url}
            aria-label="Check-in QR code"
            // SVG produced locally by the qrcode library from our own URL.
            dangerouslySetInnerHTML={{ __html: qr.svg }}
          />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-sm uppercase text-black">
            {kiosk.error ? `Can't load code: ${kiosk.error}` : "Loading code…"}
          </div>
        )}
      </div>

      <div className="w-full max-w-xl space-y-2">
        <div className="h-2 w-full bg-ink-3">
          <div className="h-full bg-tomato" style={{ width: `${(left / KIOSK_STEP_MS) * 100}%` }} />
        </div>
        <p className="font-mono text-xs uppercase tracking-widest text-mute">
          Point your phone camera at the code · new code in {Math.ceil(left / 1000)}s · photos won&apos;t work
        </p>
      </div>
    </div>
  );
}
