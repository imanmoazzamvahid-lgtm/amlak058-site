-- Performance tuning applied after initial deployment.
create index if not exists legal_messages_user_idx
  on public.legal_messages(user_id);
create index if not exists legal_user_documents_user_idx
  on public.legal_user_documents(user_id);

-- Replace row policies with initplan-friendly auth.uid() expressions.
drop policy if exists "Users read their own conversations" on public.legal_conversations;
create policy "Users read their own conversations"
  on public.legal_conversations for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users create their own conversations" on public.legal_conversations;
create policy "Users create their own conversations"
  on public.legal_conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users update their own conversations" on public.legal_conversations;
create policy "Users update their own conversations"
  on public.legal_conversations for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users delete their own conversations" on public.legal_conversations;
create policy "Users delete their own conversations"
  on public.legal_conversations for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read their own messages" on public.legal_messages;
create policy "Users read their own messages"
  on public.legal_messages for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users create their own messages" on public.legal_messages;
create policy "Users create their own messages"
  on public.legal_messages for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.legal_conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid())
  ));

drop policy if exists "Users read their own documents" on public.legal_user_documents;
create policy "Users read their own documents"
  on public.legal_user_documents for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users register their own documents" on public.legal_user_documents;
create policy "Users register their own documents"
  on public.legal_user_documents for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users delete their own documents" on public.legal_user_documents;
create policy "Users delete their own documents"
  on public.legal_user_documents for delete to authenticated
  using ((select auth.uid()) = user_id);
