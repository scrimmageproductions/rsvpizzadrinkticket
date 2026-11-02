-- Demo event + guest list. Replace emails with your own to test the guest flow.
insert into public.events (id, name, venue, starts_at, event_pin, theme_mode, theme_color, rotation_minutes, ticket_types)
values (
  'pizza-night-nyc',
  'Global Pizza Party — NYC',
  'Joe''s Basement Bar, Brooklyn',
  now(),
  '4209',
  'auto',
  'neon-green',
  10,
  '[{"tokenId": 1, "label": "Free Drink", "emoji": "🍺", "amount": 2},
    {"tokenId": 2, "label": "Pizza Slice", "emoji": "🍕", "amount": 1}]'::jsonb
) on conflict (id) do nothing;

insert into public.rsvps (event_id, name, email, phone) values
  ('pizza-night-nyc', 'Ada Lovelace',   'ada@example.com',   null),
  ('pizza-night-nyc', 'Satoshi Slice',  'satoshi@example.com', null),
  ('pizza-night-nyc', 'Margherita Q.',  null, '+15555550123'),
  ('pizza-night-nyc', 'Pepper Roni',    'pepper@example.com', null)
on conflict do nothing;
