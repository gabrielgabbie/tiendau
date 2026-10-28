-- Profile pictures: a small square JPEG (about 10–25 KB) stored with your settings.
-- Run this once in Supabase → SQL Editor. Safe to run again.
alter table public.settings add column if not exists avatar text
  check (avatar is null or (avatar like 'data:image/%' and length(avatar) < 200000));
