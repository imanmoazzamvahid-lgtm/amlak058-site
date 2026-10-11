const API_URL = "https://login.niazpardaz.ir/api/v2/RestWebApi/SendBatchSms";

type PropertyRecord = {
  id?: number | string;
  title?: string | null;
  city?: string | null;
  main_category?: string | null;
  sub_category?: string | null;
  property_type?: string | null;
  transaction_type?: string | null;
  status?: string | null;
};

type DatabaseWebhookEvent = {
  type?: string;
  table?: string;
  schema?: string;
  record?: PropertyRecord | null;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safePart(value: unknown, maxLength = 70): string {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLength);
}

async function sendNiazpardazSms(apiKey: string, fromNumber: string, toNumber: string, message: string) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({
      fromNumber,
      messageContent: message,
      toNumbers: toNumber,
      isFlash: false,
    }),
  });

  const bodyText = await response.text();
  let result: { resultCode?: number | string; batchSmsId?: number | string } = {};
  try {
    result = JSON.parse(bodyText);
  } catch {
    throw new Error("Niazpardaz returned an unreadable response");
  }

  if (!response.ok || Number(result.resultCode) !== 0) {
    throw new Error("Niazpardaz send failed with HTTP " + response.status + " and resultCode " + String(result.resultCode));
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("ADMIN_WEBHOOK_SECRET");
  const suppliedSecret = req.headers.get("x-webhook-secret");
  if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const apiKey = Deno.env.get("NIAZPARDAZ_API_KEY");
  const sender = Deno.env.get("NIAZPARDAZ_SENDER_NUMBER");
  const adminPhone = Deno.env.get("ADMIN_SMS_PHONE");
  if (!apiKey || !sender || !adminPhone) {
    console.error("Missing Niazpardaz or admin notification secrets");
    return json({ error: "Notification provider is not configured" }, 500);
  }

  try {
    const event = await req.json() as DatabaseWebhookEvent;
    if (event.type !== "INSERT" || event.schema !== "public" || event.table !== "properties" || !event.record) {
      return json({ ignored: true });
    }

    const property = event.record;
    const title = safePart(property.title, 70) || "ملک بدون عنوان";
    const city = safePart(property.city, 30) || "شهر نامشخص";
    const category = safePart(
      [property.main_category, property.sub_category, property.transaction_type, property.property_type].filter(Boolean).join(" / "),
      55,
    );
    const status = safePart(property.status, 20) || "نامشخص";
    const message = `آگهی جدید در املاک ۰۵۸\nعنوان: ${title}\nشهر: ${city}${category ? "\nنوع: " + category : ""}\nوضعیت: ${status}\nشناسه: ${safePart(property.id, 20)}`;

    const result = await sendNiazpardazSms(apiKey, sender, adminPhone, message);
    return json({ success: true, batchSmsId: result.batchSmsId ?? null });
  } catch (error) {
    console.error("Admin notification delivery failed:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Notification delivery failed" }, 500);
  }
});
