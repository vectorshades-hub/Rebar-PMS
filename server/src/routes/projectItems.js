const mongoose = require("mongoose");
const createSafeRouter = require("../utils/safeRouter");
const { Project, Record, ChangeOrder, Rfi, ProjectImage } = require("../models");
const { CO_STATUSES, CO_TYPES, RFI_TYPES } = require("../models/ProjectExtras");
const statusEngine = require("../services/statusEngine");
const { can } = require("../services/permissions");
const { canDeleteRecords } = require("../services/settingsService");
const { requireAuth } = require("../middleware/auth");

// Mounted at /api/projects (after projects.js): /:id/change-orders, /:id/rfis, /:id/image.
const router = createSafeRouter();
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const fail = (res, status, error) => res.status(status).json({ ok: false, error });

async function loadProject(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Project not found.");
  const project = await Project.findById(req.params.id).select("name").lean();
  if (!project) return fail(res, 404, "Project not found.");
  req.project = project;
  next();
}
const mayWrite = (req, res, next) =>
  can(req.session.role, "addRecords") ? next() : fail(res, 403, "You don't have permission to do this.");
async function mayDelete(req, res, next) {
  return (await canDeleteRecords(req.session.userId, req.session.role)) ? next() : fail(res, 403, "You don't have permission to delete.");
}

/** Keeps only legacy ids of submissions that belong to this project. */
async function validLinks(project, raw) {
  const ids = [...new Set((Array.isArray(raw) ? raw : []).map(Number).filter(Number.isInteger))];
  if (!ids.length) return [];
  const rows = await Record.find({ legacyId: { $in: ids }, project: project.name }).select("legacyId").lean();
  return rows.map((r) => r.legacyId);
}

const num = (v) => (v === undefined || v === null || v === "" ? 0 : Number(v));

// ── CO / PO ───────────────────────────────────────────────────────────────
async function parseCo(b, project) {
  const coNumber = String(b.co_number || "").trim();
  const change = String(b.change || "").trim();
  const date = statusEngine.parseDate(b.date);
  if (!coNumber || !change || !date) return { error: "CO/PO #, date and change are required." };
  const kind = String(b.kind || "CO");
  if (!CO_TYPES.includes(kind)) return { error: "Type must be CO or PO." };
  const tonnage = num(b.tonnage);
  const rate = num(b.rate_per_ton);
  if (![tonnage, rate].every((n) => Number.isFinite(n) && n >= 0)) return { error: "Tonnage and amount must be non-negative numbers." };
  const status = b.status === undefined || b.status === "" ? undefined : String(b.status);
  if (status !== undefined && !CO_STATUSES.includes(status)) return { error: "Invalid status." };
  return {
    fields: {
      kind,
      coNumber,
      date,
      change,
      notes: String(b.notes || "").trim(),
      tonnage: Math.round(tonnage * 100) / 100,
      ratePerTon: rate,
      currency: String(b.currency || "USD").trim().toUpperCase().slice(0, 5) || "USD",
      linkedSubmissions: await validLinks(project, b.linked_submissions),
      ...(status ? { status } : {}),
    },
  };
}

router.post("/:id/change-orders", requireAuth, mayWrite, loadProject, async (req, res) => {
  const { fields, error } = await parseCo(req.body, req.project);
  if (error) return fail(res, 400, error);
  const co = await ChangeOrder.create({ ...fields, project: req.project._id, createdBy: req.session.username });
  res.json({ ok: true, message: `${co.kind} ${co.coNumber} created.`, id: String(co._id) });
});

router.put("/:id/change-orders/:itemId", requireAuth, mayWrite, loadProject, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.itemId)) return fail(res, 404, "Not found.");
  const { fields, error } = await parseCo(req.body, req.project);
  if (error) return fail(res, 400, error);
  const co = await ChangeOrder.findOneAndUpdate({ _id: req.params.itemId, project: req.project._id }, { $set: fields });
  if (!co) return fail(res, 404, "Not found.");
  res.json({ ok: true, message: `${fields.kind} ${fields.coNumber} updated.` });
});

router.delete("/:id/change-orders/:itemId", requireAuth, mayDelete, loadProject, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.itemId)) return fail(res, 404, "Not found.");
  const r = await ChangeOrder.deleteOne({ _id: req.params.itemId, project: req.project._id });
  if (!r.deletedCount) return fail(res, 404, "Not found.");
  res.json({ ok: true, message: "Deleted." });
});

