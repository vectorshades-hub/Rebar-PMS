const RequestLog = require("../models/RequestLog");

const SKIP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const REDACT = /pass|token|secret|data_url/i;
const MAX_BODY = 2000;

function sanitize(body) {
  if (!body || typeof body !== "object" || !Object.keys(body).length) return "";
  const clean = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, REDACT.test(k) ? "***" : v]));
  const json = JSON.stringify(clean);
  return json.length > MAX_BODY ? json.slice(0, MAX_BODY) + "…" : json;
}

/** Logs every non-GET request (after the response is sent, so it never slows or breaks the request). */
function requestLogger(req, res, next) {
  if (SKIP_METHODS.has(req.method)) return next();
  const started = Date.now();
  const before = req.session ? { username: req.session.username, role: req.session.role } : {};
  res.on("finish", () => {
    // Login sets the session during the request; logout clears it — so use whichever side has a user.
    const username = before.username || (req.session && req.session.username) || String(req.body?.username || "");
    RequestLog.create({
      username,
      role: before.role || (req.session && req.session.role) || "",
      method: req.method,
      path: req.originalUrl.slice(0, 500),
      status: res.statusCode,
      ip: req.ip || "",
      durationMs: Date.now() - started,
      body: sanitize(req.body),
    }).catch((err) => console.error("[REQUEST LOG]", err.message));
  });
  next();
}

module.exports = requestLogger;
