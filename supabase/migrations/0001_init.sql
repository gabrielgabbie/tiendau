-- Tiền Đâu database. Run this once in Supabase: SQL Editor → New query → paste → Run.
-- Every table is private per user: Row Level Security only lets people read and write their own rows.

-- ---------- tables ----------
create table if not exists public.people (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.events (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  date        date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.transactions (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type        text not null check (type in ('expense', 'income')),
  amount      numeric(16, 2) not null check (amount >= 0),
  category    text not null,
  note        text not null default '' check (char_length(note) <= 200),
  date        date not null,
  bill_id     uuid,            -- set when this is your share of a shared bill
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Shared bills and settle-up payments. Searchable fields are columns;
-- the split details (people, fees, payers, computed shares) live in `data`.
create table if not exists public.bills (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('bill', 'settle')),
  title       text not null default '' check (char_length(title) <= 120),
  date        date not null,
  category    text,
  event_id    uuid,
  amount      numeric(16, 2) not null check (amount >= 0),
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  currency    text not null default 'VND',
  hide_demo   boolean not null default false,
  updated_at  timestamptz not null default now()
);

create index if not exists transactions_user_date on public.transactions (user_id, date desc);
create index if not exists bills_user_date        on public.bills (user_id, date desc);
create index if not exists people_user            on public.people (user_id);
create index if not exists events_user            on public.events (user_id);

-- ---------- keep updated_at current ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['people', 'events', 'transactions', 'bills', 'settings'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------- privacy: each person sees only their own rows ----------
do $$
declare t text;
begin
  foreach t in array array['people', 'events', 'transactions', 'bills', 'settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ---------- live sync between devices ----------
do $$
declare t text;
begin
  foreach t in array array['people', 'events', 'transactions', 'bills', 'settings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- let people delete their own account (required by the App Store for a future native app) ----------
create or replace function public.delete_my_account() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
