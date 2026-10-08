// RBAC. Static, role-based actions live in ROLES; edit / delete / invoice-released
// are per-user (granted on the admin Settings page) and resolved in permissionsFor().
// The server is the authority; the client mirrors this only to hide buttons.
const settingsService = require("./settingsService");

const ROLES = {
  admin: { addRecords: true, manageUsers: true, manageProjects: true, deleteProjects: true },
  management: { addRecords: true, manageUsers: false, manageProjects: true, deleteProjects: true },
  team_lead: { addRecords: true, manageUsers: false, manageProjects: true, deleteProjects: false },
  user: { addRecords: false, manageUsers: false, manageProjects: false, deleteProjects: false },
  finance: { addRecords: false, manageUsers: false, manageProjects: false, deleteProjects: false }, // Finance dashboard only
};

function can(role, action) {
  return !!(ROLES[role] && ROLES[role][action]);
}

/** Everything the client needs to show/hide controls for this user. */
async function permissionsFor(userId, role) {
  return {
    ...(ROLES[role] || ROLES.user),
    editRecords: await settingsService.canUpdateRecords(userId, role),
    deleteRecords: await settingsService.canDeleteRecords(userId, role),
    editInvoiceReleased: await settingsService.canEditInvoiceReleased(userId, role),
    editCompletedLog: await settingsService.canEditCompletedLog(userId, role),
    viewFinance: ["admin", "finance"].includes(role),
  };
}

module.exports = { can, permissionsFor };
