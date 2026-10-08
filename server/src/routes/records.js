const createSafeRouter = require("../utils/safeRouter");
const { Record, Project, Client, nextSequence } = require("../models");
const statusEngine = require("../services/statusEngine");
const { loadRecords } = require("../services/recordVisibility");
const { getTeamsFromUsers, getLinkedTls, getManagementScope } = require("../services/userHelpers");
const { can } = require("../services/permissions");
const { canUpdateRecords, canDeleteRecords, canEditInvoiceReleased, canEditCompletedLog } = require("../services/settingsService");
const { requireAuth } = require("../middleware/auth");
const env = require("../config/env");

const router = createSafeRouter();
const PAGE_SIZE = 100;

/** Validates + normalises the record fields shared by add and update. Returns { error } or { fields }. */
function parseRecordBody(b) {
  const project = (b.project || "").trim();
  const submissionName = (b.submission_name || "").trim();
  const client = (b.client || "").trim();
  const submissionType = (b.submission_type || "").trim();
  const team = (b.team || "").trim();
  if (!project || !submissionName || !client || !submissionType || !team) {
    return { error: "Please fill all required fields." };
  }
  if (!env.submissionTypes.includes(submissionType)) {
    return { error: `Type must be one of: ${env.submissionTypes.join(", ")}.` };
  }
  const billable = (b.billable || "").trim();
  if (billable && !env.billableTypes.includes(billable)) {
    return { error: `Billable must be one of: ${env.billableTypes.join(", ")}.` };
  }
  const tonnageRaw = b.tonnage === undefined || b.tonnage === null || b.tonnage === "" ? 0 : Number(b.tonnage);
  if (!Number.isFinite(tonnageRaw) || tonnageRaw < 0) return { error: "Tonnage must be a non-negative number." };

  const subDate = b.sub_date ? statusEngine.parseDate(String(b.sub_date).trim()) : null;
  const dueDate = b.due_date ? statusEngine.parseDate(String(b.due_date).trim()) : statusEngine.dueFromSub(subDate);

  return {
    fields: {
      project,
      submissionName,
      client,
      submissionType,
      team,
      unplanned: b.unplanned === true || b.unplanned === "true" || b.unplanned === "1" || b.unplanned === 1,
      tonnage: Math.round(tonnageRaw * 100) / 100,
      billable,
      subDate,
      dueDate,
      remarks: (b.remarks || "").trim(),
      statusOverride: (b.status_override || "").trim(),
    },
  };
}

/** Teams the caller may assign a record to. */
async function selectableTeamsFor(username, role) {
  if (role === "team_lead") return [username];
  if (role === "user") return getLinkedTls(username);
  if (role === "management") return (await getManagementScope(username)) || getTeamsFromUsers();
  return getTeamsFromUsers();
}

/**
 * Whether a record on `team` (created by `createdBy`) is inside the caller's scope —
 * mirrors recordVisibility. admin: all, management: their linked teams (all if none),
 * team_lead: their own team, user: their linked team leads.
 */
async function inScope(username, role, team, createdBy = "") {
  const t = String(team).toLowerCase(), cb = String(createdBy).toLowerCase(), me = username.toLowerCase();
  if (role === "admin") return true;
  if (role === "team_lead") return t === me || t.startsWith(me + "(") || t.startsWith(me + " ") || cb === me;
  if (role === "management") {
    const scope = await getManagementScope(username);
    return !scope || scope.some((x) => x.toLowerCase() === t);
  }
  return (await getLinkedTls(username)).some((x) => x.toLowerCase() === t || x.toLowerCase() === cb);
}

/** Creates the Project/Client master-list entries on first use so dropdowns stay in sync. */
async function ensureMasterLists(project, client) {
  await Client.updateOne({ name: client }, { $setOnInsert: { name: client } }, { upsert: true });
  await Project.updateOne({ name: project }, { $setOnInsert: { name: project, client } }, { upsert: true });
}

/** GET /api/records/due-date?sub_date=YYYY-MM-DD — sub_date + 7 days. */
router.get("/due-date", requireAuth, (req, res) => {
  const due = statusEngine.dueFromSub(req.query.sub_date);
  res.json({ due_date: due ? statusEngine.fmtDateOnlyISO(due) : "" });
});

/** GET /api/records/dashboard-config — which teams the caller can pick/filter by. */
router.get("/dashboard-config", requireAuth, async (req, res) => {
  const { username, role } = req.session;
  const selectableTeams = await selectableTeamsFor(username, role);
  res.json({
    selectableTeams,
    selectedTeams: selectableTeams,
    showTeamSelector: role === "admin" || ((role === "management" || role === "user") && selectableTeams.length > 1),
    defaultTeam: role === "team_lead" || role === "management" ? username : "",
    submissionTypes: env.submissionTypes,
    billableTypes: env.billableTypes,
  });
});

