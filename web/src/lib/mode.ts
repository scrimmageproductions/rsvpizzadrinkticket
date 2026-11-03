/**
 * Local Demo Mode: the whole journey (guest, door, bartender, host) runs in the browser on
 * mock data — no Privy, Supabase, Pimlico or chain. On when NEXT_PUBLIC_DEMO_MODE=true, or
 * automatically when the Privy app id is missing (i.e. a fresh clone with no .env).
 * Inlined at build time, so it's a constant: swapping hooks on it is safe.
 */
export const DEMO =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export const DEMO_EVENT_ID = "pizza-night-nyc";
