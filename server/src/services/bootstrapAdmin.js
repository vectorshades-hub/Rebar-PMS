const { User } = require("../models");

/** The only auto-created data: a default admin, and only while the Users collection is empty. */
async function ensureDefaultAdmin() {
  if ((await User.countDocuments()) > 0) return;
  await User.create({ username: "admin", password: "admin123", role: "admin" });
  console.log("[BOOTSTRAP] No users found — created default admin 'admin' / 'admin123'. Change the password after first login.");
}

module.exports = { ensureDefaultAdmin };
