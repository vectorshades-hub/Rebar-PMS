/**
 * Role-scoped record loading (adapted from Schedule-Tracker's recordVisibility.js).
 *   admin              : every record
 *   management         : records of their linkedTls team leads (every record if none are linked)
 *   team_lead          : records of their own team (team or createdBy === username)
 *   user               : records of the team leads in their linkedTls
 */
const env = require("../config/env");
const { Record, User, Project } = require("../models");
const statusEngine = require("./statusEngine");

function teamMatch(team, username) {
  return team === username || team.startsWith(username + "(") || team.startsWith(username + " ");
}

function rowToRecord(row) {
  const { status, tag } = statusEngine.computeStatus(row.dueDate, row.status);
  return {
    id: String(row.legacyId),
    project: row.project || "",
    submission_name: row.submissionName || "",
    unplanned: !!row.unplanned,
    client: row.client || "",
    submission_type: row.submissionType || "",
    tonnage: row.tonnage ?? 0,
    billable: row.billable || "",
    invoice_released: !!row.invoiceReleased,
    team: row.team || "",
    sub_date: statusEngine.fmtDate(row.subDate),
    sub_date_raw: statusEngine.fmtDateOnlyISO(row.subDate),
    due_date: statusEngine.fmtDate(row.dueDate),
    due_date_raw: statusEngine.fmtDateOnlyISO(row.dueDate),
    remarks: row.remarks || "",
    status,
    tag,
    created_at: statusEngine.fmtDateTime(row.createdAt),
    completed_at: row.completedAt ? new Date(row.completedAt).toISOString() : "",
    created_by: row.createdBy || "",
  };
}

/** @param {{ includeAllCompleted?: boolean }} options — skip the completed-grace cutoff (project detail page). */
async function loadRecords(username, role, teamsFilter = null, options = {}) {
  const { includeAllCompleted = false } = options;
  const rawRows = await Record.find({}).sort({ subDate: 1, createdAt: 1 }).lean();
  // project name -> id, so the table can link straight to /projects/[id]
  const projectIds = new Map((await Project.find({}).select("name").lean()).map((p) => [p.name, String(p._id)]));

  const graceDays = role === "admin" ? env.completedDaysGraceExtended : env.completedDaysGrace;
  const graceCutoff = new Date();
  graceCutoff.setUTCHours(0, 0, 0, 0);
  graceCutoff.setUTCDate(graceCutoff.getUTCDate() - graceDays);

  let linkedLower = [];
  if (role === "user" || role === "management") {
    const u = await User.findOne({ username }).select("linkedTls").lean();
    linkedLower = ((u && u.linkedTls) || []).map((l) => l.toLowerCase());
  }
  const unameLower = (username || "").toLowerCase();

  const records = [];
  for (const row of rawRows) {
    const rec = rowToRecord(row);
    rec.project_id = projectIds.get(rec.project) || "";

    if (!includeAllCompleted && (rec.tag === "completed" || rec.tag === "completed_overdue") && row.completedAt) {
      const ca = new Date(row.completedAt);
      ca.setUTCHours(0, 0, 0, 0);
      if (ca.getTime() < graceCutoff.getTime()) continue;
    }

    const teamLower = rec.team.toLowerCase();
    const cbLower = rec.created_by.toLowerCase();

    if (role === "user" || (role === "management" && linkedLower.length)) {
      if (!linkedLower.some((l) => teamMatch(teamLower, l) || cbLower === l)) continue;
    } else if (role === "team_lead") {
      if (!(teamMatch(teamLower, unameLower) || cbLower === unameLower)) continue;
    }

    // An explicitly empty array means "nothing selected" -> show nothing; null means no filter.
    if (Array.isArray(teamsFilter)) {
      const tf = teamsFilter.map((t) => t.toLowerCase());
      if (!tf.includes(teamLower) && !tf.includes(cbLower)) continue;
    }

    records.push(rec);
  }
  return records;
}

module.exports = { loadRecords, rowToRecord, teamMatch };
