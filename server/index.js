const { app } = require("./app");

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
// Cloud hosts typically require binding to 0.0.0.0 (all interfaces).
// You can override with HOST if needed.
const host = process.env.HOST || "0.0.0.0";
app.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${port}`);
  console.log(`IPv4 loopback: http://127.0.0.1:${port}`);
  console.log(`Bind: http://${host}:${port} (use your PC's LAN IP on other devices)`);
});

