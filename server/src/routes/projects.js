const mongoose = require("mongoose");
const createSafeRouter = require("../utils/safeRouter");
const { Project, Client, Record, ChangeOrder, Rfi, ProjectImage } = require("../models");
const { serializeChangeOrder, serializeRfi } = require("../services/projectItems");
const { loadRecords } = require("../services/recordVisibility");
const { can, canViewAmounts } = require("../services/permissions");
const { getManagementScope } = require("../services/userHelpers");
const { requireAuth } = require("../middleware/auth");

const router = createSafeRouter();

/** Roll-up of a project's (already role-scoped) records. */
function summarize(records) {
  const total = records.length;
  const completed = records.filter((r) => r.tag.startsWith("completed")).length;
  const tonnage = records.reduce((s, r) => s + (Number(r.tonnage) || 0), 0);
  const completedTonnage = records.filter((r) => r.tag.startsWith("completed")).reduce((s, r) => s + (Number(r.tonnage) || 0), 0);
  return {
    total_submissions: total,
    completed,
    on_hold: records.filter((r) => r.tag === "hold").length,
    overdue: records.filter((r) => r.tag === "overdue").length,
    unplanned: records.filter((r) => r.unplanned).length,
    total_tonnage: Math.round(tonnage * 100) / 100,
    completed_tonnage: Math.round(completedTonnage * 100) / 100,
    progress_pct: total ? Math.round((completed / total) * 100) : 0,
    tonnage_progress_pct: tonnage ? Math.round((completedTonnage / tonnage) * 100) : 0,
  };
}

/**
 * GET /api/projects — master lists for the record forms (names), plus a
 * per-project summary for the caller's visible records.
 */
router.get("/", requireAuth, async (req, res) => {
  const { username, role } = req.session;
  const [projects, clients] = await Promise.all([Project.find({}).sort({ name: 1 }).lean(), Client.find({}).sort({ name: 1 }).lean()]);
  const records = await loadRecords(username, role, null, { includeAllCompleted: true });
  const byProject = new Map();
  for (const r of records) {
    if (!byProject.has(r.project)) byProject.set(r.project, []);
    byProject.get(r.project).push(r);
  }
  const projectDetails = projects.map((p) => ({
    id: String(p._id),
    name: p.name,
    client: p.client || "",
    description: p.description || "",
    ...summarize(byProject.get(p.name) || []),
  }));
  res.json({
    projects: projects.map((p) => p.name),
    clients: clients.map((c) => c.name),
    projectDetails,
  });
});

/**
 * POST /api/projects — action-based endpoint (same shape as the source app):
 * add | edit | delete | add_client | edit_client | delete_client.
 * A project always belongs to a client (by name). Renames cascade to the
 * records that reference the name; deletes never touch records, and deleting
 * a client just leaves its projects unassigned. Deletes are admin/management only.
 */
router.post("/", requireAuth, async (req, res) => {
  const { role } = req.session;
  if (!can(role, "manageProjects")) return res.status(403).json({ ok: false, error: "Not allowed." });
  const b = req.body;
  const action = String(b.action || "").trim();
  const str = (k) => String(b[k] ?? "").trim();
  const deleting = action === "delete" || action === "delete_client";
  if (deleting && !can(role, "deleteProjects")) {
    return res.status(403).json({ ok: false, error: "Only admin or management can delete." });
  }

  switch (action) {
    case "add": {
      const name = str("project_name"), clientName = str("client_name");
      if (!name) return res.status(400).json({ ok: false, error: "Project name required." });
      if (!clientName) return res.status(400).json({ ok: false, error: "Client required." });
      if (!(await Client.exists({ name: clientName }))) return res.status(400).json({ ok: false, error: "Client not found." });
      if (await Project.exists({ name })) return res.status(409).json({ ok: false, error: "That project already exists." });
      await Project.create({ name, client: clientName });
      return res.json({ ok: true, message: `Project '${name}' added under '${clientName}'.` });
    }
    case "edit": {
      const oldName = str("old_name"), newName = str("new_name"), clientName = str("client_name");
      if (!oldName || !newName) return res.status(400).json({ ok: false, error: "Both names required." });
      if (!clientName) return res.status(400).json({ ok: false, error: "Client required." });
      if (!(await Client.exists({ name: clientName }))) return res.status(400).json({ ok: false, error: "Client not found." });
      if (newName !== oldName && (await Project.exists({ name: newName }))) {
        return res.status(409).json({ ok: false, error: "That project already exists." });
      }
      const r = await Project.updateOne({ name: oldName }, { $set: { name: newName, client: clientName } });
      if (!r.matchedCount) return res.status(404).json({ ok: false, error: "Project not found." });
      if (newName !== oldName) await Record.updateMany({ project: oldName }, { $set: { project: newName } });
      await Record.updateMany({ project: newName }, { $set: { client: clientName } });
      return res.json({ ok: true, message: "Project updated." });
    }
    case "delete": {
      const name = str("project_name");
      await Project.deleteOne({ name });
      return res.json({ ok: true, message: `Project '${name}' deleted. Existing records are not affected.` });
    }
    case "add_client": {
      const name = str("client_name");
      if (!name) return res.status(400).json({ ok: false, error: "Client name required." });
      if (await Client.exists({ name })) return res.status(409).json({ ok: false, error: "That client already exists." });
      await Client.create({ name });
      return res.json({ ok: true, message: `Client '${name}' added.` });
    }
    case "edit_client": {
      const oldName = str("old_name"), newName = str("new_name");
      if (!oldName || !newName) return res.status(400).json({ ok: false, error: "Both names required." });
      if (newName !== oldName && (await Client.exists({ name: newName }))) {
        return res.status(409).json({ ok: false, error: "That client already exists." });
      }
      const r = await Client.updateOne({ name: oldName }, { name: newName });
      if (!r.matchedCount) return res.status(404).json({ ok: false, error: "Client not found." });
      await Project.updateMany({ client: oldName }, { $set: { client: newName } });
      await Record.updateMany({ client: oldName }, { $set: { client: newName } });
      return res.json({ ok: true, message: "Client renamed." });
    }
    case "delete_client": {
      const name = str("client_name");
      await Client.deleteOne({ name });
      await Project.updateMany({ client: name }, { $set: { client: "" } });
      return res.json({ ok: true, message: `Client '${name}' deleted. Its projects are now unassigned; existing records are not affected.` });
    }
    default:
      return res.status(400).json({ ok: false, error: "Unknown action." });
  }
});

