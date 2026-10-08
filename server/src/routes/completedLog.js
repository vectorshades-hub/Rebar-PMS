const ExcelJS = require("exceljs");
const createSafeRouter = require("../utils/safeRouter");
const { loadRecords } = require("../services/recordVisibility");
const { requireAuth } = require("../middleware/auth");
const { canEditCompletedLog } = require("../services/settingsService");

const router = createSafeRouter();
const PAGE_SIZE = 100;

/** 'YYYY-MM-DDTHH:MM:SS.sssZ' -> 'YYYY-MM-DD HH:MM' (blank stays blank). */
function fmtMinute(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16).replace("T", " ");
}

/** Role check shared by the list and the export. Returns an error string, or "" when allowed. */
async function accessError(req) {
  const { role, userId } = req.session;
  // The log is open to admin / management / team leads, plus anyone granted Completed Log editing in Settings.
  if (["admin", "management", "team_lead"].includes(role) || (await canEditCompletedLog(userId, role))) return "";
  return "Permission denied";
}

/** Completed records the caller may see, narrowed by the query filters and sorted (shared by list + export). */
async function filteredRecords(req) {
  const { username, role } = req.session;
  const search = String(req.query.search || "").trim().toLowerCase();
  const typeFilter = String(req.query.type || "").trim();
  const billableFilter = String(req.query.billable || "").trim();
  const lateOnly = String(req.query.late || "") === "1";
  const dateFrom = String(req.query.date_from || "").trim(); // completed date, YYYY-MM-DD
  const dateTo = String(req.query.date_to || "").trim();
  const sortCol = String(req.query.sort || "completed");
  const sortDir = String(req.query.dir || "desc");

  let records = (await loadRecords(username, role, null, { includeAllCompleted: true })).filter((r) => r.tag.startsWith("completed"));

  if (typeFilter) records = records.filter((r) => r.submission_type === typeFilter);
  if (billableFilter) records = records.filter((r) => r.billable === billableFilter);
  if (lateOnly) records = records.filter((r) => r.tag === "completed_overdue");
  if (dateFrom) records = records.filter((r) => r.completed_at.slice(0, 10) >= dateFrom);
  if (dateTo) records = records.filter((r) => r.completed_at.slice(0, 10) <= dateTo);
  if (search) {
    records = records.filter((r) =>
      `${r.project} ${r.submission_name} ${r.client} ${r.team} ${r.submission_type} ${r.billable} ${r.remarks}`.toLowerCase().includes(search)
    );
  }

  const keys = {
    project: (r) => r.project.toLowerCase(),
    submission: (r) => r.submission_name.toLowerCase(),
    client: (r) => r.client.toLowerCase(),
    type: (r) => r.submission_type,
    tonnage: (r) => r.tonnage,
    billable: (r) => r.billable.toLowerCase(),
    team: (r) => r.team.toLowerCase(),
    due_date: (r) => r.due_date_raw || "",
    completed: (r) => r.completed_at || "",
  };
  const keyFn = keys[sortCol] || keys.completed;
  records.sort((a, b) => (keyFn(a) < keyFn(b) ? -1 : keyFn(a) > keyFn(b) ? 1 : 0));
  if (sortDir === "desc") records.reverse();
  return records;
}

/**
 * GET /api/completed-log - every completed submission the caller may see (no
 * completed-grace cutoff, unlike the home records list), newest completion first.
 * Derived live from the records, so it can never drift from them.
 */
router.get("/", requireAuth, async (req, res) => {
  const denied = await accessError(req);
  if (denied) return res.status(403).json({ ok: false, error: denied });
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const records = await filteredRecords(req);

  const stats = {
    total: records.length,
    projects: new Set(records.map((r) => r.project)).size,
    late: records.filter((r) => r.tag === "completed_overdue").length,
    total_tonnage: Math.round(records.reduce((s, r) => s + (Number(r.tonnage) || 0), 0) * 100) / 100,
  };

  const total = records.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageClamped = Math.min(page, pages);
  const start = (pageClamped - 1) * PAGE_SIZE;
  const rows = records.slice(start, start + PAGE_SIZE).map((r, i) => ({
    ...r,
    row_number: start + i + 1,
    completed_at_fmt: fmtMinute(r.completed_at),
  }));

  res.json({ records: rows, total, page: pageClamped, pages, page_size: PAGE_SIZE, stats });
});

/** GET /api/completed-log/export - the same filters / sort as the list, every page, as an .xlsx file. */
router.get("/export", requireAuth, async (req, res) => {
  const denied = await accessError(req);
  if (denied) return res.status(403).json({ ok: false, error: denied });
  const records = await filteredRecords(req);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Completed Log");
  ws.columns = [
    { header: "#", key: "n", width: 6 },
    { header: "Project", key: "project", width: 36 },
    { header: "Submission Name", key: "name", width: 32 },
    { header: "Unplanned", key: "unplanned", width: 11 },
    { header: "Client", key: "client", width: 24 },
    { header: "Type", key: "type", width: 14 },
    { header: "Tonnage", key: "tonnage", width: 10 },
    { header: "Team", key: "team", width: 18 },
    { header: "Due Date", key: "due", width: 12 },
    { header: "Completed At", key: "completed", width: 18 },
    { header: "Status", key: "status", width: 24 },
    { header: "Billable", key: "billable", width: 13 },
    { header: "Invoice Released", key: "invoice", width: 16 },
    { header: "Remarks", key: "remarks", width: 40 },
  ];
  records.forEach((r, i) =>
    ws.addRow({
      n: i + 1,
      project: r.project,
      name: r.submission_name,
      unplanned: r.unplanned ? "Yes" : "No",
      client: r.client,
      type: r.submission_type,
      tonnage: Number(r.tonnage) || 0,
      team: r.team,
      due: r.due_date,
      completed: fmtMinute(r.completed_at),
      status: r.status,
      billable: r.billable,
      invoice: r.invoice_released ? "Yes" : "No",
      remarks: r.remarks,
    })
  );
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F3D2E" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "N1" };

  const filename = `completed-log-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;
