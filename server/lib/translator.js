const fs = require("fs");
const path = require("path");

function normalize(s) {
  return (s ?? "")
    .toString()
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadDataset() {
  const p = path.join(__dirname, "..", "data", "idioms.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

// Lightweight base “translator” so the app works offline.
// For real production translation, swap this module to call an LLM/translation API.
const BASE_DICTIONARY = {
  "en->es": {
    hello: "hola",
    "good morning": "buenos días",
    "good night": "buenas noches",
    please: "por favor",
    thanks: "gracias",
    "thank you": "gracias",
    sorry: "lo siento",
    yes: "sí",
    no: "no",
    where: "dónde",
    bathroom: "baño",
    "how are you": "¿cómo estás?"
  },
  "es->en": {
    hola: "hello",
    "buenos días": "good morning",
    "buenas noches": "good night",
    "por favor": "please",
    gracias: "thanks",
    "lo siento": "sorry",
    sí: "yes",
    no: "no",
    dónde: "where",
    "¿cómo estás?": "how are you?"
  },
  "en->fr": {
    hello: "bonjour",
    "good morning": "bonjour",
    "good night": "bonne nuit",
    please: "s'il vous plaît",
    thanks: "merci",
    "thank you": "merci",
    sorry: "désolé",
    yes: "oui",
    no: "non",
    where: "où",
    bathroom: "toilettes",
    "how are you": "comment ça va ?"
  },
  "fr->en": {
    bonjour: "hello",
    "bonne nuit": "good night",
    "s'il vous plaît": "please",
    merci: "thanks",
    désolé: "sorry",
    oui: "yes",
    non: "no",
    où: "where",
    toilettes: "bathroom",
    "comment ça va ?": "how are you?"
  },
  "en->hi": {
    hello: "नमस्ते",
    "good morning": "सुप्रभात",
    "good night": "शुभ रात्रि",
    please: "कृपया",
    thanks: "धन्यवाद",
    "thank you": "धन्यवाद",
    sorry: "माफ़ कीजिए",
    yes: "हाँ",
    no: "नहीं",
    where: "कहाँ",
    bathroom: "शौचालय",
    "how are you": "आप कैसे हैं?"
  },
  "hi->en": {
    "नमस्ते": "hello",
    "सुप्रभात": "good morning",
    "शुभ रात्रि": "good night",
    "कृपया": "please",
    "धन्यवाद": "thanks",
    "माफ़ कीजिए": "sorry",
    "हाँ": "yes",
    "नहीं": "no",
    "कहाँ": "where",
    "शौचालय": "bathroom",
    "आप कैसे हैं?": "how are you?"
  }
};

function applyIdioms(text, { from, to, region, tags }, dataset) {
  const normText = normalize(text);
  const tagSet =
    tags && Array.isArray(tags) && tags.length
      ? new Set(tags.map((t) => normalize(t)))
      : null;

  // Prefer: exact region matches first, then global.
  const candidates = dataset.idioms
    .filter((i) => i.from === from && i.to === to)
    .filter((i) => i.region === region || i.region === "global")
    .filter((i) => {
      if (!tagSet) return true;
      const idiomTags = (i.tags ?? []).map((t) => normalize(t));
      return idiomTags.some((t) => tagSet.has(t));
    })
    .sort((a, b) => {
      if (a.region === region && b.region !== region) return -1;
      if (b.region === region && a.region !== region) return 1;
      return (b.source?.length ?? 0) - (a.source?.length ?? 0);
    });

  let out = text;
  for (const idiom of candidates) {
    const src = idiom.source;
    if (!src) continue;
    const srcNorm = normalize(src);
    if (!srcNorm) continue;

    // Replace phrase occurrences case-insensitively on word boundaries where possible.
    const re = new RegExp(`\\b${escapeRegExp(src)}\\b`, "gi");
    if (re.test(out)) {
      out = out.replace(re, idiom.target);
      continue;
    }

    // Fallback for punctuation/quotes variations.
    if (normText.includes(srcNorm)) {
      const re2 = new RegExp(escapeRegExp(src), "gi");
      out = out.replace(re2, idiom.target);
    }
  }
  return out;
}

function applyBaseDictionary(text, { from, to }) {
  const key = `${from}->${to}`;
  const dict = BASE_DICTIONARY[key];
  if (!dict) return null;

  const norm = normalize(text);
  if (!norm) return "";

  // Exact phrase first
  if (dict[norm]) return dict[norm];

  // Token-level fallback: keep unknown words as-is
  const words = norm.split(" ");
  let hits = 0;
  const mapped = words.map((w) => {
    const v = dict[w];
    if (v) {
      hits += 1;
      return v;
    }
    return w;
  });

  // If we translated nothing, signal "no offline match" so online provider can run.
  if (hits === 0) return null;

  return mapped.join(" ");
}

function translateOffline({
  text,
  from,
  to,
  region = "global",
  tags = [],
  mode = "auto"
}) {
  const dataset = loadDataset();

  const cleanText = (text ?? "").toString();
  if (!cleanText.trim()) {
    return {
      ok: true,
      translation: "",
      provider: "offline",
      appliedIdioms: [],
      meta: { from, to, region, mode }
    };
  }

  const withIdioms = applyIdioms(cleanText, { from, to, region, tags }, dataset);
  const base = applyBaseDictionary(withIdioms, { from, to });

  // If we can’t do base translation for the pair, return the idiom-applied text.
  // This still demonstrates regional phrase support and filtering.
  const translation = base ?? withIdioms;

  return {
    ok: true,
    translation,
    provider: "offline",
    meta: {
      from,
      to,
      region,
      mode,
      note:
        base === null
          ? "No offline dictionary for this language pair; returned idiom-adjusted text."
          : undefined
    }
  };
}

async function translateLibreTranslate({ text, from, to }) {
  // Only try LibreTranslate if the user explicitly configured an instance,
  // or if the community instance is reachable.
  const instances = [process.env.LT_URL, "https://translate.astian.org"].filter(
    Boolean
  );

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 6500);

  try {
    for (const baseUrl of instances) {
      const url = `${baseUrl.replace(/\/$/, "")}/translate`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q: text,
            source: from || "auto",
            target: to,
            format: "text"
          }),
          signal: controller.signal
        });

        if (!res.ok) continue;
        const data = await res.json().catch(() => null);
        const translatedText = data?.translatedText;
        if (typeof translatedText === "string") {
          return { ok: true, translation: translatedText, provider: "libretranslate" };
        }
      } catch {
        // try next instance
      }
    }
    return { ok: false, error: "No LibreTranslate instance reachable." };
  } finally {
    clearTimeout(t);
  }
}