/** GET /api/records — paginated list with search, sort, team/type/status/date filters. */
router.get("/", requireAuth, async (req, res) => {
  const { username, role } = req.session;
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const search = String(req.query.search || "").trim().toLowerCase();
  const sortCol = String(req.query.sort || "");
  const sortDir = String(req.query.dir || "asc");
  const typeFilter = String(req.query.type || "").trim();
  const billableFilter = String(req.query.billable || "").trim();
  const tagFilter = String(req.query.tag || "").trim();
  const unplannedFilter = String(req.query.unplanned || "").trim(); // "1" = only unplanned
  const dateFrom = String(req.query.date_from || "").trim();
  const dateTo = String(req.query.date_to || "").trim();
  const selectedTeams = String(req.query.teams || "").split(",").map((t) => t.trim()).filter(Boolean);

  // The dashboard always sends `teams` once mounted, so an empty selection means "show nothing".
  let records = await loadRecords(username, role, selectedTeams);

  if (typeFilter) records = records.filter((r) => r.submission_type === typeFilter);
  if (billableFilter) records = records.filter((r) => r.billable === billableFilter);
  if (tagFilter) {
    records = records.filter((r) => (tagFilter === "completed" ? r.tag.startsWith("completed") : r.tag === tagFilter));
  }
  if (unplannedFilter === "1") records = records.filter((r) => r.unplanned);
  if (dateFrom) records = records.filter((r) => (r.sub_date_raw || "") >= dateFrom);
  if (dateTo) records = records.filter((r) => (r.sub_date_raw || "") <= dateTo);

  if (search) {
    records = records.filter((r) =>
      `${r.project} ${r.submission_name} ${r.client} ${r.team} ${r.status} ${r.remarks} ${r.submission_type} ${r.billable} ${r.tonnage}`
        .toLowerCase()
        .includes(search)
    );
  }

  const sortKeys = {
    project: (r) => r.project.toLowerCase(),
    submission: (r) => r.submission_name.toLowerCase(),
    unplanned: (r) => (r.unplanned ? 1 : 0),
    client: (r) => r.client.toLowerCase(),
    type: (r) => r.submission_type.toLowerCase(),
    tonnage: (r) => r.tonnage,
    billable: (r) => r.billable.toLowerCase(),
    invoice: (r) => (r.invoice_released ? 1 : 0),
    team: (r) => r.team.toLowerCase(),
    sub_date: (r) => r.sub_date_raw || "",
    due_date: (r) => r.due_date_raw || "",
    status: (r) => r.status.toLowerCase(),
  };
  if (sortKeys[sortCol]) {
    const keyFn = sortKeys[sortCol];
    records.sort((a, b) => (keyFn(a) < keyFn(b) ? -1 : keyFn(a) > keyFn(b) ? 1 : 0));
    if (sortDir === "desc") records.reverse();
  } else {
    // Default: on-hold first, active next, completed last; then by submission date.
    const rank = (tag) => (tag === "hold" ? 0 : tag.startsWith("completed") ? 2 : 1);
    records.sort((a, b) => {
      const ra = rank(a.tag), rb = rank(b.tag);
      if (ra !== rb) return ra - rb;
      return (a.sub_date_raw || "") < (b.sub_date_raw || "") ? -1 : (a.sub_date_raw || "") > (b.sub_date_raw || "") ? 1 : 0;
    });
  }

  const total = records.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const start = (pageClamped - 1) * PAGE_SIZE;
  const pageRecords = records.slice(start, start + PAGE_SIZE).map((r, i) => ({ ...r, row_number: start + i + 1 }));

  res.json({ records: pageRecords, total, page: pageClamped, pages: totalPages, page_size: PAGE_SIZE });
});

/** POST /api/records — add a record (admin / management / team_lead). */
router.post("/", requireAuth, async (req, res) => {
  const { username, role } = req.session;
  if (!can(role, "addRecords")) return res.status(403).json({ ok: false, error: "You don't have permission to add records." });

  const parsed = parseRecordBody(req.body);
  if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error });
  const f = parsed.fields;
  if (role === "team_lead") f.team = username; // team leads can only file under their own team
  if (!(await inScope(username, role, f.team))) {
    return res.status(403).json({ ok: false, error: "You can only add records for your own / linked teams." });
  }

  let status, completedAt;
  if (f.statusOverride === "COMPLETED") {
    status = statusEngine.resolveCompleteStatus(f.dueDate).status;
    completedAt = statusEngine.completedAtNow();
  } else if (f.statusOverride === "ON HOLD") {
    status = "ON HOLD";
    completedAt = null;
  } else {
    status = statusEngine.computeStatus(f.dueDate).status;
    completedAt = null;
  }

  const legacyId = await nextSequence("recordId");
  await Record.create({
    legacyId,
    project: f.project,
    submissionName: f.submissionName,
    unplanned: f.unplanned,
    client: f.client,
    submissionType: f.submissionType,
    tonnage: f.tonnage,
    billable: f.billable,
    team: f.team,
    subDate: f.subDate,
    dueDate: f.dueDate,
    remarks: f.remarks,
    status,
    createdAt: new Date(),
    completedAt,
    createdBy: role === "admin" || role === "management" ? f.team : username,
  });
  await ensureMasterLists(f.project, f.client);

  res.json({ ok: true, message: `Record #${legacyId} added successfully.`, id: legacyId });
});

