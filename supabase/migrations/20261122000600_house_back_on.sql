-- Our House back on, after the emergency stop (20261122000310): pushed only once every
-- device runs an app with the fixes (a closed house stops for good; saves read fresh
-- state; the server-side flood guard is in). Deploy the app update first.
update public.features set stopped = false where key = 'house';
