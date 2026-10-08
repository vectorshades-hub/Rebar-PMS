const mongoose = require("mongoose");

// One row per non-GET API request (who changed what, and whether it worked). Auto-expires after 90 days.
const requestLogSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now, index: true, expires: 60 * 60 * 24 * 90 },
  username: { type: String, default: "", index: true },
  role: { type: String, default: "" },
  method: { type: String, required: true },
  path: { type: String, required: true },
  status: { type: Number, default: 0 },
  ip: { type: String, default: "" },
  durationMs: { type: Number, default: 0 },
  body: { type: String, default: "" }, // sanitised + truncated JSON
});

module.exports = mongoose.model("RequestLog", requestLogSchema);