/** PUT /api/records/:id — update (admin / management any; team_lead only their own team's). */
router.put("/:id", requireAuth, async (req, res) => {
  const { username, role } = req.session;
  const { userId } = req.session;
  const mayInvoice = await canEditInvoiceReleased(userId, role);

  const existing = await Record.findOne({ legacyId: req.params.id });
  if (!existing) return res.status(404).json({ ok: false, error: "Record not found." });
  // Completed submissions may also be edited by users granted "Edit Completed Log" in Settings.
  const isCompleted = String(existing.status || "").toUpperCase().startsWith("COMPLETED");
  const mayEdit = (await canUpdateRecords(userId, role)) || (isCompleted && (await canEditCompletedLog(userId, role)));
  if (!mayEdit) return res.status(403).json({ ok: false, error: "You don't have permission to update records." });
  if (!(await inScope(username, role, existing.team, existing.createdBy))) {
    return res.status(403).json({ ok: false, error: "You can only edit records within your own / linked teams." });
  }

  const parsed = parseRecordBody(req.body);
  if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error });
  const f = parsed.fields;
  if (role === "team_lead") f.team = existing.team;
  if (!(await inScope(username, role, f.team, existing.createdBy))) {
    return res.status(403).json({ ok: false, error: "You can only move records to your own / linked teams." });
  }

  let status, completedAt;
  if (f.statusOverride === "COMPLETED") {
    status = statusEngine.resolveCompleteStatus(f.dueDate).status;
    completedAt = existing.completedAt || statusEngine.completedAtNow();
  } else if (f.statusOverride === "ON HOLD") {
    status = "ON HOLD";
    completedAt = null;
  } else {
    // "" (auto) and "__RELEASE__" both recompute from the due date.
    status = statusEngine.computeStatus(f.dueDate).status;
    completedAt = null;
  }

  existing.project = f.project;
  existing.submissionName = f.submissionName;
  existing.unplanned = f.unplanned;
  existing.client = f.client;
  existing.submissionType = f.submissionType;
  existing.tonnage = f.tonnage;
  existing.billable = f.billable;
  existing.team = f.team;
  existing.subDate = f.subDate;
  existing.dueDate = f.dueDate;
  existing.remarks = f.remarks;
  existing.status = status;
  existing.completedAt = completedAt;
  // Invoice Released is only honoured from admin / Settings-listed users; anyone else's value is ignored.
  if (mayInvoice && req.body.invoice_released !== undefined) {
    existing.invoiceReleased = req.body.invoice_released === true || req.body.invoice_released === "true";
  }
  await existing.save();
  await ensureMasterLists(f.project, f.client);

  res.json({ ok: true, message: `Record #${req.params.id} updated.` });
});

/** DELETE /api/records/:id — admin, or users listed under Settings: Delete Records. */
router.delete("/:id", requireAuth, async (req, res) => {
  const { username, role, userId } = req.session;
  if (!(await canDeleteRecords(userId, role))) {
    return res.status(403).json({ ok: false, error: "You don't have permission to delete records." });
  }
  const target = await Record.findOne({ legacyId: req.params.id }).select("team createdBy").lean();
  if (!target) return res.status(404).json({ ok: false, error: "Record not found." });
  if (!(await inScope(username, role, target.team, target.createdBy))) {
    return res.status(403).json({ ok: false, error: "You can only delete records within your own / linked teams." });
  }
  await Record.deleteOne({ legacyId: req.params.id });
  res.json({ ok: true, message: `Record #${req.params.id} deleted.` });
});

/** POST /api/records/:id/invoice-released — { value: boolean }; admin or Settings-listed users only. */
router.post("/:id/invoice-released", requireAuth, async (req, res) => {
  const { username, role, userId } = req.session;
  if (!(await canEditInvoiceReleased(userId, role))) {
    return res.status(403).json({ ok: false, error: "You don't have permission to change Invoice Released." });
  }
  const row = await Record.findOne({ legacyId: req.params.id });
  if (!row) return res.status(404).json({ ok: false, error: "Record not found." });
  if (!(await inScope(username, role, row.team, row.createdBy))) {
    return res.status(403).json({ ok: false, error: "Record is outside your own / linked teams." });
  }
  row.invoiceReleased = req.body.value === true || req.body.value === "true";
  await row.save();
  res.json({ ok: true, value: row.invoiceReleased });
});

/** GET /api/records/by-project?project=X — role-scoped listing with no completed-grace cutoff. */
router.get("/by-project", requireAuth, async (req, res) => {
  const { username, role } = req.session;
  const project = String(req.query.project || "");
  const records = (await loadRecords(username, role, null, { includeAllCompleted: true })).filter((r) => r.project === project);
  res.json({ records });
});

/** GET /api/records/:id — one record (same visibility as the list). Registered last so it can't shadow fixed paths. */
router.get("/:id", requireAuth, async (req, res) => {
  const { username, role } = req.session;
  const records = await loadRecords(username, role, null, { includeAllCompleted: true });
  const record = records.find((r) => r.id === String(req.params.id));
  if (!record) return res.status(404).json({ ok: false, error: "Record not found." });
  res.json({ record });
});

module.exports = router;
