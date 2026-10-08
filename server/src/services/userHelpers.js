const { User } = require("../models");

/** Team-lead/management usernames — used to populate team pickers. */
async function getTeamsFromUsers() {
  const rows = await User.find({ role: { $in: ["team_lead", "management"] } }).sort({ username: 1 }).select("username").lean();
  return rows.map((r) => r.username);
}

async function getLinkedTls(username) {
  const u = await User.findOne({ username }).select("linkedTls").lean();
  return u ? u.linkedTls || [] : [];
}

/**
 * Teams a management user is limited to — null means unrestricted (no team leads linked).
 * Also what `loadRecords` scopes by, so add/edit/delete checks stay consistent with visibility.
 */
async function getManagementScope(username) {
  const linked = await getLinkedTls(username);
  return linked.length ? linked : null;
}

module.exports = { getTeamsFromUsers, getLinkedTls, getManagementScope };