// ── RFI / Clarification ───────────────────────────────────────────────────
async function parseRfi(b, project) {
  const title = String(b.title || "").trim();
  const date = statusEngine.parseDate(b.date);
  const expected = statusEngine.parseDate(b.expected_response_date);
  if (!title || !date || !expected) return { error: "Title, date and expected response date are required." };
  const type = String(b.type || "RFI");
  if (!RFI_TYPES.includes(type)) return { error: `Type must be one of: ${RFI_TYPES.join(", ")}.` };
  const questions = (Array.isArray(b.questions) ? b.questions : [])
    .map((q) => ({
      ...(mongoose.isValidObjectId(q.id) ? { _id: q.id } : {}),
      text: String(q.text || "").trim(),
      response: String(q.response || "").trim(),
      responseDate: q.response_date ? statusEngine.parseDate(q.response_date) : null,
    }))
    .filter((q) => q.text);
  if (!questions.length) return { error: "Add at least one question." };
  return {
    fields: {
      type,
      title,
      date,
      expectedResponseDate: expected,
      questions,
      rfiNumber: String(b.rfi_number || "").trim(),
      linkedSubmissions: await validLinks(project, b.linked_submissions),
    },
  };
}

router.post("/:id/rfis", requireAuth, mayWrite, loadProject, async (req, res) => {
  const { fields, error } = await parseRfi(req.body, req.project);
  if (error) return fail(res, 400, error);
  const rfi = await Rfi.create({ ...fields, project: req.project._id, createdBy: req.session.username });
  res.json({ ok: true, message: `${rfi.type} "${rfi.title}" created.`, id: String(rfi._id) });
});

router.put("/:id/rfis/:itemId", requireAuth, mayWrite, loadProject, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.itemId)) return fail(res, 404, "Not found.");
  const { fields, error } = await parseRfi(req.body, req.project);
  if (error) return fail(res, 400, error);
  const rfi = await Rfi.findOneAndUpdate({ _id: req.params.itemId, project: req.project._id }, { $set: fields });
  if (!rfi) return fail(res, 404, "Not found.");
  res.json({ ok: true, message: `${fields.type} "${fields.title}" updated.` });
});

router.delete("/:id/rfis/:itemId", requireAuth, mayDelete, loadProject, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.itemId)) return fail(res, 404, "Not found.");
  const r = await Rfi.deleteOne({ _id: req.params.itemId, project: req.project._id });
  if (!r.deletedCount) return fail(res, 404, "Not found.");
  res.json({ ok: true, message: "Deleted." });
});

// ── Project image ─────────────────────────────────────────────────────────
router.get("/:id/image", requireAuth, loadProject, async (req, res) => {
  const img = await ProjectImage.findOne({ project: req.project._id }).lean();
  if (!img) return fail(res, 404, "No image.");
  res.set("Content-Type", img.contentType);
  res.set("Cache-Control", "private, no-cache");
  res.send(Buffer.from(img.data.buffer ? img.data.buffer : img.data));
});

/** PUT /:id/image — JSON { filename, data_url: "data:image/png;base64,..." } (png/jpeg/webp/gif, up to 5 MB). */
router.put("/:id/image", requireAuth, loadProject, async (req, res) => {
  if (!can(req.session.role, "manageProjects")) return fail(res, 403, "Not allowed.");
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.data_url || ""));
  if (!m) return fail(res, 400, "Upload a PNG, JPEG, WEBP or GIF image.");
  const data = Buffer.from(m[2], "base64");
  if (!data.length || data.length > MAX_IMAGE_BYTES) return fail(res, 400, "Image must be under 5 MB.");
  await ProjectImage.findOneAndUpdate(
    { project: req.project._id },
    { $set: { filename: String(req.body.filename || "").slice(0, 200), contentType: m[1], data, updatedAt: new Date() } },
    { upsert: true }
  );
  res.json({ ok: true, message: "Project image saved." });
});

router.delete("/:id/image", requireAuth, loadProject, async (req, res) => {
  if (!can(req.session.role, "manageProjects")) return fail(res, 403, "Not allowed.");
  await ProjectImage.deleteOne({ project: req.project._id });
  res.json({ ok: true, message: "Project image removed." });
});

module.exports = router;
