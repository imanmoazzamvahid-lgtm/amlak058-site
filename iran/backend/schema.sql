-- ایران | هوش حقوقی
-- Initial schema. Apply only to the dedicated Iran Legal AI Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.legal_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null check (source_type in (
    'constitution','code','act','regulation','bylaw','circular',
    'unification_vote','advisory_opinion','judgment','other'
  )),
  issuing_authority text,
  document_number text,
  enactment_date date,
  publication_date date,
  effective_from date,
  effective_to date,
  official_url text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  source_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.legal_sources(id) on delete cascade,
  chunk_no integer not null,
  heading text,
  content text not null,
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(heading,'') || ' ' || coalesce(content,''))
  ) stored,
  created_at timestamptz not null default now(),
  unique(source_id, chunk_no)
);

create index if not exists legal_chunks_search_idx
  on public.legal_chunks using gin(search_vector);
create index if not exists legal_chunks_source_idx
  on public.legal_chunks(source_id);

create table if not exists public.legal_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'گفت‌وگوی حقوقی جدید',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.legal_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  source_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists legal_conversations_user_idx
  on public.legal_conversations(user_id, updated_at desc);
create index if not exists legal_messages_conversation_idx
  on public.legal_messages(conversation_id, created_at);

create table if not exists public.legal_user_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  file_size bigint,
  processing_status text not null default 'uploaded'
    check (processing_status in ('uploaded','processing','ready','failed')),
  extracted_text text,
  created_at timestamptz not null default now()
);

alter table public.legal_sources enable row level security;
alter table public.legal_chunks enable row level security;
alter table public.legal_conversations enable row level security;
alter table public.legal_messages enable row level security;
alter table public.legal_user_documents enable row level security;

drop policy if exists "Published legal sources are readable" on public.legal_sources;
create policy "Published legal sources are readable"
  on public.legal_sources for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists "Chunks of published sources are readable" on public.legal_chunks;
create policy "Chunks of published sources are readable"
  on public.legal_chunks for select
  to anon, authenticated
  using (exists (
    select 1 from public.legal_sources s
    where s.id = legal_chunks.source_id and s.status = 'published'
  ));

drop policy if exists "Users read their own conversations" on public.legal_conversations;
create policy "Users read their own conversations"
  on public.legal_conversations for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users create their own conversations" on public.legal_conversations;
create policy "Users create their own conversations"
  on public.legal_conversations for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "Users update their own conversations" on public.legal_conversations;
create policy "Users update their own conversations"
  on public.legal_conversations for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users delete their own conversations" on public.legal_conversations;
create policy "Users delete their own conversations"
  on public.legal_conversations for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users read their own messages" on public.legal_messages;
create policy "Users read their own messages"
  on public.legal_messages for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users create their own messages" on public.legal_messages;
create policy "Users create their own messages"
  on public.legal_messages for insert to authenticated
  with check (
    auth.uid() = user_id and exists (
      select 1 from public.legal_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users read their own documents" on public.legal_user_documents;
create policy "Users read their own documents"
  on public.legal_user_documents for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users register their own documents" on public.legal_user_documents;
create policy "Users register their own documents"
  on public.legal_user_documents for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "Users delete their own documents" on public.legal_user_documents;
create policy "Users delete their own documents"
  on public.legal_user_documents for delete to authenticated
  using (auth.uid() = user_id);

create or replace function public.search_legal_chunks(
  search_text text,
  result_limit integer default 6
)
returns table (
  chunk_id uuid,
  source_id uuid,
  title text,
  source_type text,
  document_number text,
  official_url text,
  heading text,
  content text,
  rank real
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    s.id,
    s.title,
    s.source_type,
    s.document_number,
    s.official_url,
    c.heading,
    c.content,
    ts_rank(c.search_vector, websearch_to_tsquery('simple', search_text))::real
  from public.legal_chunks c
  join public.legal_sources s on s.id = c.source_id
  where s.status = 'published'
    and c.search_vector @@ websearch_to_tsquery('simple', search_text)
  order by ts_rank(c.search_vector, websearch_to_tsquery('simple', search_text)) desc
  limit greatest(1, least(coalesce(result_limit, 6), 10));
$$;

grant execute on function public.search_legal_chunks(text, integer) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'iran-legal-documents',
  'iran-legal-documents',
  false,
  20971520,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do nothing;

drop policy if exists "Users upload own Iran legal documents" on storage.objects;
create policy "Users upload own Iran legal documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'iran-legal-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "Users read own Iran legal documents" on storage.objects;
create policy "Users read own Iran legal documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'iran-legal-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "Users delete own Iran legal documents" on storage.objects;
create policy "Users delete own Iran legal documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'iran-legal-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

comment on table public.legal_sources is 'مستندات حقوقی ایران با وضعیت انتشار و نشانی منبع';
comment on table public.legal_chunks is 'قطعات قابل جست‌وجوی اسناد حقوقی';
comment on table public.legal_conversations is 'گفتگوهای خصوصی کاربران سامانه ایران';
comment on table public.legal_messages is 'پیام‌های خصوصی به همراه ارجاعات مستند';
comment on table public.legal_user_documents is 'فراداده اسناد بارگذاری‌شده کاربران';
