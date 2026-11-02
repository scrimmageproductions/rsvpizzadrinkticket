-- rsv.pizza check-in & reward MVP schema.
-- All access goes through Next.js API routes using the service-role key, so RLS is enabled
-- with NO policies: the anon key (if ever shipped to a browser) can read nothing.


-- ─────────────────────────────────────────────────────────── events
create table public.events (
  id                text primary key,                 -- rsv.pizza event slug, e.g. 'pizza-dao-nyc'
  name              text not null,
  venue             text,
  starts_at         timestamptz,
  event_pin         text not null,                    -- the static PIN printed on the sign in the venue
  -- Visual 2FA ---------------------------------------------------------------
  theme_mode        text not null default 'manual' check (theme_mode in ('manual', 'auto')),
  theme_color       text not null default 'neon-green', -- key into the palette (manual mode)
  theme_palette     text[] not null default array['neon-green','hot-pink','electric-blue','safety-orange','ultra-violet'],
  rotation_minutes  int  not null default 15 check (rotation_minutes between 1 and 240),
  -- Perks minted on claim: [{ "tokenId": 1, "label": "Free Drink", "emoji": "🍺", "amount": 2 }, ...]
  ticket_types      jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────── rsvps (synced from rsv.pizza)
create table public.rsvps (
  id                uuid primary key default gen_random_uuid(),
  event_id          text not null references public.events(id) on delete cascade,
  name              text not null,
  email             text,
  phone             text,                             -- E.164
  status            text not null default 'rsvpd' check (status in ('rsvpd', 'checked_in')),
  checked_in_at     timestamptz,
  checked_in_by     text,
  privy_user_id     text,                             -- bound on first authenticated visit
  wallet_address    text,                             -- guest smart account, bound on first claim
  claim_id          text,                             -- bytes32 hex used on-chain
  claimed_at        timestamptz,
  pin_failures      int not null default 0,
  created_at        timestamptz not null default now(),
  unique (event_id, email),
  unique (event_id, phone),
  unique (event_id, privy_user_id),
  unique (event_id, wallet_address)
);
create index rsvps_event_idx on public.rsvps(event_id);

-- ─────────────────────────────────────────────────────────── redemptions (off-chain ledger)
-- Written optimistically the instant the bartender taps, BEFORE the burn lands on-chain.
-- It is the real-time double-spend guard (e.g. same guest logged in on two phones).
create table public.redemptions (
  id                uuid primary key,                 -- generated client-side → idempotent retries
  event_id          text not null references public.events(id) on delete cascade,
  rsvp_id           uuid not null references public.rsvps(id) on delete cascade,
  token_id          bigint not null,
  amount            int not null check (amount > 0),
  theme_color       text not null,                    -- color shown on the guest's screen
  user_op_hash      text,
  tx_hash           text,
  created_at        timestamptz not null default now()
);
create index redemptions_rsvp_idx on public.redemptions(rsvp_id, token_id);

alter table public.events      enable row level security;
alter table public.rsvps       enable row level security;
alter table public.redemptions enable row level security;

-- ─────────────────────────────────────────────────────────── atomic redemption
-- Returns the new remaining balance, or raises 'insufficient_balance'.
-- Serialises per (rsvp, token) with an advisory lock so two phones can't both win.
create or replace function public.record_redemption(
  p_id uuid, p_event_id text, p_rsvp_id uuid, p_token_id bigint, p_amount int, p_theme_color text
) returns int
language plpgsql
as $$
declare
  v_entitled int;
  v_used     int;
  v_existing public.redemptions;
begin
  perform pg_advisory_xact_lock(hashtext(p_rsvp_id::text || ':' || p_token_id::text));

  -- Idempotent: a retried request with the same id just returns the current balance.
  select * into v_existing from public.redemptions where id = p_id;

  select coalesce((t->>'amount')::int, 0) into v_entitled
    from public.events e, jsonb_array_elements(e.ticket_types) t
   where e.id = p_event_id and (t->>'tokenId')::bigint = p_token_id;

  if v_entitled is null then
    raise exception 'unknown_token';
  end if;

  if not exists (select 1 from public.rsvps r
                  where r.id = p_rsvp_id and r.event_id = p_event_id and r.claimed_at is not null) then
    raise exception 'not_claimed';
  end if;

  select coalesce(sum(amount), 0) into v_used
    from public.redemptions where rsvp_id = p_rsvp_id and token_id = p_token_id;

  if v_existing.id is not null then
    return v_entitled - v_used;
  end if;

  if v_used + p_amount > v_entitled then
    raise exception 'insufficient_balance';
  end if;

  insert into public.redemptions (id, event_id, rsvp_id, token_id, amount, theme_color)
  values (p_id, p_event_id, p_rsvp_id, p_token_id, p_amount, p_theme_color);

  return v_entitled - v_used - p_amount;
end;
$$;

-- updated_at trigger
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();
