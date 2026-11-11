# ایران | هوش حقوقی

زیرساخت مستقل سامانه عمومی «ایران» در سازمان Supabase کاربر.

## وضعیت استقرار
- Supabase project: `Iran Legal AI`
- Project ref: `zjkghjlqzpuxpljiyfcj`
- Region: `eu-central-1` (Frankfurt)
- Project URL: `https://zjkghjlqzpuxpljiyfcj.supabase.co`
- Database schema: اجرا شده
- Edge Function: `legal-assistant`، نسخه ۱، احراز هویت اجباری
- Security Advisor: بدون هشدار امنیتی در آخرین بررسی
- Legal sources loaded: صفر؛ تا ورود منابع رسمی، هیچ پوشش محتوایی ادعا نمی‌شود.

## فایل‌ها
- `schema.sql`: جداول منابع حقوقی، قطعات متنی، گفتگوها، پیام‌ها، اسناد کاربر و RLS.
- `performance_tuning.sql`: ایندکس‌ها و بهینه‌سازی سیاست‌های RLS اجراشده.
- `../../supabase/functions/legal-assistant/index.ts`: Edge Function برای احراز هویت، جست‌وجوی مستندات و فراخوانی مدل زبانی.

## راه‌اندازی باقی‌مانده
در Supabase Dashboard > Project Settings > Edge Functions > Secrets این متغیرهای سمت‌سرور تنظیم شوند:
- `AI_API_KEY`: کلید محرمانه ارائه‌دهنده مدل
- `AI_MODEL`: نام مدل
- `AI_API_URL`: اختیاری؛ برای API سازگار با OpenAI، در صورت نیاز

همچنین باید روش ورود کاربران فعال و سرویس SMS یا ایمیل پیکربندی شود. تا آن زمان، Edge Function به JWT معتبر نیاز دارد و چت عمومی برای کاربران ناشناس فعال نیست.

## منابع حقوقی
فقط متن‌ها و فایل‌هایی وارد `legal_sources` و `legal_chunks` شوند که اصالت، مرجع انتشار، تاریخ تصویب/انتشار و وضعیت اعتبار آن‌ها کنترل شده باشد. وضعیت `published` باعث قابلیت جست‌وجوی عمومی می‌شود؛ وضعیت `draft` عمومی نیست.

جست‌وجوی فعلی از PostgreSQL Full-Text Search استفاده می‌کند. جست‌وجوی برداری، OCR، پردازش PDF، محدودسازی نرخ درخواست، پایش مصرف مدل و پنل ورود منابع در مراحل بعد لازم‌اند.

## ملاحظات انتشار
قبل از عرضه عمومی، تنظیم احراز هویت، secrets، محدودسازی نرخ، کنترل هزینه مدل، پشتیبان‌گیری، تست امنیت و صحت حقوقی مجموعه منابع لازم است. کلید AI هرگز در کد frontend یا مخزن GitHub قرار نگیرد.
