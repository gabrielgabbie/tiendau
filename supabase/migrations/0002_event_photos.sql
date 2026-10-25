-- Event cover photos. Run once in Supabase: SQL Editor → New query → paste → Run.
-- The app shrinks photos on the device (about 1000px wide, JPEG) and stores them as a data URL,
-- so they sync and work offline like the rest of an event. The size cap keeps rows small.
alter table public.events
  add column if not exists photo text check (photo is null or char_length(photo) <= 600000);
