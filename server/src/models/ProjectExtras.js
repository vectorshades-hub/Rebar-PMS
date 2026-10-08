const mongoose = require("mongoose");

const CO_STATUSES = ["pending", "sent_finance", "finance_approved"];
const CO_TYPES = ["CO", "PO"];
const RFI_TYPES = ["RFI", "Clarification", "BFA Clarification", "Field Verification", "GC to Verify", "Other"];

// Change order / purchase order raised against a project. Submissions are linked by their legacyId.
const ChangeOrder = mongoose.model(
  "ChangeOrder",
  new mongoose.Schema({
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    kind: { type: String, enum: CO_TYPES, default: "CO" },
    coNumber: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    change: { type: String, required: true, trim: true },
    notes: { type: String, default: "" },
    linkedSubmissions: { type: [Number], default: [] },
    tonnage: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "USD" },
    ratePerTon: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: CO_STATUSES, default: "pending" },
    // Management dashboard: "" = not set. "yes" moves a CO to sent_finance (once all its submissions are done).
    invoiceReleased: { type: String, enum: ["", "yes", "no"], default: "" },
    invoiceReleasedBy: { type: String, default: "" },
    invoiceReleasedAt: { type: Date, default: null },
    acknowledgedBy: { type: String, default: "" },
    acknowledgedAt: { type: Date, default: null },
    createdBy: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  })
);

const questionSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  response: { type: String, default: "" },
  responseDate: { type: Date, default: null }, // set once the response is received
});

// RFI / Clarification request; each question tracks its own response date.
const Rfi = mongoose.model(
  "Rfi",
  new mongoose.Schema({
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    type: { type: String, enum: RFI_TYPES, default: "RFI" },
    rfiNumber: { type: String, default: "", trim: true },
    title: { type: String, required: true, trim: true },
    questions: { type: [questionSchema], default: [] },
    linkedSubmissions: { type: [Number], default: [] },
    date: { type: Date, required: true },
    expectedResponseDate: { type: Date, required: true },
    createdBy: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  })
);

// Project cover image, kept out of Project so list queries never load the bytes.
const ProjectImage = mongoose.model(
  "ProjectImage",
  new mongoose.Schema({
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, unique: true },
    filename: { type: String, default: "" },
    contentType: { type: String, required: true },
    data: { type: Buffer, required: true },
    updatedAt: { type: Date, default: Date.now },
  })
);

module.exports = { ChangeOrder, Rfi, ProjectImage, CO_STATUSES, CO_TYPES, RFI_TYPES };
