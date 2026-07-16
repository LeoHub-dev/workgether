-- Workgether initial schema
-- Run this in the Supabase SQL editor (or via supabase db push).

-- Extensions
create extension if not exists "pgcrypto";

-- Users (custom auth — not Supabase Auth)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- Documents
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled',
  owner_id uuid not null references public.users(id) on delete cascade,
  content_json jsonb not null default '{}'::jsonb,
  -- Base64-encoded Yjs state for collab persistence (also used by soft sync backup)
  yjs_state text,
  share_token text unique,
  share_role text check (share_role is null or share_role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_owner_id_idx on public.documents(owner_id);
create index if not exists documents_share_token_idx on public.documents(share_token);

-- Track shared docs opened by logged-in users (for Home → Shared)
create table if not exists public.document_access (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('viewer', 'editor')),
  opened_at timestamptz not null default now(),
  unique (document_id, user_id)
);

create index if not exists document_access_user_id_idx on public.document_access(user_id);

-- File attachments metadata (files live in Storage bucket `attachments`)
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  storage_path text not null,
  uploaded_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists attachments_document_id_idx on public.attachments(document_id);

-- Optional dedicated Yjs persistence table (used by @supabase-labs/y-supabase defaults)
create table if not exists public.yjs_documents (
  room text primary key,
  state text not null,
  updated_at timestamptz not null default now()
);

-- updated_at trigger for documents
create or replace function public.set_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row
  execute function public.set_documents_updated_at();

-- Storage bucket for attachments (images, pdf, etc.)
-- Run in SQL editor if the bucket does not already exist:
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Allow authenticated service-role uploads via API; policies are permissive
-- because the Next.js server uses the service role for trusted mutations.
-- If you prefer tighter RLS later, lock these down and keep using the service role.

alter table public.users enable row level security;
alter table public.documents enable row level security;
alter table public.document_access enable row level security;
alter table public.attachments enable row level security;
alter table public.yjs_documents enable row level security;

-- CRUD goes through the Next.js service role (bypasses RLS).
-- Anon key is used for Realtime + Yjs persistence after the API has verified access.
-- Allow anon read/write on yjs_documents so @supabase-labs/y-supabase can persist state.
-- Room keys are document UUIDs (not enumerable share tokens).

drop policy if exists "yjs_documents_select" on public.yjs_documents;
drop policy if exists "yjs_documents_insert" on public.yjs_documents;
drop policy if exists "yjs_documents_update" on public.yjs_documents;
drop policy if exists "yjs_documents_delete" on public.yjs_documents;

create policy "yjs_documents_select" on public.yjs_documents
  for select to anon, authenticated using (true);
create policy "yjs_documents_insert" on public.yjs_documents
  for insert to anon, authenticated with check (true);
create policy "yjs_documents_update" on public.yjs_documents
  for update to anon, authenticated using (true) with check (true);
create policy "yjs_documents_delete" on public.yjs_documents
  for delete to anon, authenticated using (true);

-- Realtime: enable postgres_changes on documents for soft-sync fallback
-- (Dashboard → Database → Publications → supabase_realtime, or:)
-- alter publication supabase_realtime add table public.documents;
