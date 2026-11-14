import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = "https://zjkghjlqzpuxpljiyfcj.supabase.co";
const allowedOrigins = new Set([
  APP_ORIGIN,
  "https://hoosh-hoghooghi-iran.imanmoazzamvahid.workers.dev",
  "https://amlak058.ir",
  "https://www.amlak058.ir",
  "https://imanmoazzamvahid-lgtm.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && allowedOrigins.has(origin) ? origin : APP_ORIGIN;
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


function normalizeFa(value: string): string {
  return value.toLowerCase()
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[ـ،؛؟!.,:()[\]{}"'«»]/g, " ")
    .replace(/[\u200c\u200f\u200e]/g, " ")
    .replace(/\s+/g, " ").trim();
}
const STOP_WORDS = new Set(["از","به","در","با","برای","و","یا","که","را","این","آن","یک","چه","چگونه","چطور","آیا","اگر","اما","است","هست","شود","شده","می","من","ما","شما","او","آنها","بر","تا","پس","هم","هر","بین","درباره","مورد","قانون","حقوقی"]);
function termsOf(value: string): string[] {
  return [...new Set(normalizeFa(value).split(" ").filter(t => t.length > 1 && !STOP_WORDS.has(t)))];
}
function detectDomain(q: string): string {
  const groups: [string,string[]][] = [
    ["کیفری",["جرم","سرقت","کلاهبرداری","خیانت","تهدید","ضرب","قتل","مجازات","بازداشت","اتهام","شکایت کیفری"]],
    ["خانواده",["طلاق","مهریه","نفقه","حضانت","تمکین","زوج","زوجه","ارث"]],
    ["قراردادها و تعهدات",["قرارداد","مبایعه","بیع","اجاره","فسخ","خیار","تعهد","وجه التزام","چک","معامله"]],
    ["آیین دادرسی و اجرای احکام",["دادخواست","تجدیدنظر","فرجام","اعتراض","مهلت","صلاحیت","اجراییه","توقیف","اعسار","ابلاغ"]],
    ["تجارت و شرکت‌ها",["شرکت","سهام","ورشکستگی","تاجر","چک","سفته","تجاری"]],
    ["امور اداری و عمومی",["شهرداری","دیوان عدالت","تصمیم اداری","تخلف اداری","مجوز","کمیسیون"]],
  ];
  const n=normalizeFa(q);
  const hits=groups.map(([name,words])=>({name,score:words.reduce((a,w)=>a+(n.includes(normalizeFa(w))?1:0),0)})).sort((a,b)=>b.score-a.score);
  return hits[0]?.score ? hits[0].name : "عمومی / نیازمند تعیین موضوع";
}
function detectIntent(q: string): string {
  const n=normalizeFa(q);
  if(/مهلت|چند روز|چه زمانی|مرور زمان|تاریخ|موعد/.test(n)) return "مهلت و مواعد قانونی";
  if(/صلاحیت|کدام دادگاه|کجا طرح|مرجع رسیدگی/.test(n)) return "صلاحیت و مرجع رسیدگی";
  if(/جرم|مجازات|حبس|جزای نقدی|اتهام|شکایت کیفری/.test(n)) return "تحلیل کیفری";
  if(/فسخ|ابطال|بطلان|صحت معامله|اعتبار قرارداد|انحلال/.test(n)) return "اعتبار و آثار قرارداد";
  if(/دفاع|لایحه|دادخواست|شکواییه|اعتراض|تجدیدنظر/.test(n)) return "دفاع و اقدام قضایی";
  if(/خسارت|ضرر|دیه|وجه التزام|مطالبه/.test(n)) return "مطالبه خسارت و ضمانت اجرا";
  return "پرسش و تحلیل حقوقی";
}
function buildEngineAnswer(question: string, sources: Record<string, unknown>[], mode: string): string {
  const qTerms=termsOf(question);
  const ranked=sources.map(s=>{
    const hay=termsOf([s.title,s.heading,s.legal_subject,s.content].map(x=>String(x??"")).join(" "));
    const hits=qTerms.filter(t=>hay.includes(t)).length;
    return {...s,_hits:hits,_ratio:qTerms.length?hits/qTerms.length:0};
  }).sort((a,b)=>Number(b._hits)-Number(a._hits));
  const domain=detectDomain(question), intent=detectIntent(question);
  const lines:string[]=[];
  lines.push("**موتور اختصاصی هوش حقوقی ایران — نسخه آزمایشی ۰.۱ (قاعده‌محور و مستقل از سرویس مدل خارجی)**");
  lines.push("**موضوع تشخیص‌داده‌شده:** "+domain+" | **نوع درخواست:** "+intent);
  lines.push("**صورت مسئله:** "+question);
  if(!ranked.length) {
    lines.push("در بانک منتشرشده سامانه، سند قابل استنادی برای این پرسش بازیابی نشد؛ بنابراین نتیجه ماهوی صادر نمی‌شود.");
    return lines.join("\n\n");
  }
  lines.push("**یافته‌های مستند بازیابی‌شده:**");
  for(const [i,s] of ranked.entries()) {
    const body=String(s.content??"").replace(/\s+/g," ").trim();
    const excerpt=body.length>1400?body.slice(0,1400)+"…":body;
    lines.push(`[منبع ${s.ref}] **${String(s.title??"سند بدون عنوان")}** — بخش: ${String(s.heading??"ثبت نشده")}\nنوع سند: ${String(s.source_type??"نامشخص")} | شماره: ${String(s.document_number??"ثبت نشده")}\nوضعیت انتشار: ${String(s.status??"نامشخص")} | وضعیت اعتبار ثبت‌شده: ${String(s.legal_force_status??"نامشخص")}\nآخرین بررسی اعتبار: ${String(s.last_status_checked_at??"ثبت نشده")}\nمتن بازیابی‌شده: ${excerpt}\nنشانی رسمی: ${String(s.official_url??"ثبت نشده")}`);
  }
  lines.push("**چارچوب تحلیل موتور:**");
  lines.push("۱) ابتدا باید عناصر و شرایط مندرج در متن منبع با وقایع پرونده تطبیق داده شود؛ صرف شباهت واژگانی، اثبات‌کننده انطباق حکم نیست.");
  if(intent==="مهلت و مواعد قانونی") lines.push("۲) برای محاسبه مهلت، مبدأ ابلاغ یا اطلاع، نوع تصمیم، طریق اعتراض، قواعد احتساب روزها و تعطیلات و مقررات خاص همان مرجع باید احراز شود. بدون این داده‌ها تاریخ انقضا اعلام نمی‌شود.");
  else if(intent==="صلاحیت و مرجع رسیدگی") lines.push("۲) صلاحیت ذاتی، محلی و در صورت لزوم صلاحیت اختصاصی باید جداگانه بررسی شود؛ محل اقامت طرفین، محل وقوع عمل یا مال و خواسته دقیق می‌تواند مؤثر باشد.");
  else if(intent==="تحلیل کیفری") lines.push("۲) در تحلیل کیفری باید رفتار مادی، عنصر روانی، موضوع جرم، شرایط انتساب، ادله اثبات و دفاعیات احتمالی جداگانه احراز شوند؛ عنوان اتهامی به‌تنهایی برای احراز جرم کافی نیست.");
  else if(intent==="اعتبار و آثار قرارداد") lines.push("۲) برای ارزیابی قرارداد باید قصد و رضا، اهلیت، موضوع و جهت معامله، تشریفات لازم، شروط قراردادی، زمان انعقاد و آثار تخلف از تعهد بررسی شود.");
  else if(intent==="دفاع و اقدام قضایی") lines.push("۲) اقدام قضایی باید با توجه به مرحله رسیدگی، سمت و نفع، مهلت، خواسته یا اتهام، ادله موجود و تصمیم مورد اعتراض انتخاب شود.");
  else if(intent==="مطالبه خسارت و ضمانت اجرا") lines.push("۲) مبنای مسئولیت، رابطه سببیت، ورود و میزان خسارت، قابلیت انتساب و شروط قراردادی یا مقررات خاص باید مستقلاً احراز شود.");
  else lines.push("۲) ابتدا باید رابطه حقوقی، وقایع مؤثر، خواسته یا اتهام، ادله و دفاعیات طرفین به‌صورت جداگانه صورت‌بندی شود.");
  lines.push("۳) وضعیت اعتبار اسناد صرفاً مطابق داده ثبت‌شده در بانک گزارش شده است. هرجا وضعیت «نامشخص» یا تاریخ بررسی خالی است، اعتبار روزآمد احراز نشده و نباید آن را قانون لازم‌الاجرا تلقی کرد.");
  lines.push("۴) ارجاع‌های [منبع شماره] فقط به اسناد فهرست‌شده در همین پاسخ اشاره دارند. این نسخه از استنتاج زبانی آزاد استفاده نمی‌کند و از ساختن ماده، رأی یا نظریه مشورتی خودداری می‌کند.");
  lines.push(mode==="professional"
    ? "**موارد لازم برای تکمیل تحلیل تخصصی:** متن کامل سند و اصلاحات آن، تاریخ مؤثر، مستندات پرونده، مرحله رسیدگی، خواسته/اتهام و ادله هر طرف."
    : "**برای نتیجه دقیق‌تر:** متن قرارداد یا رأی/ابلاغیه، تاریخ‌های مهم و شرح کوتاه وقایع را ارائه کنید.");
  lines.push("**محدودیت نسخه:** این موتور در حال حاضر موتور قاعده‌محورِ بازیابی، دسته‌بندی و کنترل استناد است؛ هنوز مدل زبانی مستقلِ آموزش‌دیده نیست و نتیجه قطعی قضایی صادر نمی‌کند.");
  return lines.join("\n\n");
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "https://zjkghjlqzpuxpljiyfcj.supabase.co";
  function readKeyMap(name: string): Record<string, string> {
    try {
      const raw = Deno.env.get(name);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
    } catch {
      return {};
    }
  }
  // Support both legacy JWT keys and the current Supabase publishable/secret key model.
  const publishableKeys = readKeyMap("SUPABASE_PUBLISHABLE_KEYS");
  const secretKeys = readKeyMap("SUPABASE_SECRET_KEYS");
  const supabaseAnonKey =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    publishableKeys.default ??
    "";
  const supabaseServiceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    secretKeys.default ??
    "";

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    console.error("Legal assistant configuration missing", {
      hasUrl: Boolean(supabaseUrl),
      hasPublishableKey: Boolean(supabaseAnonKey),
      hasSecretKey: Boolean(supabaseServiceRoleKey),
    });
    return json({
      error: "service_not_configured",
      message: "کلیدهای داخلی Supabase برای اجرای دستیار کامل نیستند. تنظیمات محرمانه پروژه را بررسی کنید.",
    }, 503, origin);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "authentication_required", message: "برای استفاده از دستیار ابتدا وارد حساب کاربری شوید." }, 401, origin);
  }

  let body: { question?: string; conversation_id?: string; audience_mode?: string };
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

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Usage quota is enforced by the authenticated inference worker.

  const requestedMode = body.audience_mode === "professional" ? "professional" : body.audience_mode === "public" ? "public" : null;
  let conversationId = body.conversation_id;
  let audienceMode = requestedMode ?? "public";
  if (conversationId) {
    const { data: conversation, error } = await supabase
      .from("legal_conversations")
      .select("id,audience_mode")
      .eq("id", conversationId)
      .single();
    if (error || !conversation) {
      return json({ error: "conversation_not_found" }, 404, origin);
    }
    audienceMode = requestedMode ?? (conversation.audience_mode === "professional" ? "professional" : "public");
    if (requestedMode && requestedMode !== conversation.audience_mode) {
      const { error: modeError } = await supabase.from("legal_conversations")
        .update({ audience_mode: requestedMode })
        .eq("id", conversationId);
      if (modeError) return json({ error: "conversation_mode_update_failed" }, 500, origin);
    }
  } else {
    const title = question.replace(/\s+/g, " ").slice(0, 90);
    const { data: conversation, error } = await supabase
      .from("legal_conversations")
      .insert({ user_id: user.id, title, audience_mode: audienceMode })
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

  const { data: historyRows, error: historyError } = await supabase
    .from("legal_messages")
    .select("role,content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(12);
  if (historyError) {
    return json({ error: "conversation_history_failed" }, 500, origin);
  }

  const previousMessages = (historyRows ?? [])
    .filter((item: Record<string, unknown>, index: number) =>
      !(index === 0 && item.role === "user" && item.content === question)
    )
    .reverse()
    .slice(-10)
    .map((item: Record<string, unknown>) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: String(item.content ?? ""),
    }));

  // Retrieve against the current question only. Previous turns remain model context,
  // but cannot silently introduce unrelated citations into this answer.
  const retrievalQuery = question.slice(0, 3000);

  let retrieved: Record<string, unknown>[] | null = null;
  let retrievalMethod = "keyword_fallback";
  try {
    const embeddingSession = new Supabase.ai.Session("gte-small");
    const embeddingOutput = await embeddingSession.run(retrievalQuery, {
      mean_pool: true,
      normalize: true,
    });
    const queryEmbedding = Array.from(embeddingOutput as Iterable<number>);
    if (queryEmbedding.length !== 384) {
      throw new Error("unexpected_embedding_dimensions");
    }
    // Gradually index the lexically relevant published chunks using the same local model.
    const lexicalCandidates = await supabaseAdmin.rpc("search_legal_chunks", {
      search_text: retrievalQuery,
      result_limit: 8,
    });
    if (lexicalCandidates.error) throw lexicalCandidates.error;
    for (const candidate of (lexicalCandidates.data ?? []) as Record<string, unknown>[]) {
      if (!candidate.chunk_id || !candidate.content) continue;
      const { data: existing } = await supabaseAdmin
        .from("legal_chunks")
        .select("embedding")
        .eq("id", String(candidate.chunk_id))
        .maybeSingle();
      if (existing?.embedding) continue;
      try {
        const contentEmbedding = await embeddingSession.run(
          String(candidate.content).slice(0, 8000),
          { mean_pool: true, normalize: true },
        );
        const vector = Array.from(contentEmbedding as Iterable<number>);
        if (vector.length !== 384) continue;
        const { error: indexError } = await supabaseAdmin
          .from("legal_chunks")
          .update({
            embedding: JSON.stringify(vector),
            embedding_model: "gte-small",
            embedding_generated_at: new Date().toISOString(),
          })
          .eq("id", String(candidate.chunk_id));
        if (indexError) console.warn("Could not store chunk embedding", indexError.message);
      } catch (chunkEmbeddingError) {
        console.warn("Could not generate chunk embedding", chunkEmbeddingError);
      }
    }
    const hybridResult = await supabaseAdmin.rpc("search_legal_chunks_hybrid", {
      search_text: retrievalQuery,
      query_embedding: JSON.stringify(queryEmbedding),
      result_limit: 6,
    });
    if (hybridResult.error) throw hybridResult.error;
    retrieved = hybridResult.data ?? [];
    retrievalMethod = retrieved.some((row: Record<string, unknown>) => row.semantic_similarity !== null)
      ? "hybrid_semantic_and_keyword"
      : "hybrid_keyword_until_indexing";
  } catch (embeddingOrHybridError) {
    console.warn("Semantic retrieval unavailable; using keyword search", embeddingOrHybridError);
    const lexicalResult = await supabaseAdmin.rpc("search_legal_chunks", {
      search_text: retrievalQuery,
      result_limit: 6,
    });
    if (lexicalResult.error) {
      return json({ error: "legal_search_failed" }, 500, origin);
    }
    retrieved = lexicalResult.data ?? [];
  }

  const retrievedRows = retrieved ?? [];
  if (!retrievedRows.length) {
    const answer = "در بانک مستندات منتشرشده سامانه، برای این پرسش منبع حقوقی قابل استنادی بازیابی نشد. بنابراین در این مرحله از ارائه نتیجه ماهوی یا استناد به شماره ماده و رأی خودداری می‌شود. برای پاسخ مستند، باید متن قانون، مقرره یا رأی مرتبط به بانک اضافه و وضعیت اعتبار آن راستی‌آزمایی شود.";
    const { error: assistantMessageError } = await supabase.from("legal_messages").insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: "assistant",
      content: answer,
      source_refs: [],
    });
    if (assistantMessageError) return json({ error: "answer_save_failed" }, 500, origin);
    await supabase.from("legal_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);
    return json({
      conversation_id: conversationId,
      answer,
      citations: [],
      retrieved_source_count: 0,
      retrieval_method: retrievalMethod,
      note: "پاسخ ماهوی بدون سند منتشرشده تولید نشد.",
    }, 200, origin);
  }
  const sourceIds = [...new Set(retrievedRows.map((item: Record<string, unknown>) => String(item.source_id ?? "")).filter(Boolean))];
  const { data: metadataRows, error: metadataError } = sourceIds.length
    ? await supabase.from("legal_sources")
        .select("id,issuing_authority,enactment_date,publication_date,effective_from,effective_to,last_verified_at,last_status_checked_at,legal_subject,source_notes,status,legal_force_status,official_gazette_number,official_gazette_date,verification_method")
        .in("id", sourceIds)
    : { data: [] as Record<string, unknown>[], error: null };
  if (metadataError) return json({ error: "source_metadata_failed" }, 500, origin);
  const metadataById = new Map((metadataRows ?? []).map((row: Record<string, unknown>) => [String(row.id), row]));
  const sources = retrievedRows.map((item: Record<string, unknown>, index: number) => {
    const metadata = metadataById.get(String(item.source_id ?? "")) ?? {};
    return {
      ref: index + 1,
      title: item.title,
      source_type: item.source_type,
      document_number: item.document_number,
      official_url: item.official_url,
      heading: item.heading,
      content: item.content,
      issuing_authority: metadata.issuing_authority,
      enactment_date: metadata.enactment_date,
      publication_date: metadata.publication_date,
      effective_from: metadata.effective_from,
      effective_to: metadata.effective_to,
      last_verified_at: metadata.last_verified_at,
      last_status_checked_at: metadata.last_status_checked_at,
      legal_subject: metadata.legal_subject,
      source_notes: metadata.source_notes,
      status: metadata.status,
      legal_force_status: metadata.legal_force_status,
      official_gazette_number: metadata.official_gazette_number,
      official_gazette_date: metadata.official_gazette_date,
      verification_method: metadata.verification_method,
    };
  });

  const sourceContext = sources.length
    ? sources.map((s: Record<string, unknown>) =>
        `[منبع ${s.ref}] ${s.title}\nنوع: ${s.source_type}\nمرجع صادرکننده/تصویب‌کننده: ${s.issuing_authority ?? "ثبت نشده"}\nشماره سند: ${s.document_number ?? "ذکر نشده"}\nوضعیت انتشار در بانک: ${s.status ?? "نامشخص"}\nوضعیت اعتبار ثبت‌شده: ${s.legal_force_status ?? "نامشخص"}\nشماره روزنامه رسمی: ${s.official_gazette_number ?? "ثبت نشده"}\nتاریخ روزنامه رسمی: ${s.official_gazette_date ?? "ثبت نشده"}\nتاریخ تصویب: ${s.enactment_date ?? "ثبت نشده"}\nتاریخ انتشار: ${s.publication_date ?? "ثبت نشده"}\nشروع اعتبار: ${s.effective_from ?? "ثبت نشده"}\nپایان اعتبار: ${s.effective_to ?? "ثبت نشده"}\nآخرین بررسی اعتبار: ${s.last_status_checked_at ?? "ثبت نشده"}\nآخرین راستی‌آزمایی متن: ${s.last_verified_at ?? "ثبت نشده"}\nروش راستی‌آزمایی: ${s.verification_method ?? "ثبت نشده"}\nیادداشت منبع و اعتبار: ${s.source_notes ?? "ثبت نشده"}\nبخش: ${s.heading ?? "بدون عنوان"}\nموضوع: ${s.legal_subject ?? "ثبت نشده"}\nمتن مستند: ${s.content}\nنشانی سند: ${s.official_url ?? "ثبت نشده"}`
      ).join("\n\n")
    : "برای این پرسش در بانک مستندات منتشرشده، منبعی بازیابی نشد.";

  const modeInstructions = audienceMode === "professional"
    ? `حالت پاسخ‌گویی: حرفه‌ای ویژه وکلا و متخصصان حقوقی. تحلیل را با ساختار زیر ارائه کن: ۱) صورت مسئله و وقایع مؤثر ۲) مسائل و پرسش‌های حقوقی ۳) مبانی قانونی و رویه‌ایِ موجود در منابع بازیابی‌شده ۴) تحلیل ارکان و شرایط ۵) ادله و بار اثبات ۶) ایرادات و دفاعیات موافق و مخالف ۷) ریسک‌ها و خلأهای اطلاعاتی ۸) راهبرد و اقدامات پیشنهادی ۹) جمع‌بندی. متن قضایی را فقط در صورت درخواست صریح تنظیم کن. اصطلاحات تخصصی و تفکیک ادعا از دلیل را رعایت کن.`
    : `حالت پاسخ‌گویی: عمومی. با زبان روشن و قابل فهم پاسخ بده؛ ابتدا نتیجه کوتاه، سپس توضیح مبنای حقوقی، مراحل عملی اقدام و مدارک لازم را بیان کن. از اصطلاحات تخصصی بدون توضیح پرهیز کن و درباره نتیجه قطعی دعوا وعده نده.`;

  const systemPrompt = `شما دستیار حقوقی سامانه «ایران» هستید و فقط درباره حقوق جمهوری اسلامی ایران پاسخ می‌دهید.
${modeInstructions}
قواعد الزامی:
۱) هیچ ماده، رأی وحدت رویه، نظریه مشورتی، شماره یا تاریخ منبعی را جعل نکن.
۲) فقط وقتی به منبع استناد کن که در بخش «منابع بازیابی‌شده» ارائه شده باشد؛ ارجاع را به صورت [منبع ۱] بنویس.
۳) اگر منبع مرتبط بازیابی نشده یا برای نتیجه‌گیری کافی نیست، صریحاً بگو که بانک فعلی مستند کافی ندارد و از قطعیت خودداری کن.
۴) قانون، تحلیل، رویه قضایی و فرضیات را از هم جدا کن.
۵) تاریخ وقوع موضوع و اصلاحات قانونی مؤثر را در صورت ارائه اطلاعات بررسی کن؛ درباره اعتبار زمانی منبعِ نامعلوم ادعا نکن.
۶) پاسخ فارسی، روشن و ساختاریافته بده. برای نتیجه قطعی، اسناد و جزئیات لازم را مشخص کن.
۷) اگر وضعیت اعتبار منبع «نامشخص» است یا تاریخ آخرین بررسی اعتبار ندارد، هرگز از عبارت‌هایی مانند «قانون فعلی»، «لازم‌الاجرا در حال حاضر» یا «منسوخ نشده» استفاده نکن؛ صریحاً وضعیت اعتبار را نامعلوم اعلام کن.
۸) شماره و تاریخ روزنامه رسمی را فقط در صورت وجود در داده منبع نقل کن. تاریخ تصویب، ابلاغ و انتشار را با یکدیگر خلط نکن.
۹) در پایان یادآوری کن که پاسخ هوش مصنوعی جایگزین بررسی وکیل و متن رسمی قانون نیست.
۱۰) اگر عنوان یا یادداشت منبع نشان می‌دهد متن گزیده یا ناقص است، آن را متن کامل قانون یا رأی معرفی نکن و دامنه استناد را فقط به همان بخش محدود کن.
منابع بازیابی‌شده:
${sourceContext}`;

  // The authenticated inference worker validates the session and enforces the per-user quota.
  let answer = "";
  let modelName = "";
  try {
    const inferenceResponse = await fetch("https://iran-legal-ai-inference.imanmoazzamvahid.workers.dev", {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        system_prompt: systemPrompt,
        messages: [...previousMessages, { role: "user", content: question }],
      }),
    });
    const inferencePayload = await inferenceResponse.json();
    if (!inferenceResponse.ok) {
      return json({
        error: String(inferencePayload.error ?? "model_inference_failed"),
        message: String(inferencePayload.message ?? "تولید پاسخ با مدل زبانی انجام نشد."),
      }, inferenceResponse.status, origin);
    }
    answer = String(inferencePayload.answer ?? "").trim();
    modelName = String(inferencePayload.model ?? "");
    if (!answer) throw new Error("empty_model_answer");
  } catch (modelError) {
    console.error("Legal model inference failed", modelError);
    return json({
      error: "model_inference_failed",
      message: "مدل زبانی در حال حاضر پاسخ قابل استفاده‌ای تولید نکرد. لطفاً دوباره تلاش کنید.",
    }, 502, origin);
  }

  const citations = sources.map((s: Record<string, unknown>) => ({
    ref: s.ref,
    title: s.title,
    source_type: s.source_type,
    issuing_authority: s.issuing_authority,
    document_number: s.document_number,
    official_url: s.official_url,
    enactment_date: s.enactment_date,
    publication_date: s.publication_date,
    official_gazette_number: s.official_gazette_number,
    official_gazette_date: s.official_gazette_date,
    effective_from: s.effective_from,
    effective_to: s.effective_to,
    legal_force_status: s.legal_force_status,
    last_status_checked_at: s.last_status_checked_at,
    last_verified_at: s.last_verified_at,
    verification_method: s.verification_method,
    source_notes: s.source_notes,
    status: s.status,
  }));
  const { error: assistantMessageError } = await supabase.from("legal_messages").insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: "assistant",
    content: answer,
    source_refs: citations,
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
    citations,
    retrieved_source_count: sources.length,
    retrieval_method: retrievalMethod,
    model: modelName,
    note: "پاسخ با مدل زبانی و بر پایه منابع بازیابی‌شده از بانک حقوقی سامانه تهیه شده است.",
  }, 200, origin);
});
