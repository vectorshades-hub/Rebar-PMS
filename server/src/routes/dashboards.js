const mongoose = require("mongoose");
const createSafeRouter = require("../utils/safeRouter");
const { Project, Record, ChangeOrder } = require("../models");
const statusEngine = require("../services/statusEngine");
const { canEditInvoiceReleased } = require("../services/settingsService");
const { requireRole } = require("../middleware/auth");

// Management dashboard (/management) and Finance dashboard (/finance) over every project's CO/PO.
const router = createSafeRouter();
const fail = (res, status, error) => res.status(status).json({ ok: false, error });
const round2 = (n) => Math.round(n * 100) / 100;

async function mayManage(req, res, next) {
  return (await canEditInvoiceReleased(req.session.userId, req.session.role))
    ? next()
    : fail(res, 403, "You don't have permission to release invoices.");
}

function serialize(c, project) {
  return {
    id: String(c._id),
    project_id: String(c.project),
    project: project ? project.name : "(deleted project)",
    client: project ? project.client || "" : "",
    kind: c.kind || "CO",
    co_number: c.coNumber,
    date: statusEngine.fmtDateOnlyISO(c.date),
    change: c.change,
    tonnage: c.tonnage || 0,
    currency: c.currency || "USD",
    rate_per_ton: c.ratePerTon || 0,
    total: round2((c.tonnage || 0) * (c.ratePerTon || 0)),
    status: c.status,
    invoice_released: c.invoiceReleased || "",
    released_by: c.invoiceReleasedBy || "",
    released_at: c.invoiceReleasedAt ? new Date(c.invoiceReleasedAt).toISOString() : "",
    acknowledged_by: c.acknowledgedBy || "",
    acknowledged_at: c.acknowledgedAt ? new Date(c.acknowledgedAt).toISOString() : "",
  };
}

async function loadRows(filter) {
  const [cos, projects] = await Promise.all([
    ChangeOrder.find(filter).sort({ date: -1, _id: -1 }).lean(),
    Project.find({}).select("name client").lean(),
  ]);
  const byId = new Map(projects.map((p) => [String(p._id), p]));
  return cos.map((c) => serialize(c, byId.get(String(c.project))));
}

/** GET /api/dashboards/management — every CO/PO across all projects. */
router.get("/management", requireRole("admin", "management", "team_lead", "user"), mayManage, async (req, res) => {
  res.json({ ok: true, items: await loadRows({}) });
});

/** Linked submissions of a CO/PO that aren't completed yet. */
async function pendingSubmissions(co) {
  if (!(co.linkedSubmissions || []).length) return [];
  const rows = await Record.find({ legacyId: { $in: co.linkedSubmissions } }).select("legacyId submissionName status").lean();
  return rows.filter((r) => !String(r.status || "").toUpperCase().startsWith("COMPLETED")).map((r) => ({ id: r.legacyId, name: r.submissionName }));
}

/**
 * PUT /api/dashboards/management/:id/invoice — { invoice_released: "" | "yes" | "no" }.
 * "yes" needs every linked submission completed (else 409 with the pending names) and moves the
 * CO/PO to "sent_finance". Un-releasing a sent one puts it back to "pending"; once Finance has
 * acknowledged it, it is locked.
 */
router.put("/management/:id/invoice", requireRole("admin", "management", "team_lead", "user"), mayManage, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Not found.");
  const value = String(req.body.invoice_released ?? "");
  if (!["", "yes", "no"].includes(value)) return fail(res, 400, "Invalid value.");
  const co = await ChangeOrder.findById(req.params.id);
  if (!co) return fail(res, 404, "Not found.");
  const label = `${co.kind}${co.coNumber}`;
  if (co.status === "finance_approved") return fail(res, 409, `${label} is already approved by Finance and can't be changed.`);

  if (co.status === "sent_finance" && req.session.role !== "admin") {
    return fail(res, 403, `${label} has been sent to Finance — only an admin can change it.`);
  }

  const set = { invoiceReleased: value };
  if (value === "yes") {
    const pending = await pendingSubmissions(co);
    if (pending.length) {
      return res.status(409).json({
        ok: false,
        error: `${label} can't be sent to Finance — ${pending.length} linked submission${pending.length === 1 ? " is" : "s are"} not completed.`,
        pending,
      });
    }
    Object.assign(set, { status: "sent_finance", invoiceReleasedBy: req.session.username, invoiceReleasedAt: new Date() });
  } else if (co.status === "sent_finance") {
    Object.assign(set, { status: "pending", invoiceReleasedBy: "", invoiceReleasedAt: null });
  }
  await ChangeOrder.updateOne({ _id: co._id }, { $set: set });
  // Keep the linked submissions' own "Invoice Released" flag in step with the CO/PO.
  if (set.status && co.linkedSubmissions.length) {
    await Record.updateMany({ legacyId: { $in: co.linkedSubmissions } }, { $set: { invoiceReleased: value === "yes" } });
  }
  res.json({ ok: true, message: value === "yes" ? `${label} sent to Finance.` : `${label} invoice released set to ${value === "no" ? "No" : "Not Set"}.` });
});

/** GET /api/dashboards/finance — CO/POs released to Finance from the Management dashboard. */
router.get("/finance", requireRole("admin", "finance"), async (req, res) => {
  res.json({ ok: true, items: await loadRows({ invoiceReleased: "yes", status: { $in: ["sent_finance", "finance_approved"] } }) });
});

/** POST /api/dashboards/finance/:id/acknowledge — marks the CO/PO "finance_approved". */
router.post("/finance/:id/acknowledge", requireRole("admin", "finance"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Not found.");
  const co = await ChangeOrder.findOneAndUpdate(
    { _id: req.params.id, invoiceReleased: "yes", status: "sent_finance" },
    { $set: { status: "finance_approved", acknowledgedBy: req.session.username, acknowledgedAt: new Date() } }
  );
  if (!co) return fail(res, 409, "This CO/PO is not awaiting acknowledgement.");
  res.json({ ok: true, message: `${co.kind}${co.coNumber} acknowledged.` });
});

module.exports = router;
