const els = {
  statusPill: document.getElementById("statusPill"),
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),

  fromLang: document.getElementById("fromLang"),
  toLang: document.getElementById("toLang"),
  region: document.getElementById("region"),
  tags: document.getElementById("tags"),
  tagHint: document.getElementById("tagHint"),

  inputText: document.getElementById("inputText"),
  outputText: document.getElementById("outputText"),
  outputMeta: document.getElementById("outputMeta"),

  translateBtn: document.getElementById("translateBtn"),
  swapBtn: document.getElementById("swapBtn"),
  clearBtn: document.getElementById("clearBtn"),

  micBtn: document.getElementById("micBtn"),
  micNote: document.getElementById("micNote"),
  meterBar: document.getElementById("meterBar"),

  pasteBtn: document.getElementById("pasteBtn"),
  copyBtn: document.getElementById("copyBtn"),
  speakBtn: document.getElementById("speakBtn")
};

// If you open `public/index.html` with VS Code Live Server, the page origin
// becomes something like http://127.0.0.1:5500 (static-only).
// Our backend APIs live on the Node server (default http://localhost:3000).
const API_BASE =
  window.API_BASE ||
  (location.port === "5500" || location.port === "5501"
    ? "http://localhost:3000"
    : "");

function setStatus(state, text) {
  els.statusText.textContent = text;
  els.statusDot.classList.remove("good", "bad");
  if (state === "good") els.statusDot.classList.add("good");
  if (state === "bad") els.statusDot.classList.add("bad");
}

function uniq(arr) {
  return [...new Set(arr)];
}

function parseTags(raw) {
  return uniq(
    (raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function toHumanPair(from, to) {
  return `${from.toUpperCase()} → ${to.toUpperCase()}`;
}

async function fetchJSON(url, opts) {
  const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
  const res = await fetch(fullUrl, opts);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

function buildLanguageOptions(languagePairs) {
  const langs = uniq(
    languagePairs.flatMap((p) => [p.from, p.to]).map((x) => x.toLowerCase())
  ).sort();

  const labelMap = {
    en: "English",
    es: "Spanish",
    fr: "French",
    hi: "Hindi"
  };

  for (const select of [els.fromLang, els.toLang]) {
    select.innerHTML = "";
    for (const l of langs) {
      const opt = document.createElement("option");
      opt.value = l;
      opt.textContent = labelMap[l] ? `${labelMap[l]} (${l})` : l.toUpperCase();
      select.appendChild(opt);
    }
  }
}

function buildRegionOptions(regions) {
  els.region.innerHTML = "";
  for (const r of regions) {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.label;
    els.region.appendChild(opt);
  }
}

let config = null;

async function boot() {
  try {
    setStatus("warn", "Loading config…");
    config = await fetchJSON("/api/config");
    buildLanguageOptions(config.languagePairs);
    buildRegionOptions(config.regions);
    els.tagHint.textContent = `Suggestions: ${config.tagSuggestions.join(", ")}`;

    // Defaults
    els.fromLang.value = "en";
    els.toLang.value = "es";
    els.region.value = "global";

    setStatus("good", "Ready");
  } catch (e) {
    setStatus("bad", "Backend offline");
    els.tagHint.textContent =
      "Start the Node server, then refresh this page.";
  }
}

function showResult(result, request) {
  els.outputText.textContent = result.translation || "";
  const bits = [
    `Pair: ${toHumanPair(request.from, request.to)}`,
    `Region: ${request.region}`,
    request.tags?.length ? `Tags: ${request.tags.join(", ")}` : null,
    result.provider ? `Provider: ${result.provider}` : null,
    result.meta?.note ? `Note: ${result.meta.note}` : null
  ].filter(Boolean);
  els.outputMeta.textContent = bits.join(" • ");
}

async function translateNow() {
  const payload = {
    text: els.inputText.value,
    from: els.fromLang.value,
    to: els.toLang.value,
    region: els.region.value,
    tags: parseTags(els.tags.value),
    mode: "auto"
  };

  try {
    if (!payload.text || !payload.text.trim()) {
      setStatus("bad", "Enter some text");
      els.outputText.textContent = "Error: Please enter text to translate.";
      els.outputMeta.textContent = "";
      return;
    }
    setStatus("warn", "Translating…");
    const res = await fetchJSON("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    showResult(res, payload);
    setStatus("good", "Ready");
  } catch (e) {
    setStatus("bad", e.message || "Translation failed");
    els.outputText.textContent = `Error: ${e.message || "Translation failed"}`;
    els.outputMeta.textContent = "";
  }
}

els.translateBtn.addEventListener("click", translateNow);

els.swapBtn.addEventListener("click", () => {
  const a = els.fromLang.value;
  els.fromLang.value = els.toLang.value;
  els.toLang.value = a;
});

els.clearBtn.addEventListener("click", () => {
  els.inputText.value = "";
  els.outputText.textContent = "";
  els.outputMeta.textContent = "";
});

els.pasteBtn.addEventListener("click", async () => {
  try {
    const txt = await navigator.clipboard.readText();
    if (txt) els.inputText.value = txt;
  } catch {
    // ignore
  }
});

els.copyBtn.addEventListener("click", async () => {
  const txt = els.outputText.textContent || "";
  if (!txt) return;
  try {
    await navigator.clipboard.writeText(txt);
    setStatus("good", "Copied");
    setTimeout(() => setStatus("good", "Ready"), 700);
  } catch {
    // ignore
  }
});

els.speakBtn.addEventListener("click", () => {
  const txt = els.outputText.textContent || "";
  if (!txt || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(txt);
  u.lang = (els.toLang.value || "en").toLowerCase();
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
});

// Speech-to-text (browser feature)
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

let rec = null;
let micOn = false;
let meterTimer = null;

function stopMeter() {
  if (meterTimer) window.clearInterval(meterTimer);
  meterTimer = null;
  els.meterBar.style.width = "0%";
}

function startMeter() {
  stopMeter();
  meterTimer = window.setInterval(() => {
    // Fake meter (Web Speech API doesn't expose volume consistently)
    const w = micOn ? 30 + Math.random() * 60 : 0;
    els.meterBar.style.width = `${Math.round(w)}%`;
  }, 140);
}

function setMicState(on, note) {
  micOn = on;
  els.micBtn.textContent = on ? "Stop mic" : "Start mic";
  els.micNote.textContent = note || "";
  if (on) startMeter();
  else stopMeter();
}

function initMic() {
  if (!SpeechRecognition) {
    els.micBtn.disabled = true;
    els.micNote.textContent =
      "Speech-to-text not supported in this browser (try Chrome/Edge).";
    return;
  }

  rec = new SpeechRecognition();
  rec.interimResults = true;
  rec.continuous = true;

  rec.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    if (transcript.trim()) els.inputText.value = transcript.trim();
  };

  rec.onerror = (e) => {
    setMicState(false, `Mic error: ${e.error || "unknown"}`);
  };

  rec.onend = () => {
    if (micOn) {
      setMicState(false, "Mic stopped.");
    }
  };

  els.micBtn.addEventListener("click", () => {
    if (!rec) return;
    if (!micOn) {
      try {
        rec.lang = (els.fromLang.value || "en").toLowerCase();
        rec.start();
        setMicState(true, "Listening… speak clearly.");
      } catch (e) {
        setMicState(false, "Unable to start mic.");
      }
    } else {
      rec.stop();
      setMicState(false, "Mic stopped.");
    }
  });
}

boot();
initMic();

