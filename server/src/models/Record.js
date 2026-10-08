const mongoose = require("mongoose");

const recordSchema = new mongoose.Schema({
  legacyId: { type: Number, required: true, unique: true, index: true },
  project: { type: String, required: true },
  submissionName: { type: String, required: true },
  unplanned: { type: Boolean, default: false },
  client: { type: String, required: true },
  submissionType: {
    type: String,
    required: true,
    enum: ["OFA", "FIELD USE", "REAPPROVAL", "BAR LISTING"],
  },
  invoiceReleased: { type: Boolean, default: false }, // only admin / Settings-listed users may change
  billable: { type: String, enum: ["", "CO", "PO", "Non Billable"], default: "" },
  tonnage: { type: Number, default: 0, min: 0 }, // steel tonnage
  team: { type: String, required: true, index: true },
  subDate: { type: Date, default: null },
  dueDate: { type: Date, default: null },
  remarks: { type: String, default: "" },
  status: { type: String, default: "" }, // raw stored status ("COMPLETED...", "ON HOLD", or blank = auto)
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
  createdBy: { type: String, default: "", index: true },
});

recordSchema.index({ project: 1 });
recordSchema.index({ status: 1 });

module.exports = mongoose.model("Record", recordSchema);
