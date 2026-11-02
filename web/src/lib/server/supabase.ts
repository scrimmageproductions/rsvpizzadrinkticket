import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Service-role client. Never import from client components (enforced by `server-only`). */
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export type EventRow = {
  id: string;
  name: string;
  venue: string | null;
  starts_at: string | null;
  event_pin: string;
  theme_mode: "manual" | "auto";
  theme_color: string;
  theme_palette: string[];
  rotation_minutes: number;
  ticket_types: { tokenId: number; label: string; emoji: string; amount: number }[];
};

export type RsvpRow = {
  id: string;
  event_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: "rsvpd" | "checked_in";
  checked_in_at: string | null;
  checked_in_by: string | null;
  privy_user_id: string | null;
  wallet_address: string | null;
  claim_id: string | null;
  claimed_at: string | null;
  pin_failures: number;
};
