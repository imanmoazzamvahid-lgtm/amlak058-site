const allowedOrigins = new Set([
  "https://amlak058.ir",
  "https://www.amlak058.ir"
]);

const buckets = new Map();

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function normalize(value) {
  return String(value ?? "")
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function safeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanProperties(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 60).map(item => {
    if (!item || typeof item !== "object") return null;
    const id = safeText(item.id, 100);
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return null;

    const images = Array.isArray(item.image_urls)
      ? item.image_urls.slice(0, 5).map(value => {
          const url = safeText(value, 1000);
          return /^https:\/\//i.test(url) ? url : "";
        }).filter(Boolean)
      : [];
    const primaryImage = safeText(item.image_url, 1000);
    const imageUrl = /^https:\/\//i.test(primaryImage) ? primaryImage : (images[0] || "");

    return {
      id,
      title: safeText(item.title, 150),
      city: safeText(item.city, 60),
      property_type: safeText(item.property_type, 60),
      transaction_type: safeText(item.transaction_type, 60),
      price: safeNumber(item.price),
      deposit: safeNumber(item.deposit),
      monthly_rent: safeNumber(item.monthly_rent),
      area: safeNumber(item.area ?? item.building_area ?? item.land_area),
      bedrooms: safeNumber(item.bedrooms),
      address: safeText(item.address, 120),
      description: safeText(item.description, 240),
      image_url: imageUrl,
      image_urls: images
    };
  }).filter(Boolean);
}

function parseLegacyContext(value) {
  if (typeof value !== "string" || value.length > 24000) return [];
  try {
    return cleanProperties(JSON.parse(value));
  } catch {
    return [];
  }
}

function chooseType(question) {
  if (/(آپارتمان|واحد مسکونی|سوئیت)/.test(question)) return "آپارتمان";
  if (/(خانه|ویلا)/.test(question)) return "خانه و ویلا";
  if (/(زمین)/.test(question)) return "زمین";
  if (/(مغازه|تجاری)/.test(question)) return "مغازه";
  if (/(دفتر کار|دفتر اداری|اداری)/.test(question)) return "دفتر کار";
  if (/(باغ)/.test(question)) return "باغ";
  return "";
}

function chooseTransaction(question) {
  if (question.includes("رهن کامل")) return "رهن کامل";
  if (/(رهن|اجاره|اجاری|مستاجر)/.test(question)) return "رهن و اجاره";
  if (/(فروش|فروشی|خرید|بخر|بفروش)/.test(question)) return "فروش";
  return "";
}

function parseMoneyConstraint(question) {
  const full = question.match(/(?:(تا|حداکثر|زیر|کمتر از|حداقل|بالای|بیشتر از|بودجه|قیمت|حدود)\s*)?(\d{7,})\s*تومان/);
  if (full) {
    const prefix = full[1] || "";
    return { value: Number(full[2]), mode: /(حداقل|بالای|بیشتر از)/.test(prefix) ? "min" : "max" };
  }
  const unit = question.match(/(?:(تا|حداکثر|زیر|کمتر از|حداقل|بالای|بیشتر از|بودجه|قیمت|حدود)\s*)?(\d+)\s*(میلیارد|میلیون)(?:\s*تومان)?/);
  if (!unit) return null;
  const prefix = unit[1] || "";
  const multiplier = unit[3] === "میلیارد" ? 1_000_000_000 : 1_000_000;
  return {
    value: Number(unit[2]) * multiplier,
    mode: /(حداقل|بالای|بیشتر از)/.test(prefix) ? "min" : "max"
  };
}

function parseAreaConstraint(question) {
  const match = question.match(/(?:(حداکثر|زیر|کمتر از|حداقل|بالای|بیشتر از|حدود)\s*)?(\d+)\s*(?:متر|متری)/);
  if (!match) return null;
  const prefix = match[1] || "";
  let mode = "near";
  if (/(حداکثر|زیر|کمتر از)/.test(prefix)) mode = "max";
  if (/(حداقل|بالای|بیشتر از)/.test(prefix)) mode = "min";
  return { value: Number(match[2]), mode };
}

