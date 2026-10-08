const Settings = require("../models/Settings");

async function getSettings() {
  return (await Settings.findById("app").lean()) || { recordUpdaters: [], recordDeleters: [], invoiceReleaseEditors: [], completedLogEditors: [] };
}

const inList = (list, userId) => !!userId && (list || []).some((id) => String(id) === String(userId));

// Admins are always allowed; everyone else only if the admin listed them in Settings.
async function canUpdateRecords(userId, role) {
  return role === "admin" || inList((await getSettings()).recordUpdaters, userId);
}
async function canDeleteRecords(userId, role) {
  return role === "admin" || inList((await getSettings()).recordDeleters, userId);
}
async function canEditInvoiceReleased(userId, role) {
  return role === "admin" || inList((await getSettings()).invoiceReleaseEditors, userId);
}

async function canEditCompletedLog(userId, role) {
  return role === "admin" || inList((await getSettings()).completedLogEditors, userId);
}

module.exports = { getSettings, canUpdateRecords, canDeleteRecords, canEditInvoiceReleased, canEditCompletedLog };
