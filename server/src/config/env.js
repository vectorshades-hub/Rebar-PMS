require("dotenv").config();

module.exports = {
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/rebar_db",
  port: parseInt(process.env.PORT || "8006", 10),
  sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-me",

  completedDaysGrace: parseInt(process.env.COMPLETED_DAYS_GRACE || "5", 10),
  completedDaysGraceExtended: parseInt(process.env.COMPLETED_DAYS_GRACE_EXTENDED || "15", 10),
  dueSoonDays: parseInt(process.env.DUE_SOON_DAYS || "3", 10),

  billableTypes: ["CO", "PO", "Non Billable"],
  submissionTypes: ["OFA", "FIELD USE", "REAPPROVAL", "BAR LISTING"],
};
