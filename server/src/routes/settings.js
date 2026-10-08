const createSafeRouter = require("../utils/safeRouter");
const { User, Settings } = require("../models");
const { requireRole } = require("../middleware/auth");
const { getSettings } = require("../services/settingsService");

const router = createSafeRouter();

// body key -> Settings field
const FIELDS = {
  invoice_release_editors: "invoiceReleaseEditors",
  record_updaters: "recordUpdaters",
  record_deleters: "recordDeleters",
  completed_log_editors: "completedLogEditors",
};

async function payload() {
  const [settings, users] = await Promise.all([getSettings(), User.find({}).sort({ username: 1 }).select("username role").lean()]);
  const nameById = new Map(users.map((u) => [String(u._id), u.username]));
  const toNames = (ids) => (ids || []).map((id) => nameById.get(String(id))).filter(Boolean);
  const out = { users: users.map((u) => ({ username: u.username, role: u.role })) };
  for (const [key, field] of Object.entries(FIELDS)) out[key] = toNames(settings[field]);
  return out;
}

/** GET /api/settings — admin only; feeds the Settings page. */
router.get("/", requireRole("admin"), async (req, res) => {
  res.json(await payload());
});

/**
 * POST /api/settings — admin only. Each list is optional and independent (the
 * page saves one card at a time); only the keys present in the body change.
 * The page works in usernames; they are stored as User _ids.
 */
router.post("/", requireRole("admin"), async (req, res) => {
  const update = {};
  for (const [key, field] of Object.entries(FIELDS)) {
    if (!Array.isArray(req.body[key])) continue;
    const names = [...new Set(req.body[key].map((u) => String(u || "").trim()).filter(Boolean))];
    const found = names.length ? await User.find({ username: { $in: names } }).select("_id").lean() : [];
    update[field] = found.map((u) => u._id);
  }
  await Settings.findByIdAndUpdate("app", update, { upsert: true, new: true });
  res.json({ ok: true, ...(await payload()) });
});

module.exports = router;
