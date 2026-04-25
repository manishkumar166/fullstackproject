const express = require("express");
const cors = require("cors");
const path = require("path");

const { loadDataset, translateText } = require("./lib/translator");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", (_req, res) => {
  const dataset = loadDataset();
  res.json({
    ok: true,
    regions: dataset.regions,
    languagePairs: dataset.languagePairs,
    tagSuggestions: ["idiom", "slang", "informal", "neutral", "regional", "theatre"]
  });
});

app.post("/api/translate", async (req, res) => {
  const { text, from, to, region, tags, mode } = req.body ?? {};

  if (!from || !to) {
    return res.status(400).json({
      ok: false,
      error: "Missing required fields: from, to"
    });
  }

  try {
    const result = await translateText({
      text,
      from,
      to,
      region: region || "global",
      tags: Array.isArray(tags) ? tags : [],
      mode: mode || "auto"
    });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "Translation failed",
      detail: e?.message || String(e)
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

module.exports = { app };

