/**
 * Kiosk door codes — a TOTP-style rotating token (RFC 6238 idea, HMAC-SHA256, 30 s steps).
 *
 *   code = base32( HMAC-SHA256(eventSecret, "<eventId>:<step>") )[0..10]
 *
 * The door screen shows a QR of  /e/<eventId>?kiosk=<code>  and rotates it every 30 s, so a
 * photo texted to someone at home is dead within a minute. Uses WebCrypto, so the exact same
 * code runs on the server (live) and in the browser (Demo Mode).
 */

export const KIOSK_STEP_MS = 30_000;
/** Accept the current and the previous step: a scan near a boundary + page load still works. */
const GRACE_STEPS = 1;

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L

const hexToBytes = (hex: string) => new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));

async function hmac(secretHex: string, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", hexToBytes(secretHex), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
}

export const kioskStep = (now = Date.now()) => Math.floor(now / KIOSK_STEP_MS);

export async function kioskCode(secretHex: string, eventId: string, step: number): Promise<string> {
  const mac = await hmac(secretHex, `${eventId}:${step}`);
  return Array.from(mac.slice(0, 10), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Constant-time string compare (no early exit). */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyKioskCode(secretHex: string, eventId: string, code: string, now = Date.now()) {
  const step = kioskStep(now);
  const candidate = code.trim().toUpperCase();
  let ok = false;
  for (let s = step - GRACE_STEPS; s <= step; s++) ok = same(candidate, await kioskCode(secretHex, eventId, s)) || ok;
  return ok;
}

/** What the door screen needs: current code + when it rotates. */
export async function currentKioskCode(secretHex: string, eventId: string, now = Date.now()) {
  const step = kioskStep(now);
  return { code: await kioskCode(secretHex, eventId, step), expiresAt: (step + 1) * KIOSK_STEP_MS };
}

/**
 * Demo Mode has no server and each device keeps its own localStorage, so the door key must be
 * derivable on every device: a fixed per-event value (NOT secret — demo only). That lets a real
 * phone scan the laptop's kiosk QR during a pitch (open both via the laptop's LAN address).
 */
export const demoKioskSecret = (eventId: string) =>
  Array.from(new TextEncoder().encode(`rsvpizza-demo-kiosk:${eventId}`), (b) => b.toString(16).padStart(2, "0")).join("");

export const randomSecretHex = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * After a valid scan the guest still has to log in (OTP can take a minute), which would outlive
 * the 30 s code. So the scan is exchanged right away for a short "presence pass" kept in this
 * tab's sessionStorage, and redeemed for the check-in once they're logged in.
 */
export const PRESENCE_TTL_MS = 10 * 60_000;
export const presenceKey = (eventId: string) => `rsvpizza:kiosk-presence:${eventId}`;
