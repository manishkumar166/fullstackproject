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

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
// Bind to IPv6 any-address by default so Windows `localhost` (often ::1) works.
// Node will typically accept IPv4-mapped connections as well.
const host = process.env.HOST || "::";
app.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${port}`);
  console.log(`IPv4 loopback: http://127.0.0.1:${port}`);
  console.log(`Bind: http://${host}:${port} (use your PC's LAN IP on other devices)`);
});

