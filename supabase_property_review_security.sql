-- املاک ۰۵۸: سیاست‌های امنیتی آگهی‌ها و رسانه‌ها
-- اجرای مجدد این فایل، سیاست‌های مربوط به properties و فایل‌های property-images را همگام می‌کند.
-- شماره تماس آگهی‌ها برای مهمان‌ها قابل خواندن نیست؛ فقط کاربر واردشده می‌تواند از RPC شماره آگهی منتشرشده را بگیرد.

begin;

alter table public.properties enable row level security;
alter table public.site_admins enable row level security;
alter table public.site_settings enable row level security;

-- فقط ستون‌های عمومی آگهی از Data API قابل خواندن هستند.
-- شماره تماس جداگانه برای نقش authenticated مجاز است.
revoke select on table public.properties from public, anon, authenticated;
revoke select (phone) on table public.properties from public, anon;
grant select (
  id, title, main_category, sub_category, property_type, transaction_type,
  price, deposit, monthly_rent, convertible, area, bedrooms, year_built,
  floor_number, photos_own, elevator, parking, storage, video_url, address,
  city, description, image_url, image_urls, details_json, land_area,
  building_area, location_lat, location_lng, location_precision, created_at,
  owner_id, status
) on table public.properties to anon, authenticated;
grant select (phone) on table public.properties to authenticated;
grant insert, update, delete on table public.properties to authenticated;
grant usage, select on sequence public.properties_id_seq to authenticated;

grant select on table public.site_admins to authenticated;
drop policy if exists "Admin can read own membership" on public.site_admins;
create policy "Admin can read own membership"
on public.site_admins for select to authenticated
using (user_id = (select auth.uid()));

grant select on table public.site_settings to anon, authenticated;
drop policy if exists "Public can read site settings" on public.site_settings;
create policy "Public can read site settings"
on public.site_settings for select to anon, authenticated
using (id = 1);

-- حذف سیاست‌های قبلی آگهی‌ها و ایجاد سیاست‌های قابل پیش‌بینی و محدود.
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

create policy "properties_public_read_approved"
on public.properties for select to anon, authenticated
using (status = 'approved');

create policy "properties_owner_read_own"
on public.properties for select to authenticated
using (owner_id = (select auth.uid()));

create policy "properties_admin_read_all"
on public.properties for select to authenticated
using (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())));

create policy "properties_owner_insert_pending"
on public.properties for insert to authenticated
with check (owner_id = (select auth.uid()) and status = 'pending');

create policy "properties_admin_update"
on public.properties for update to authenticated
using (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())));

create policy "properties_admin_delete"
on public.properties for delete to authenticated
using (exists (select 1 from public.site_admins a where a.user_id = (select auth.uid())));

-- RPC با SECURITY INVOKER؛ بررسی دسترسی همچنان توسط مجوز ستون و RLS انجام می‌شود.
create or replace function public.get_property_phone(p_property_id bigint)
returns text
language sql
stable
security invoker
set search_path = ''
as $function$
  select p.phone
  from public.properties as p
  where p.id = p_property_id
    and p.status = 'approved'
    and (select auth.uid()) is not null
  limit 1;
$function$;

revoke all on function public.get_property_phone(bigint) from public, anon;
grant execute on function public.get_property_phone(bigint) to authenticated;

grant usage, select on sequence public.conversations_id_seq, public.messages_id_seq to authenticated;

-- فایل‌های آگهی خصوصی هستند تا تصاویر آگهی‌های در انتظار تأیید عمومی نشوند.
update storage.buckets
set public = false,
    file_size_limit = 26214400,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime'
    ]
where id = 'property-images';

do $$
declare p record;
begin
  if not exists (select 1 from storage.buckets where id = 'property-images') then
    raise exception 'باکت property-images پیدا نشد؛ ابتدا آن را در Storage بسازید.';
  end if;

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
          'Property media: admins read pending',
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

-- فقط کاربران واردشده می‌توانند رسانه را در پوشه pending آپلود کنند.
create policy "Property media: authenticated upload to pending"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'property-images'
  and (storage.foldername(name))[1] = 'pending'
  and owner_id::text = (select auth.uid()::text)
);

-- مالک فایل یا عموم برای آگهی تأییدشده اجازه خواندن دارند.
-- این سیاست عمداً به site_admins وابسته نیست تا دسترسی مهمان خطای مجوز نگیرد.
create policy "Property media: owner and public approved read"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'property-images'
  and (
    owner_id::text = (select auth.uid()::text)
    or exists (
      select 1
      from public.properties p
      where p.status = 'approved'
        and (
          p.image_url = storage.objects.name
          or coalesce(to_jsonb(p.image_urls), '[]'::jsonb) @> jsonb_build_array(storage.objects.name)
          or p.video_url = storage.objects.name
        )
    )
  )
);

-- مدیر سایت می‌تواند رسانه‌های در انتظار تأیید را بررسی کند.
create policy "Property media: admins read pending"
on storage.objects for select to authenticated
using (
  bucket_id = 'property-images'
  and exists (select 1 from public.site_admins a where a.user_id = (select auth.uid()))
);

create policy "Property media: owner cleanup pending"
on storage.objects for delete to authenticated
using (
  bucket_id = 'property-images'
  and (storage.foldername(name))[1] = 'pending'
  and owner_id::text = (select auth.uid()::text)
);

create policy "Property media: admins delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'property-images'
  and exists (select 1 from public.site_admins a where a.user_id = (select auth.uid()))
);

commit;

-- اگر API بلافاصله ستون/تابع تازه را نشناسد، schema cache را از نو بارگذاری کنید.
notify pgrst, 'reload schema';
