-- املاک ۰۵۸: نمایش خصوصی آگهی‌ها تا زمان تأیید مدیر
-- این فایل را یک‌بار در Supabase > SQL Editor اجرا کنید.
-- این سیاست‌ها را فقط روی جدول آگهی‌ها و باکت property-images اعمال می‌کند.

begin;

-- 1) فقط آگهی تأییدشده عمومی است؛ ثبت‌کننده و مدیر، آگهی‌های غیرعمومی را می‌بینند.
alter table public.properties enable row level security;

do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'properties'
  loop
    execute format('drop policy if exists %I on public.properties', p.policyname);
  end loop;
end
$$;

grant select on table public.properties to anon, authenticated;
grant insert, update, delete on table public.properties to authenticated;

create policy "properties_public_read_approved"
on public.properties for select
to anon, authenticated
using (status = 'approved');

create policy "properties_owner_read_own"
on public.properties for select
to authenticated
using (owner_id = (select auth.uid()));

create policy "properties_admin_read_all"
on public.properties for select
to authenticated
using (
  exists (select 1 from public.site_admins a where a.user_id = (select auth.uid()))
);

create policy "properties_owner_insert_pending"
on public.properties for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and status = 'pending'
);

create policy "properties_admin_update"
on public.properties for update
to authenticated
using (
  exists (select 1 from public.site_admins a where a.user_id = (select auth.uid()))
)
with check (
  exists (select 1 from public.site_admins a where a.user_id = (select auth.uid()))
);

create policy "properties_admin_delete"
on public.properties for delete
to authenticated
using (
  exists (select 1 from public.site_admins a where a.user_id = (select auth.uid()))
);

-- 2) باکت تصاویر و ویدیوها خصوصی می‌شود.
-- فایل‌ها فقط توسط صاحب حساب بارگذاری می‌شوند و نمایش آن‌ها تابع وضعیت آگهی است.
do $$
begin
  update storage.buckets
  set public = false,
      file_size_limit = 26214400,
      allowed_mime_types = array[
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4',
        'video/webm',
        'video/quicktime'
      ]
  where id = 'property-images';

  if not found then
    raise exception 'باکت property-images پیدا نشد. ابتدا این باکت را در Supabase Storage بسازید.';
  end if;
end
$$;

alter table storage.objects enable row level security;

-- حذف سیاست‌های قدیمی که به آپلود ناشناس یا خواندن عمومی فایل‌ها اجازه می‌دادند.
do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        policyname in (
          'Allow anonymous property image uploads',
          'Public can view approved property images',
          'Property media: authenticated upload to pending',
          'Property media: owner and public approved read',
          'Property media: owner cleanup pending',
          'Property media: admins delete'
        )
        or policyname ilike '%property%image%'
        or policyname ilike '%property%media%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end
$$;

create policy "Property media: authenticated upload to pending"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'property-images'
  and (storage.foldername(name))[1] = 'pending'
  and owner_id = (select auth.uid()::text)
);

create policy "Property media: owner and public approved read"
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'property-images'
  and (
    -- صاحب فایل می‌تواند فایل‌های بارگذاری‌شده با حساب خودش را ببیند.
    owner_id = (select auth.uid()::text)
    -- عموم فقط رسانه‌های آگهی‌های تأییدشده را می‌خوانند.
    or exists (
      select 1
      from public.properties p
      where p.status = 'approved'
        and (
          p.image_url = storage.objects.name
          or coalesce(p.image_urls, array[]::text[]) @> array[storage.objects.name]::text[]
          or p.video_url = storage.objects.name
        )
    )
    -- مدیر برای بررسی آگهی‌های در انتظار به فایل‌ها دسترسی دارد.
    or exists (
      select 1
      from public.site_admins a
      where a.user_id = (select auth.uid())
    )
  )
);

create policy "Property media: owner cleanup pending"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'property-images'
  and (storage.foldername(name))[1] = 'pending'
  and owner_id = (select auth.uid()::text)
);

create policy "Property media: admins delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'property-images'
  and exists (
    select 1 from public.site_admins a where a.user_id = (select auth.uid())
  )
);

commit;
