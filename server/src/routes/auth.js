const createSafeRouter = require("../utils/safeRouter");
const { User } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { permissionsFor } = require("../services/permissions");

const router = createSafeRouter();

async function userPayload(user) {
  return { username: user.username, role: user.role, permissions: await permissionsFor(user._id, user.role) };
}

/** GET /api/auth/usernames — populates the login page's searchable name picker. */
router.get("/usernames", async (req, res) => {
  const users = await User.find({}).sort({ username: 1 }).select("username").lean();
  res.json({ usernames: users.map((u) => u.username) });
});

/** POST /api/auth/login — { username, password } */
router.post("/login", async (req, res) => {
  const name = String(req.body.username || "").trim();
  const pw = String(req.body.password || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "Please enter your name." });

  const user = await User.findOne({ username: name });
  if (!user || user.password !== pw) {
    return res.status(401).json({ ok: false, error: "Incorrect name or password." });
  }

  req.session.username = user.username;
  req.session.role = user.role;
  req.session.userId = String(user._id);
  res.json({ ok: true, user: await userPayload(user) });
});

/**
 * POST /api/auth/bootstrap-admin — creates the first admin, only while the
 * Users collection is completely empty (otherwise always 409).
 */
router.post("/bootstrap-admin", async (req, res) => {
  if ((await User.countDocuments()) > 0) {
    return res.status(409).json({ ok: false, error: "Users already exist." });
  }
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "").trim();
  if (!username || !password) return res.status(400).json({ ok: false, error: "username and password are required." });
  await User.create({ username, password, role: "admin" });
  res.json({ ok: true, message: `Admin user '${username}' created.` });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("rebar.sid");
    res.json({ ok: true });
  });
});

/** GET /api/auth/me — lets the client restore auth state on load/refresh. */
router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findOne({ username: req.session.username }).lean();
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  req.session.userId = String(user._id);
  res.json({ ok: true, user: await userPayload(user) });
});

module.exports = router;
