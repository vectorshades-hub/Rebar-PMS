const ExcelJS = require("exceljs");
const createSafeRouter = require("../utils/safeRouter");
const { requireRole } = require("../middleware/auth");
const { loadRecords } = require("../services/recordVisibility");

const router = createSafeRouter();

/** Records the caller may export: org-wide for admin/management, own scope for team leads. */
function loadScopedRecords(req) {
  return req.session.role === "team_lead"
    ? loadRecords(req.session.username, "team_lead", null, { includeAllCompleted: true })
    : loadRecords("", "admin", null, { includeAllCompleted: true });
}

/** GET /api/reports/meta — team and created-by option lists for the Reports modal pickers. */
router.get("/meta", requireRole("admin", "management", "team_lead"), async (req, res) => {
  const records = await loadScopedRecords(req);
  const uniq = (key) => [...new Set(records.map((r) => r[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  res.json({ teams: uniq("team"), created_by: uniq("created_by") });
});

/** POST /api/reports/export — ad-hoc filtered Excel export. */
router.post("/export", requireRole("admin", "management", "team_lead"), async (req, res) => {
  const b = req.body || {};
  let records = await loadScopedRecords(req);

  const eq = (val, filter) => !filter || String(val || "").toLowerCase() === String(filter).toLowerCase();
  const startsWith = (val, filter) => !filter || String(val || "").toUpperCase().startsWith(String(filter).toUpperCase());

  if (b.f_team) records = records.filter((r) => eq(r.team, b.f_team));
  if (b.f_project) records = records.filter((r) => eq(r.project, b.f_project));
  if (b.f_client) records = records.filter((r) => eq(r.client, b.f_client));
  if (b.f_type) records = records.filter((r) => eq(r.submission_type, b.f_type));
  if (b.f_status) records = records.filter((r) => startsWith(r.status, b.f_status));
  if (b.f_created_by) records = records.filter((r) => eq(r.created_by, b.f_created_by));
  if (b.f_billable) records = records.filter((r) => eq(r.billable, b.f_billable));
  if (b.f_invoice_released) records = records.filter((r) => (r.invoice_released ? "yes" : "no") === String(b.f_invoice_released).toLowerCase());
  if (b.f_sub_from) records = records.filter((r) => (r.sub_date_raw || "") >= b.f_sub_from);
  if (b.f_sub_to) records = records.filter((r) => r.sub_date_raw && r.sub_date_raw <= b.f_sub_to);
  if (b.f_due_from) records = records.filter((r) => (r.due_date_raw || "") >= b.f_due_from);
  if (b.f_due_to) records = records.filter((r) => r.due_date_raw && r.due_date_raw <= b.f_due_to);

  const groupKey = ["project", "client", "team"].includes(b.group_by) ? b.group_by : "project";
  records.sort((a, c) => a[groupKey].localeCompare(c[groupKey]));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Report");
  ws.addRow(["ID", "Project", "Submission", "Client", "Type", "Tonnage", "Billable", "Invoice Released", "Team", "Sub Date", "Due Date", "Remarks", "Status", "Unplanned", "Created By", "Created At"]);
  ws.getRow(1).font = { bold: true };
  for (const r of records) {
    ws.addRow([
      r.id, r.project, r.submission_name, r.client, r.submission_type, r.tonnage, r.billable, r.invoice_released ? "Yes" : "No",
      r.team, r.sub_date, r.due_date, r.remarks, r.status, r.unplanned ? "Yes" : "No", r.created_by, r.created_at,
    ]);
  }
  ws.columns.forEach((c) => { c.width = 16; });

  const ts = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const filename = `report_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;
