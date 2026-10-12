import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

type SendSmsEvent = {
  user?: { phone?: string };
  sms?: { otp?: string };
};

type NiazpardazResult = {
  resultCode?: number | string;
  batchSmsId?: number | string;
};

const API_URL = "https://login.niazpardaz.ir/api/v2/RestWebApi/SendBatchSms";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function toIranMobile(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0098")) digits = digits.slice(2);
  if (digits.startsWith("98")) digits = "0" + digits.slice(2);
  else if (digits.length === 10 && digits.startsWith("9")) digits = "0" + digits;
  if (!/^09\d{9}$/.test(digits)) throw new Error("Invalid Iranian mobile number");
  return digits;
}

async function sendNiazpardazSms(apiKey: string, fromNumber: string, toNumber: string, message: string) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      fromNumber,
      messageContent: message,
      toNumbers: toNumber,
      isFlash: false,
    }),
  });

  const bodyText = await response.text();
  const contentType = response.headers.get("content-type") ?? "(missing)";
  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    // Keep the diagnostic short. Never log request credentials or the OTP.
    const preview = bodyText.replace(/\s+/g, " ").trim().slice(0, 240) || "(empty response body)";
    throw new Error(
      `Niazpardaz returned non-JSON response; HTTP ${response.status}; content-type ${contentType}; body preview: ${preview}`,
    );
  }

  if (!response.ok) {
    throw new Error(`Niazpardaz HTTP ${response.status}; response: ${JSON.stringify(payload).slice(0, 240)}`);
  }

  // The current official SDK wraps results in { success, result, errorMessage }.
  // Accept the direct result shape too, for compatibility with API variations.
  if (payload.success === false) {
    throw new Error(`Niazpardaz API error: ${String(payload.errorMessage ?? "unspecified provider error").slice(0, 200)}`);
  }

  const result = (payload.result && typeof payload.result === "object"
    ? payload.result
    : payload) as NiazpardazResult;

  if (Number(result.resultCode) !== 0) {
    throw new Error(
      `Niazpardaz send failed; resultCode ${String(result.resultCode)}; response: ${JSON.stringify(payload).slice(0, 240)}`,
    );
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("NIAZPARDAZ_API_KEY");
  const sender = Deno.env.get("NIAZPARDAZ_SENDER_NUMBER");
  const configuredSecrets = Deno.env.get("SEND_SMS_HOOK_SECRETS") ?? "";

  if (!apiKey || !sender || !configuredSecrets) {
    console.error("Missing Niazpardaz or Send SMS Hook secrets");
    return json({ error: "SMS provider is not configured" }, 500);
  }

  const rawPayload = await req.text();
  const headers = Object.fromEntries(req.headers.entries());
  let event: SendSmsEvent | null = null;

  for (const configured of configuredSecrets.split("|").map((v) => v.trim()).filter(Boolean)) {
    const secret = configured.replace(/^v\d+,whsec_/, "");
    if (!secret) continue;
    try {
      event = new Webhook(secret).verify(rawPayload, headers) as SendSmsEvent;
      break;
    } catch {
      // Try the next configured secret, if rotation left more than one.
    }
  }

  if (!event) {
    console.error("Supabase Send SMS Hook signature verification failed");
    return json({ error: "Unauthorized hook request" }, 401);
  }

  try {
    const phone = toIranMobile(String(event.user?.phone ?? ""));
    const otp = String(event.sms?.otp ?? "").trim();
    if (!/^\d{4,8}$/.test(otp)) throw new Error("Invalid OTP payload");

    const result = await sendNiazpardazSms(
      apiKey,
      sender,
      phone,
      `کد تأیید ورود به املاک ۰۵۸: ${otp}\nاین کد را در اختیار دیگران نگذارید.`,
    );

    return json({ success: true, batchSmsId: result.batchSmsId ?? null });
  } catch (error) {
    console.error("Send SMS Hook delivery failed:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "SMS delivery failed" }, 500);
  }
});