async function translateMyMemory({ text, from, to }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 6500);

  try {
    const url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text) +
      "&langpair=" +
      encodeURIComponent(`${from}|${to}`);

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { ok: false, error: `MyMemory HTTP ${res.status}` };
    const data = await res.json().catch(() => null);
    const translatedText = data?.responseData?.translatedText;
    if (typeof translatedText === "string") {
      return { ok: true, translation: translatedText, provider: "mymemory" };
    }
    return { ok: false, error: "MyMemory returned no translation." };
  } catch (e) {
    return { ok: false, error: e?.message || "MyMemory request failed." };
  } finally {
    clearTimeout(t);
  }
}

async function translateText({
  text,
  from,
  to,
  region = "global",
  tags = [],
  mode = "auto"
}) {
  const offline = translateOffline({ text, from, to, region, tags, mode });

  // If offline dictionary handled it (no note), keep it fast/offline.
  const needsOnline =
    mode === "online" ||
    (mode !== "offline" && offline.meta?.note && (text ?? "").toString().trim());

  if (!needsOnline) return offline;

  const sourceText = offline.translation; // idiom-adjusted text first

  const lt = await translateLibreTranslate({ text: sourceText, from, to });
  if (lt.ok) return { ok: true, translation: lt.translation, provider: lt.provider, meta: { from, to, region, mode } };

  const mm = await translateMyMemory({ text: sourceText, from, to });
  if (mm.ok) return { ok: true, translation: mm.translation, provider: mm.provider, meta: { from, to, region, mode } };

  return {
    ...offline,
    meta: {
      ...offline.meta,
      note: offline.meta?.note
        ? `${offline.meta.note} (Online provider unavailable: ${lt.error})`
        : `Online provider unavailable: ${lt.error}`
    }
  };
}

module.exports = {
  loadDataset,
  translateOffline,
  translateText
};

