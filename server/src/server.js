const env = require("./config/env");
const { connectDB } = require("./config/db");
const { ensureDefaultAdmin } = require("./services/bootstrapAdmin");
const app = require("./app");

async function main() {
  await connectDB();
  await ensureDefaultAdmin();
  app.listen(env.port, "0.0.0.0", () => {
    console.log(`[SERVER] Rebar PMS API listening on http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  console.error("[FATAL] Could not start server:", err.message);
  process.exit(1);
});
