import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Compact signed tokens:  base64url(JSON payload) "." base64url(HMAC-SHA256)
 * Used for pre-arrival invite links and kiosk presence passes. Every payload carries a
 * `k` (kind) so one kind can never be replayed as another, and an `x` expiry (epoch ms).
 */
type Payload = { k: "invite" | "presence"; e: string; x: number } & Record<string, unknown>;

function secret() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw new Error("APP_SECRET must be set (≥ 32 chars)");
  return s;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signToken(p: Payload): string {
  const body = b64(JSON.stringify(p));
  return `${body}.${b64(createHmac("sha256", secret()).update(body).digest())}`;
}

export function verifyToken<K extends Payload["k"]>(token: string, kind: K, eventId: string): (Payload & { k: K }) | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    if (p.k !== kind || p.e !== eventId || typeof p.x !== "number" || Date.now() > p.x) return null;
    return p as Payload & { k: K };
  } catch {
    return null;
  }
}
