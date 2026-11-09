-- Demo event + guest list. Replace emails with your own to test the guest flow.
-- Apply after migrations:  npx cf d1 query <database-id> --file d1/seed.sql   (or see README)
INSERT OR IGNORE INTO events (id, name, venue, starts_at, event_pin, theme_mode, theme_color, rotation_minutes, ticket_types, event_budget)
VALUES (
  'pizza-night-nyc',
  'Global Pizza Party — NYC',
  'Joe''s Basement Bar, Brooklyn',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  '4209',
  'auto',
  'neon-green',
  10,
  '[{"tokenId":1,"label":"Free Drink","emoji":"🍺","amount":2},{"tokenId":2,"label":"Pizza Slice","emoji":"🍕","amount":1}]',
  24
);

INSERT OR IGNORE INTO rsvps (id, event_id, name, email, phone) VALUES
  ('8b6f1c1e-0000-4000-8000-000000000001', 'pizza-night-nyc', 'Ada Lovelace',  'ada@example.com',     NULL),
  ('8b6f1c1e-0000-4000-8000-000000000002', 'pizza-night-nyc', 'Satoshi Slice', 'satoshi@example.com', NULL),
  ('8b6f1c1e-0000-4000-8000-000000000003', 'pizza-night-nyc', 'Margherita Q.', NULL,                  '+15555550123'),
  ('8b6f1c1e-0000-4000-8000-000000000004', 'pizza-night-nyc', 'Pepper Roni',   'pepper@example.com',  NULL);
