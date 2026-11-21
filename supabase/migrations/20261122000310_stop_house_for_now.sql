-- Emergency, 2026-11-21: an old version of the app on one device kept saving house
-- items in a loop and jammed the database for everyone. Our House is stopped for
-- everyone (the database refuses its saves before touching anything) until the
-- device is updated. Switched back on later (admin page Restart, or a migration).
update public.features set stopped = true where key = 'house';
