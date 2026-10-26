-- Listen together and Watch together ride on the call machinery: the same
-- ringing, signaling, TURN and call log, with a kind that tells both apps
-- which screen to open.
--   listen  sound only: one of us shares what's playing, mics start muted
--   watch   one of us shares a screen (picture and sound), mics on
alter type public.call_media add value if not exists 'listen';
alter type public.call_media add value if not exists 'watch';
