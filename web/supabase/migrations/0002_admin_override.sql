-- Admin Override: Host Vouch (admin redemptions) + Wingman Transfer (admin reallocation).

alter table public.redemptions
  add column source      text not null default 'guest' check (source in ('guest', 'admin')),
  add column redeemed_by text;                       -- staff email for admin redemptions

create table public.transfers (
  id            uuid primary key default gen_random_uuid(),
  event_id      text not null references public.events(id) on delete cascade,
  from_rsvp_id  uuid not null references public.rsvps(id) on delete cascade,
  to_rsvp_id    uuid not null references public.rsvps(id) on delete cascade,
  token_id      bigint not null,
  amount        int not null check (amount > 0),
  moved_by      text,
  user_op_hash  text,
  tx_hash       text,
  created_at    timestamptz not null default now(),
  check (from_rsvp_id <> to_rsvp_id)
);
create index transfers_from_idx on public.transfers(from_rsvp_id, token_id);
create index transfers_to_idx   on public.transfers(to_rsvp_id, token_id);
alter table public.transfers enable row level security;

-- Current balance for one RSVP / token: minted + in − out − redeemed (guest + admin).
create or replace function public.ticket_balance(p_event_id text, p_rsvp_id uuid, p_token_id bigint)
returns int language sql stable as $$
  select
    coalesce((select (t->>'amount')::int
                from public.events e, jsonb_array_elements(e.ticket_types) t, public.rsvps r
               where e.id = p_event_id and r.id = p_rsvp_id and r.claimed_at is not null
                 and (t->>'tokenId')::bigint = p_token_id), 0)
  + coalesce((select sum(amount) from public.transfers where to_rsvp_id   = p_rsvp_id and token_id = p_token_id), 0)
  - coalesce((select sum(amount) from public.transfers where from_rsvp_id = p_rsvp_id and token_id = p_token_id), 0)
  - coalesce((select sum(amount) from public.redemptions where rsvp_id    = p_rsvp_id and token_id = p_token_id), 0);
$$;

-- Replaces 0001's version: balance now includes transfers; records who redeemed.
drop function if exists public.record_redemption(uuid, text, uuid, bigint, int, text);
create or replace function public.record_redemption(
  p_id uuid, p_event_id text, p_rsvp_id uuid, p_token_id bigint, p_amount int, p_theme_color text,
  p_source text default 'guest', p_redeemed_by text default null
) returns int
language plpgsql
as $$
declare
  v_balance int;
begin
  perform pg_advisory_xact_lock(hashtext(p_rsvp_id::text || ':' || p_token_id::text));

  if not exists (select 1 from public.events e, jsonb_array_elements(e.ticket_types) t
                  where e.id = p_event_id and (t->>'tokenId')::bigint = p_token_id) then
    raise exception 'unknown_token';
  end if;
  if not exists (select 1 from public.rsvps r
                  where r.id = p_rsvp_id and r.event_id = p_event_id and r.claimed_at is not null) then
    raise exception 'not_claimed';
  end if;

  -- Idempotent retry
  if exists (select 1 from public.redemptions where id = p_id) then
    return public.ticket_balance(p_event_id, p_rsvp_id, p_token_id);
  end if;

  v_balance := public.ticket_balance(p_event_id, p_rsvp_id, p_token_id);
  if v_balance < p_amount then
    raise exception 'insufficient_balance';
  end if;

  insert into public.redemptions (id, event_id, rsvp_id, token_id, amount, theme_color, source, redeemed_by)
  values (p_id, p_event_id, p_rsvp_id, p_token_id, p_amount, p_theme_color, p_source, p_redeemed_by);

  return v_balance - p_amount;
end;
$$;

-- Wingman Transfer: atomic, locks both sides in a fixed order (no deadlocks).
create or replace function public.record_transfer(
  p_event_id text, p_from uuid, p_to uuid, p_token_id bigint, p_amount int, p_moved_by text
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  a uuid := least(p_from, p_to);
  b uuid := greatest(p_from, p_to);
begin
  perform pg_advisory_xact_lock(hashtext(a::text || ':' || p_token_id::text));
  perform pg_advisory_xact_lock(hashtext(b::text || ':' || p_token_id::text));

  if p_from = p_to then raise exception 'same_guest'; end if;
  if not exists (select 1 from public.rsvps where id = p_to and event_id = p_event_id
                  and status = 'checked_in' and claimed_at is not null and wallet_address is not null) then
    raise exception 'recipient_not_ready';
  end if;
  if public.ticket_balance(p_event_id, p_from, p_token_id) < p_amount then
    raise exception 'insufficient_balance';
  end if;

  insert into public.transfers (event_id, from_rsvp_id, to_rsvp_id, token_id, amount, moved_by)
  values (p_event_id, p_from, p_to, p_token_id, p_amount, p_moved_by)
  returning id into v_id;
  return v_id;
end;
$$;
