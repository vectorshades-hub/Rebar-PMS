const mongoose = require("mongoose");

// Single document (_id "app"). Lists hold User _ids (not usernames) so a later
// username rename can't silently drop someone's permission. Admins are always
// allowed regardless of these lists.
const ids = { type: [mongoose.Schema.Types.ObjectId], default: [] };

module.exports = mongoose.model(
  "Settings",
  new mongoose.Schema({
    _id: { type: String, default: "app" },
    recordUpdaters: ids, // who can edit records
    recordDeleters: ids, // who can delete records
    invoiceReleaseEditors: ids, // who can change "Invoice Released"
    completedLogEditors: ids, // who can edit completed submissions from the Completed Log
  })
);