// Stages are completed by hand, in order: OFA -> Fabrication -> Project.
const LIFECYCLE_STAGES = [["ofa", "ofaAt"], ["fabrication", "fabricationAt"], ["project", "completedAt"]];

/** PUT /api/projects/:id/lifecycle - { stage: "ofa"|"fabrication"|"project", done: boolean } (admin / management / team_lead). */
router.put("/:id/lifecycle", requireAuth, async (req, res) => {
  if (!can(req.session.role, "manageProjects")) return res.status(403).json({ ok: false, error: "Not allowed." });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ ok: false, error: "Project not found." });
  const idx = LIFECYCLE_STAGES.findIndex(([key]) => key === req.body.stage);
  if (idx < 0) return res.status(400).json({ ok: false, error: "Unknown stage." });
  const p = await Project.findById(req.params.id).select("name lifecycle");
  if (!p) return res.status(404).json({ ok: false, error: "Project not found." });

  const at = (i) => p.lifecycle && p.lifecycle[LIFECYCLE_STAGES[i][1]];
  const done = req.body.done !== false;
  if (done && at(idx)) return res.status(409).json({ ok: false, error: "That stage is already completed." });
  if (done && idx > 0 && !at(idx - 1)) return res.status(409).json({ ok: false, error: "Complete the earlier stage first." });
  if (!done && idx < LIFECYCLE_STAGES.length - 1 && at(idx + 1)) {
    return res.status(409).json({ ok: false, error: "Reopen the later stage first." });
  }
  await Project.updateOne({ _id: p._id }, { $set: { [`lifecycle.${LIFECYCLE_STAGES[idx][1]}`]: done ? new Date() : null } });
  res.json({ ok: true, message: `${p.name}: ${done ? "stage completed" : "stage reopened"}.` });
});

/** GET /api/projects/:id — project detail + its linked (role-scoped) submissions. */
router.get("/:id", requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ ok: false, error: "Project not found." });
  const project = await Project.findById(req.params.id).lean();
  if (!project) return res.status(404).json({ ok: false, error: "Project not found." });

  const { username, role } = req.session;
  const records = (await loadRecords(username, role, null, { includeAllCompleted: true })).filter((r) => r.project === project.name);
  // A team lead / user who can't see any of this project's submissions shouldn't see the project either.
  const scoped = role === "team_lead" || role === "user" || (role === "management" && (await getManagementScope(username)));
  if (scoped && !records.length) {
    return res.status(404).json({ ok: false, error: "Project not found." });
  }

  const byLegacyId = new Map(records.map((r) => [Number(r.id), r]));
  const [cos, rfis, image] = await Promise.all([
    ChangeOrder.find({ project: project._id }).sort({ date: -1, createdAt: -1 }).lean(),
    Rfi.find({ project: project._id }).sort({ date: -1, createdAt: -1 }).lean(),
    ProjectImage.findOne({ project: project._id }).select("updatedAt filename").lean(),
  ]);

  res.json({
    project: {
      id: String(project._id),
      name: project.name,
      client: project.client || "",
      description: project.description || "",
      created_at: project.createdAt,
      lifecycle: Object.fromEntries(LIFECYCLE_STAGES.map(([key, field]) => [key, (project.lifecycle && project.lifecycle[field]) || null])),
    },
    summary: summarize(records),
    records,
    change_orders: cos.map((c) => serializeChangeOrder(c, byLegacyId, { withAmounts: canViewAmounts(role) })),
    rfis: rfis.map((r) => serializeRfi(r, byLegacyId)),
    image: image ? { filename: image.filename || "", version: new Date(image.updatedAt).getTime() } : null,
  });
});

/** PUT /api/projects/:id — edit client / description (admin / management / team_lead). */
router.put("/:id", requireAuth, async (req, res) => {
  if (!can(req.session.role, "manageProjects")) return res.status(403).json({ ok: false, error: "Not allowed." });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ ok: false, error: "Project not found." });
  const p = await Project.findById(req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: "Project not found." });
  const client = String(req.body.client ?? p.client).trim();
  if (client) await Client.updateOne({ name: client }, { $setOnInsert: { name: client } }, { upsert: true });
  p.client = client;
  p.description = String(req.body.description ?? p.description).trim();
  await p.save();
  res.json({ ok: true, message: `Project '${p.name}' updated.` });
});

module.exports = router;
