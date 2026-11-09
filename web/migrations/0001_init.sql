-- rsv.pizza on Cloudflare D1 (SQLite). Consolidates the former Supabase/Postgres migrations
-- 0001_init, 0002_admin_override, 0003_kiosk_and_invites, 0004_budget_grants_bundles.
--
-- Differences from Postgres, by design:
--   • JSON lives in TEXT columns (read with json_each / json_extract).
--   • Timestamps are ISO-8601 UTC TEXT ("2026-11-09T21:04:05.123Z"), sortable and JS-parseable.
--   • Booleans are INTEGER 0/1.
--   • No stored procedures / advisory locks: the atomic ledger writes (redeem, transfer, grant)
--     are single INSERT … SELECT … WHERE <balance check> statements in lib/server/ledger.ts.
--     D1 executes statements serially per database, so a single statement is an atomic
--     check-and-write — the double-spend guard needs no lock.
--   • No row-level security: D1 is only reachable through the Worker's binding.


-- ─────────────────────────────────────────────────────────── events
CREATE TABLE events (
  id               TEXT PRIMARY KEY,                       -- rsv.pizza event slug
  name             TEXT NOT NULL,
  venue            TEXT,
  starts_at        TEXT,
  event_pin        TEXT NOT NULL,                          -- the static PIN on the sign in the venue
  -- Visual 2FA
  theme_mode       TEXT NOT NULL DEFAULT 'manual' CHECK (theme_mode IN ('manual', 'auto')),
  theme_color      TEXT NOT NULL DEFAULT 'neon-green',
  theme_palette    TEXT NOT NULL DEFAULT '["neon-green","hot-pink","electric-blue","safety-orange","ultra-violet"]'
                     CHECK (json_valid(theme_palette) AND json_type(theme_palette) = 'array'),
  rotation_minutes INTEGER NOT NULL DEFAULT 15 CHECK (rotation_minutes BETWEEN 1 AND 240),
  -- Perks handed out at check-in: [{"tokenId":1,"label":"Free Drink","emoji":"🍺","amount":2}, …]
  ticket_types     TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(ticket_types) AND json_type(ticket_types) = 'array'),
  -- Unmanned door
  kiosk_enabled    INTEGER NOT NULL DEFAULT 0 CHECK (kiosk_enabled IN (0, 1)),
  kiosk_secret     TEXT,                                   -- hex HMAC key, rotated on every off→on
  -- Budget: max tickets the host will pay for (NULL = none)
  event_budget     INTEGER CHECK (event_budget IS NULL OR event_budget >= 0),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ─────────────────────────────────────────────────────────── rsvps (synced from rsv.pizza)
CREATE TABLE rsvps (
  id              TEXT PRIMARY KEY,                        -- UUID
  event_id        TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT,                                    -- stored lower-case
  phone           TEXT,                                    -- E.164
  status          TEXT NOT NULL DEFAULT 'rsvpd' CHECK (status IN ('rsvpd', 'checked_in')),
  checked_in_at   TEXT,
  checked_in_by   TEXT,                                    -- staff email, or 'kiosk'
  privy_user_id   TEXT,
  wallet_address  TEXT,                                    -- guest smart account, bound on first claim
  claim_id        TEXT,                                    -- bytes32 hex used on-chain
  claimed_at      TEXT,
  -- What this guest actually minted at claim time: [{"tokenId":1,"amount":2}, …]
  claimed_bundle  TEXT CHECK (claimed_bundle IS NULL OR json_valid(claimed_bundle)),
  pin_failures    INTEGER NOT NULL DEFAULT 0,
  invited_at      TEXT,
  invite_count    INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (event_id, email),
  UNIQUE (event_id, phone),
  UNIQUE (event_id, privy_user_id),
  UNIQUE (event_id, wallet_address)
);
CREATE INDEX rsvps_event_idx ON rsvps(event_id);

-- ─────────────────────────────────────────────────────────── redemptions (off-chain ledger)
CREATE TABLE redemptions (
  id            TEXT PRIMARY KEY,                          -- generated client-side → idempotent retries
  event_id      TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rsvp_id       TEXT NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
  token_id      INTEGER NOT NULL,
  amount        INTEGER NOT NULL CHECK (amount > 0),
  theme_color   TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'guest' CHECK (source IN ('guest', 'admin')),
  redeemed_by   TEXT,
  user_op_hash  TEXT,
  tx_hash       TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX redemptions_rsvp_idx ON redemptions(rsvp_id, token_id);
CREATE INDEX redemptions_recent_idx ON redemptions(rsvp_id, created_at);
CREATE INDEX redemptions_event_idx ON redemptions(event_id);

-- ─────────────────────────────────────────────────────────── transfers (Wingman)
CREATE TABLE transfers (
  id            TEXT PRIMARY KEY,
  event_id      TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  from_rsvp_id  TEXT NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
  to_rsvp_id    TEXT NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
  token_id      INTEGER NOT NULL,
  amount        INTEGER NOT NULL CHECK (amount > 0),
  moved_by      TEXT,
  user_op_hash  TEXT,
  tx_hash       TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (from_rsvp_id <> to_rsvp_id)
);
CREATE INDEX transfers_from_idx ON transfers(from_rsvp_id, token_id);
CREATE INDEX transfers_to_idx ON transfers(to_rsvp_id, token_id);
CREATE INDEX transfers_event_idx ON transfers(event_id);

-- ─────────────────────────────────────────────────────────── grants ("Make It Right")
CREATE TABLE grants (
  id            TEXT PRIMARY KEY,
  event_id      TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rsvp_id       TEXT NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
  token_id      INTEGER NOT NULL,
  amount        INTEGER NOT NULL CHECK (amount > 0),
  reason        TEXT,
  granted_by    TEXT,
  user_op_hash  TEXT,
  tx_hash       TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX grants_rsvp_idx ON grants(rsvp_id, token_id);
CREATE INDEX grants_event_idx ON grants(event_id);
