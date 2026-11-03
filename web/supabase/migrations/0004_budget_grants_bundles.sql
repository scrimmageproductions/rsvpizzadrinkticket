-- Budget tracking, "Make It Right" grants, and per-guest claim snapshots.

-- ─────────────────────────────────────────────────────────── 1. event budget
-- Max tickets the host is willing to pay for (all perk types, guest + admin redemptions).
-- NULL = no budget set.
alter table public.events
  add column event_budget int check (event_budget is null or event_budget >= 0);

-- ─────────────────────────────────────────────────────────── 3. claim snapshots
-- Hosts can now edit ticket_types mid-event. Balances must use what each guest ACTUALLY minted,
-- not today's config — otherwise raising "Free Drink" from 2→3 would hand every earlier guest a
-- phantom drink the chain never minted. Shape: [{"tokenId": 1, "amount": 2}, ...]
alter table public.rsvps add column claimed_bundle jsonb;

update public.rsvps r
   set claimed_bundle = (
     select coalesce(jsonb_agg(jsonb_build_object('tokenId', (t->>'tokenId')::bigint, 'amount', (t->>'amount')::int)), '[]'::jsonb)
       from public.events e, jsonb_array_elements(e.ticket_types) t
      where e.id = r.event_id and (t->>'amount')::int > 0)
 where r.claimed_at is not null and r.claimed_bundle is null;

-- ─────────────────────────────────────────────────────────── 2. grants ("Make It Right")
create table public.grants (
  id            uuid primary key default gen_random_uuid(),
  event_id      text not null references public.events(id) on delete cascade,
  rsvp_id       uuid not null references public.rsvps(id) on delete cascade,
  token_id      bigint not null,
  amount        int not null check (amount > 0),
  reason        text,
  granted_by    text,                       -- staff email
  user_op_hash  text,
  tx_hash       text,
  created_at    timestamptz not null default now()
);
create index grants_rsvp_idx on public.grants(rsvp_id, token_id);
alter table public.grants enable row level security;

-- Balance = claimed bundle + grants + transfers in − transfers out − redemptions (guest + admin).
create or replace function public.ticket_balance(p_event_id text, p_rsvp_id uuid, p_token_id bigint)
returns int language sql stable as $$
  select
    coalesce((select (b->>'amount')::int
                from public.rsvps r, jsonb_array_elements(coalesce(r.claimed_bundle, '[]'::jsonb)) b
               where r.id = p_rsvp_id and r.event_id = p_event_id and r.claimed_at is not null
                 and (b->>'tokenId')::bigint = p_token_id), 0)
  + coalesce((select sum(amount) from public.grants    where rsvp_id      = p_rsvp_id and token_id = p_token_id), 0)
  + coalesce((select sum(amount) from public.transfers where to_rsvp_id   = p_rsvp_id and token_id = p_token_id), 0)
  - coalesce((select sum(amount) from public.transfers where from_rsvp_id = p_rsvp_id and token_id = p_token_id), 0)
  - coalesce((select sum(amount) from public.redemptions where rsvp_id    = p_rsvp_id and token_id = p_token_id), 0);
$$;

create or replace function public.record_grant(
  p_event_id text, p_rsvp_id uuid, p_token_id bigint, p_amount int, p_reason text, p_granted_by text
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_rsvp_id::text || ':' || p_token_id::text));

  if not exists (select 1 from public.events e, jsonb_array_elements(e.ticket_types) t
                  where e.id = p_event_id and (t->>'tokenId')::bigint = p_token_id) then
    raise exception 'unknown_token';
  end if;
  -- On-chain mint needs the guest's wallet, which is bound when they claim.
  if not exists (select 1 from public.rsvps where id = p_rsvp_id and event_id = p_event_id
                  and claimed_at is not null and wallet_address is not null) then
    raise exception 'recipient_not_ready';
  end if;

  insert into public.grants (event_id, rsvp_id, token_id, amount, reason, granted_by)
  values (p_event_id, p_rsvp_id, p_token_id, p_amount, p_reason, p_granted_by)
  returning id into v_id;
  return v_id;
end;
$$;

create index redemptions_recent_idx on public.redemptions(rsvp_id, created_at desc);
