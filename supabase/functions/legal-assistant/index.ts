import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://amlak058.ir",
  "https://www.amlak058.ir",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && allowedOrigins.has(origin) ? origin : "https://amlak058.ir";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (origin && !allowedOrigins.has(origin)) {
    return json({ error: "origin_not_allowed" }, 403, origin);
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const aiApiKey = Deno.env.get("AI_API_KEY");
  const aiModel = Deno.env.get("AI_MODEL");
  const aiApiUrl = Deno.env.get("AI_API_URL") ?? "https://api.openai.com/v1/chat/completions";

  if (!supabaseUrl || !supabaseAnonKey || !aiApiKey || !aiModel) {
    return json({ error: "service_not_configured", message: "سرویس هنوز به‌طور کامل پیکربندی نشده است." }, 503, origin);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "authentication_required", message: "برای استفاده از دستیار ابتدا وارد حساب کاربری شوید." }, 401, origin);
  }

  let body: { question?: string; conversation_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }

  const question = (body.question ?? "").trim();
  if (!question || question.length > 12000) {
    return json({ error: "invalid_question", message: "متن پرسش باید بین ۱ تا ۱۲۰۰۰ نویسه باشد." }, 400, origin);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userResult, error: userError } = await supabase.auth.getUser();
  const user = userResult?.user;
  if (userError || !user) {
    return json({ error: "invalid_session" }, 401, origin);
  }

  let conversationId = body.conversation_id;
  if (conversationId) {
    const { data: conversation, error } = await supabase
      .from("legal_conversations")
      .select("id")
      .eq("id", conversationId)
      .single();
    if (error || !conversation) {
      return json({ error: "conversation_not_found" }, 404, origin);
    }
  } else {
    const title = question.replace(/\s+/g, " ").slice(0, 90);
    const { data: conversation, error } = await supabase
      .from("legal_conversations")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    if (error || !conversation) {
      return json({ error: "conversation_create_failed" }, 500, origin);
    }
    conversationId = conversation.id;
  }

  const { error: userMessageError } = await supabase.from("legal_messages").insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: "user",
    content: question,
  });
  if (userMessageError) {
    return json({ error: "message_save_failed" }, 500, origin);
  }

  const { data: retrieved, error: searchError } = await supabase.rpc("search_legal_chunks", {
    search_text: question,
    result_limit: 6,
  });
  if (searchError) {
    return json({ error: "legal_search_failed" }, 500, origin);
  }

  const sources = (retrieved ?? []).map((item: Record<string, unknown>, index: number) => ({
    ref: index + 1,
    title: item.title,
    source_type: item.source_type,
    document_number: item.document_number,
    official_url: item.official_url,
    heading: item.heading,
    content: item.content,
  }));

  const sourceContext = sources.length
    ? sources.map((s: Record<string, unknown>) =>
        `[منبع ${s.ref}] ${s.title}\nنوع: ${s.source_type}\nشماره: ${s.document_number ?? "ذکر نشده"}\nبخش: ${s.heading ?? "بدون عنوان"}\nمتن مستند: ${s.content}\nنشانی رسمی: ${s.official_url ?? "ثبت نشده"}`
      ).join("\n\n")
    : "برای این پرسش در بانک مستندات منتشرشده، منبعی بازیابی نشد.";

  const systemPrompt = `شما دستیار حقوقی سامانه «ایران» هستید و فقط درباره حقوق جمهوری اسلامی ایران پاسخ می‌دهید.
قواعد الزامی:
۱) هیچ ماده، رأی وحدت رویه، نظریه مشورتی، شماره یا تاریخ منبعی را جعل نکن.
۲) فقط وقتی به منبع استناد کن که در بخش «منابع بازیابی‌شده» ارائه شده باشد؛ ارجاع را به صورت [منبع ۱] بنویس.
۳) اگر منبع مرتبط بازیابی نشده یا برای نتیجه‌گیری کافی نیست، صریحاً بگو که بانک فعلی مستند کافی ندارد و از قطعیت خودداری کن.
۴) قانون، تحلیل، رویه قضایی و فرضیات را از هم جدا کن.
۵) تاریخ وقوع موضوع و اصلاحات قانونی مؤثر را در صورت ارائه اطلاعات بررسی کن؛ درباره اعتبار زمانی منبعِ نامعلوم ادعا نکن.
۶) پاسخ فارسی، روشن و ساختاریافته بده. برای نتیجه قطعی، اسناد و جزئیات لازم را مشخص کن.
۷) در پایان یادآوری کن که پاسخ هوش مصنوعی جایگزین بررسی وکیل و متن رسمی قانون نیست.
منابع بازیابی‌شده:
${sourceContext}`;

  let answer = "";
  try {
    const aiResponse = await fetch(aiApiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${aiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiModel,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
      }),
    });
    if (!aiResponse.ok) {
      return json({ error: "ai_provider_error", provider_status: aiResponse.status }, 502, origin);
    }
    const aiData = await aiResponse.json();
    answer = aiData?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!answer) return json({ error: "empty_ai_response" }, 502, origin);
  } catch {
    return json({ error: "ai_provider_unreachable" }, 502, origin);
  }

  const { error: assistantMessageError } = await supabase.from("legal_messages").insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: "assistant",
    content: answer,
    source_refs: sources,
  });
  if (assistantMessageError) {
    return json({ error: "answer_save_failed" }, 500, origin);
  }

  await supabase.from("legal_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return json({
    conversation_id: conversationId,
    answer,
    citations: sources.map((s: Record<string, unknown>) => ({
      ref: s.ref,
      title: s.title,
      source_type: s.source_type,
      document_number: s.document_number,
      official_url: s.official_url,
    })),
    retrieved_source_count: sources.length,
    note: "پاسخ بر پایه منابع بازیابی‌شده از بانک حقوقی سامانه تهیه شده است.",
  }, 200, origin);
});