function searchListings(message, properties) {
  const question = normalize(message);
  const type = chooseType(question);
  const transaction = chooseTransaction(question);
  const budget = parseMoneyConstraint(question);
  const area = parseAreaConstraint(question);
  const bedroomMatch = question.match(/(\d+)\s*(?:خوابه|خواب)/);
  const bedrooms = bedroomMatch ? Number(bedroomMatch[1]) : null;
  const cities = [...new Set(properties.map(p => p.city).filter(Boolean))];
  const city = cities.find(value => {
    const candidate = normalize(value);
    return candidate.length > 1 && question.includes(candidate);
  }) || "";

  const guidanceQuestion = /(چه نکاتی|چگونه|چطور|راهنمای|راهنما|مراحل|شرایط حقوقی|قرارداد)/.test(question);
  const explicitIntent =
    /(آگهی|نشان بده|نشانم بده|پیدا کن|جستجو|لیست|چه گزینه|چه ملکی|موجودی|دارید|دارین|میخوام|میخواهم|دنبال|نیاز دارم)/.test(question);
  const typeAndDealIntent = Boolean(type && transaction && !guidanceQuestion &&
    !/(حقوقی|قانون|دادخواست|شکایت|اظهارنامه)/.test(question));
  const listingIntent = explicitIntent || typeAndDealIntent;

  const filters = {
    type,
    transaction,
    city,
    budget: budget ? budget.value : null,
    budget_mode: budget ? budget.mode : null,
    area: area ? area.value : null,
    area_mode: area ? area.mode : null,
    bedrooms
  };

  if (!listingIntent || !properties.length) {
    return { listingIntent, matches: [], filters };
  }

  let candidates = properties.slice();

  if (type) {
    candidates = candidates.filter(p => normalize(p.property_type) === normalize(type));
  }

  if (transaction === "رهن و اجاره") {
    candidates = candidates.filter(p =>
      ["رهن و اجاره", "رهن کامل"].includes(p.transaction_type)
    );
  } else if (transaction) {
    candidates = candidates.filter(p =>
      normalize(p.transaction_type) === normalize(transaction)
    );
  }

  if (city) {
    candidates = candidates.filter(p => normalize(p.city) === normalize(city));
  }

  if (budget) {
    const monthlyRentBudget = transaction === "رهن و اجاره" && /(اجاره ماهانه|اجاره هر ماه)/.test(question);
    const budgetField = monthlyRentBudget ? "monthly_rent" :
      (transaction === "رهن و اجاره" || transaction === "رهن کامل" ? "deposit" : "price");
    candidates = candidates.filter(p => {
      const value = Number(p[budgetField]);
      if (!Number.isFinite(value) || value <= 0) return false;
      return budget.mode === "min" ? value >= budget.value : value <= budget.value;
    });
  }

  if (area) {
    candidates = candidates.filter(p => {
      const value = Number(p.area ?? p.building_area ?? p.land_area);
      if (!Number.isFinite(value) || value <= 0) return false;
      if (area.mode === "min") return value >= area.value;
      if (area.mode === "max") return value <= area.value;
      return value >= area.value * 0.85 && value <= area.value * 1.15;
    });
  }

  if (bedrooms !== null) {
    candidates = candidates.filter(p => Number(p.bedrooms) === bedrooms);
  }

  const ignored = new Set([
    "آگهی", "آگهیها", "نشان", "بده", "لطفا", "لطفاً", "برای", "چه", "کجا",
    "دارید", "دارین", "موجود", "میشه", "میخوام", "میخواهم", "جستجو", "پیدا",
    "کن", "کنید", "ملک", "املاک", "خرید", "فروش", "فروشی", "اجاره", "رهن",
    "بجنورد", "شیروان", "اسفراین", "فاروج", "متری", "متر", "تا", "حداکثر",
    "حداقل", "بودجه", "میلیارد", "میلیون", "خوابه", "خواب", "دنبال", "دارم"
  ]);
  const words = question.split(" ").filter(word => word.length >= 3 && !ignored.has(word));

  const ranked = candidates.map((property, index) => {
    const searchable = normalize([
      property.title,
      property.city,
      property.property_type,
      property.transaction_type,
      property.address,
      property.description
    ].join(" "));
    let score = 0;
    if (type && normalize(property.property_type) === normalize(type)) score += 8;
    if (transaction && (
      normalize(property.transaction_type) === normalize(transaction) ||
      (transaction === "رهن و اجاره" && property.transaction_type === "رهن کامل")
    )) score += 8;
    if (city && normalize(property.city) === normalize(city)) score += 6;
    if (budget) score += 5;
    if (area) score += 4;
    if (bedrooms !== null) score += 4;
    for (const word of words) {
      if (searchable.includes(word)) score += 1;
    }
    return { property, score, index };
  });

  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  return {
    listingIntent,
    matches: ranked.slice(0, 4).map(item => item.property),
    filters
  };
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(JSON.stringify({
        ok: true,
        model: "@cf/qwen/qwen3.8-27b",
        listings: true
      }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      });
    }

    const origin = request.headers.get("Origin") || "";
    if (!allowedOrigins.has(origin)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    if (request.method !== "POST") {
      return json({ error: "METHOD_NOT_ALLOWED" }, 405, origin);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const now = Date.now();
    const bucket = buckets.get(ip);

    if (bucket && now - bucket.start < 60000 && bucket.count >= 300) {
      return json({
        error: "RATE_LIMIT",
        message: "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره امتحان کنید."
      }, 429, origin);
    }

    if (!bucket || now - bucket.start >= 60000) {
      buckets.set(ip, { start: now, count: 1 });
    } else {
      bucket.count++;
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "INVALID_JSON" }, 400, origin);
    }

    const question = safeText(body?.message, 900);
    if (!question) {
      return json({ error: "EMPTY_MESSAGE" }, 400, origin);
    }

    const suppliedProperties = Array.isArray(body?.properties)
      ? body.properties
      : parseLegacyContext(body?.context);
    const properties = cleanProperties(suppliedProperties);
    const search = searchListings(question, properties);

    const history = Array.isArray(body?.history)
      ? body.history.slice(-8).map(item => ({
          role: item?.role === "assistant" ? "assistant" : "user",
          content: safeText(item?.content, 1200)
        })).filter(item => item.content)
      : [];

    let inventoryNote = "کاربر در این پیام درخواست جست‌وجوی آگهی نکرده است؛ آگهی مشخصی را خودسرانه معرفی نکن.";
    if (search.listingIntent && search.matches.length) {
      inventoryNote =
        "نتایج واقعی از فهرست آگهی‌های تأییدشده‌ای که سایت فرستاده است (فقط همین موارد را معرفی کن؛ قیمت‌ها بر حسب تومان هستند):\n" +
        JSON.stringify(search.matches);
    } else if (search.listingIntent) {
      inventoryNote =
        "در فهرست آگهی‌های تأییدشده‌ای که اکنون به دستیار رسیده، موردی با فیلترهای درخواستی پیدا نشد. وجود ملک را حدس نزن؛ صریح اعلام کن و در صورت لزوم شهر، بودجه یا نوع معامله را بپرس.";
    }

    const system = [
      "تو لیام هستی؛ دستیار هوشمند املاک ۰۵۸ در بجنورد. اگر کاربر نامت را پرسید، بگو «لیام». فقط به زبان فارسی روان، محترمانه و کاربردی پاسخ بده.",
      "در معرفی ملک، قیمت، متراژ، نشانی و ویژگی‌ها فقط به نتایج واقعی بخش اطلاعات آگهی‌ها تکیه کن. هیچ ملک، قیمت، شماره تماس، نشانی یا ویژگی‌ای را حدس نزن.",
      "در آگهی‌های رهن و اجاره، مبلغ ودیعه و اجاره ماهانه را فقط از اطلاعات همان آگهی اعلام کن؛ اگر ثبت نشده است، صریح بگو اعلام نشده است.",
      "نتایج فهرست‌شده صرفاً آگهی‌های تأییدشده ارسالی سایت هستند؛ تأیید آگهی به‌معنای تضمین موجود بودن ملک نیست. برای موجودی و بازدید، هماهنگی با مشاور لازم است.",
      "اگر نتیجه‌ای وجود ندارد، صریح بگو گزینه تأییدشده‌ای با فیلترهای فعلی پیدا نشد و یک سؤال روشن درباره بودجه، محله یا نوع ملک بپرس.",
      "برای پرسش عمومی درباره خرید، فروش، رهن، اجاره، قیمت‌گذاری و بازدید راهنمایی عملی بده. درباره امور حقوقی تخصصی یا تضمین نتیجه قضایی اظهارنظر قطعی نکن و کاربر را به بررسی موضوع با وکیل ارجاع بده.",
      "پاسخ را کوتاه، دقیق و معمولاً در ۲ تا ۶ جمله نگه دار.",
      inventoryNote
    ].join("\n");

    try {
      const result = await env.AI.run("@cf/qwen/qwen3.8-27b", {
        messages: [
          { role: "system", content: system },
          ...history,
          { role: "user", content: question }
        ],
        max_completion_tokens: 420,
        reasoning_effort: "low",
        chat_template_kwargs: { enable_thinking: false },
        temperature: 0.3,
        top_p: 0.8
      });

      const answer =
        typeof result?.choices?.[0]?.message?.content === "string"
          ? result.choices[0].message.content
          : typeof result?.response === "string"
            ? result.response
            : typeof result?.result?.response === "string"
              ? result.result.response
              : typeof result?.result?.choices?.[0]?.message?.content === "string"
                ? result.result.choices[0].message.content
                : "";

      if (!answer.trim()) {
        return json({
          error: "EMPTY_MODEL_RESPONSE",
          message: "پاسخ هوش مصنوعی دریافت نشد."
        }, 502, origin);
      }

      return json({
        answer: answer.trim(),
        matches: search.matches,
        model: "@cf/qwen/qwen3.8-27b"
      }, 200, origin);
    } catch (error) {
      console.error("Workers AI failure", error);
      return json({
        error: "MODEL_UNAVAILABLE",
        message: "سرویس هوش مصنوعی موقتاً در دسترس نیست."
      }, 502, origin);
    }
  }
};
