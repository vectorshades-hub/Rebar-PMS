const createSafeRouter = require("../utils/safeRouter");
const { User } = require("../models");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = createSafeRouter();
const ROLES = ["admin", "management", "team_lead", "user", "finance"];

function toRow(u) {
  return { id: String(u._id), username: u.username, password: u.password, role: u.role, linked_tls: u.linkedTls || [] };
}

/** GET /api/users — admin sees everything; other roles only get the usernames/roles (no passwords). */
router.get("/", requireAuth, async (req, res) => {
  const users = await User.find({}).sort({ username: 1 }).lean();
  if (req.session.role === "admin") return res.json({ users: users.map(toRow) });
  res.json({ users: users.map((u) => ({ id: String(u._id), username: u.username, role: u.role })) });
});

/** POST /api/users — admin only. Password is stored as plain text (project decision). */
router.post("/", requireRole("admin"), async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "").trim();
  const role = String(req.body.role || "user");
  const linkedTls = Array.isArray(req.body.linked_tls) ? req.body.linked_tls.map(String) : [];
  if (!username || !password) return res.status(400).json({ ok: false, error: "Username and password are required." });
  if (!ROLES.includes(role)) return res.status(400).json({ ok: false, error: "Invalid role." });
  if (await User.exists({ username })) return res.status(409).json({ ok: false, error: "That username already exists." });
  const u = await User.create({ username, password, role, linkedTls: ["user", "management"].includes(role) ? linkedTls : [] });
  res.json({ ok: true, message: `User '${username}' created.`, user: toRow(u) });
});

/** PUT /api/users/:id — admin only. Blank password = keep the current one. */
router.put("/:id", requireRole("admin"), async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ ok: false, error: "User not found." });
  const username = String(req.body.username ?? u.username).trim();
  const role = String(req.body.role ?? u.role);
  if (!username) return res.status(400).json({ ok: false, error: "Username is required." });
  if (!ROLES.includes(role)) return res.status(400).json({ ok: false, error: "Invalid role." });
  if (username !== u.username && (await User.exists({ username }))) {
    return res.status(409).json({ ok: false, error: "That username already exists." });
  }
  if (u.username === req.session.username && role !== "admin") {
    return res.status(400).json({ ok: false, error: "You can't remove your own admin role." });
  }
  const password = String(req.body.password || "").trim();
  const wasSelf = u.username === req.session.username;
  u.username = username;
  u.role = role;
  if (password) u.password = password;
  if (Array.isArray(req.body.linked_tls)) u.linkedTls = ["user", "management"].includes(role) ? req.body.linked_tls.map(String) : [];
  await u.save();
  if (wasSelf) req.session.username = u.username;
  res.json({ ok: true, message: `User '${u.username}' updated.` });
});

/** DELETE /api/users/:id — admin only, never yourself. */
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ ok: false, error: "User not found." });
  if (u.username === req.session.username) return res.status(400).json({ ok: false, error: "You can't delete your own account." });
  await u.deleteOne();
  res.json({ ok: true, message: `User '${u.username}' deleted.` });
});

module.exports = router;
