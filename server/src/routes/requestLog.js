const createSafeRouter = require("../utils/safeRouter");
const RequestLog = require("../models/RequestLog");
const { requireRole } = require("../middleware/auth");

const router = createSafeRouter();
const PAGE_SIZE = 50;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** GET /api/request-log — admin only. Filters: search, method, outcome (ok|error), user, date_from, date_to, page. */
router.get("/", requireRole("admin"), async (req, res) => {
  const q = req.query;
  const filter = {};
  if (["POST", "PUT", "PATCH", "DELETE"].includes(q.method)) filter.method = q.method;
  if (q.outcome === "ok") filter.status = { $lt: 400 };
  if (q.outcome === "error") filter.status = { $gte: 400 };
  if (q.user) filter.username = String(q.user);
  if (q.date_from || q.date_to) {
    filter.at = {};
    if (q.date_from) filter.at.$gte = new Date(`${q.date_from}T00:00:00`);
    if (q.date_to) filter.at.$lte = new Date(`${q.date_to}T23:59:59.999`);
  }
  const search = String(q.search || "").trim();
  if (search) {
    const re = new RegExp(escapeRe(search), "i");
    filter.$or = [{ path: re }, { username: re }, { body: re }];
  }

  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const [total, rows, users] = await Promise.all([
    RequestLog.countDocuments(filter),
    RequestLog.find(filter).sort({ at: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    RequestLog.distinct("username"),
  ]);
  res.json({
    ok: true,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    users: users.filter(Boolean).sort((a, b) => a.localeCompare(b)),
    items: rows.map((r) => ({
      id: String(r._id),
      at: r.at.toISOString(),
      username: r.username,
      role: r.role,
      method: r.method,
      path: r.path,
      status: r.status,
      ip: r.ip,
      duration_ms: r.durationMs,
      body: r.body,
    })),
  });
});

module.exports = router;
