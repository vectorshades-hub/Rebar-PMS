"use client";
import SearchableDropdown from "./SearchableDropdown";
import { SUBMISSION_TYPES, BILLABLE_TYPES } from "../lib/statusStyles";

export const EMPTY_FORM = {
  project: "",
  submission_name: "",
  unplanned: false,
  client: "",
  team: "",
  submission_type: "",
  tonnage: "",
  billable: "",
  sub_date: "",
  due_date: "",
  remarks: "",
  status_override: "",
  invoice_released: false,
};

/** yyyy-MM-dd in local time, matching what <input type="date"> expects. */
export function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Form state for an existing record (edit mode). */
export function formFromRecord(r) {
  const upper = (r.status || "").toUpperCase();
  return {
    project: r.project,
    submission_name: r.submission_name,
    unplanned: !!r.unplanned,
    client: r.client,
    team: r.team,
    submission_type: r.submission_type,
    tonnage: r.tonnage ?? 0,
    billable: r.billable || "",
    sub_date: r.sub_date_raw,
    due_date: r.due_date_raw,
    remarks: r.remarks,
    invoice_released: !!r.invoice_released,
    status_override: upper.startsWith("COMPLETED") ? "COMPLETED" : upper === "ON HOLD" ? "ON HOLD" : "",
  };
}

/** Status dropdown options — depend on the record's current status when editing. */
export function statusOptionsFor(record) {
  if (!record) {
    return [
      { value: "", label: "Auto" },
      { value: "ON HOLD", label: "ON HOLD" },
      { value: "COMPLETED", label: "COMPLETED" },
    ];
  }
  const upper = (record.status || "").toUpperCase();
  if (upper.startsWith("COMPLETED")) return [{ value: "COMPLETED", label: "COMPLETED (locked)" }];
  if (upper === "ON HOLD") {
    return [
      { value: "ON HOLD", label: "ON HOLD" },
      { value: "__RELEASE__", label: "Release Hold (recompute status)" },
      { value: "COMPLETED", label: "Mark COMPLETED" },
    ];
  }
  return [
    { value: "", label: `Auto (${record.status})` },
    { value: "COMPLETED", label: "Mark COMPLETED" },
    { value: "ON HOLD", label: "Put ON HOLD" },
  ];
}

/**
 * Add / edit form for a record. Field order mirrors the table columns:
 * Project, Submission Name, Unplanned (tick), Client, Team, Type, Tonnage, dates, status, remarks.
 */
export default function RecordForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  busy,
  projects = [],
  clients = [],
  teams = [],
  projectClientMap = {},
  statusOptions,
  lockTeam = false,
  showInvoice = false,
  submitLabel = "Add Record",
}) {
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const editing = !!onCancel;

  return (
    <form onSubmit={onSubmit} className="row g-2">
      <div className="col-md-3">
        <label className="form-label small mb-1">Project <span className="text-danger">*</span></label>
        <SearchableDropdown
          value={form.project}
          onChange={(v) => setForm((f) => ({ ...f, project: v }))}
          onSelect={(v) => {
            const client = projectClientMap[v];
            if (client) setForm((f) => ({ ...f, client }));
          }}
          options={projects}
          placeholder="Project"
          required
        />
      </div>
      <div className="col-md-3">
        <label className="form-label small mb-1">Submission Name <span className="text-danger">*</span></label>
        <input className="form-control" placeholder="Submission Name" required value={form.submission_name} onChange={set("submission_name")} />
      </div>
      <div className="col-md-2">
        <label className="form-label small mb-1">Unplanned</label>
        <label className={`unplanned-chip${form.unplanned ? " on" : ""}`}>
          <input
            type="checkbox"
            checked={!!form.unplanned}
            onChange={(e) => setForm((f) => ({ ...f, unplanned: e.target.checked }))}
          />
          <span className="unplanned-box"><i className="bi bi-check-lg" /></span>
          <span>{form.unplanned ? "Unplanned" : "Planned"}</span>
        </label>
      </div>
      <div className="col-md-2">
        <label className="form-label small mb-1">Client <span className="text-danger">*</span></label>
        <SearchableDropdown value={form.client} onChange={(v) => setForm((f) => ({ ...f, client: v }))} options={clients} placeholder="Client" required />
      </div>
      <div className="col-md-2">
        <label className="form-label small mb-1">Team <span className="text-danger">*</span></label>
        {lockTeam ? (
          <input className="form-control" value={form.team} readOnly />
        ) : (
          <SearchableDropdown value={form.team} onChange={(v) => setForm((f) => ({ ...f, team: v }))} options={teams} placeholder="Team" required />
        )}
      </div>
      <div className="col-md-2">
        <label className="form-label small mb-1">Type <span className="text-danger">*</span></label>
        <select className="form-select" required value={form.submission_type} onChange={set("submission_type")}>
          <option value="">Type…</option>
          {SUBMISSION_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="col-md-2">
        <label className="form-label small mb-1">Tonnage <span className="text-danger">*</span></label>
        <input
          type="number"
          min={0}
          step="0.01"
          required
          className="form-control"
          placeholder="Steel tonnage"
          value={form.tonnage}
          onChange={set("tonnage")}
        />
      </div>
      <div className="col-md-2">
        <label className="form-label small mb-1">Billable</label>
        <select className="form-select" value={form.billable} onChange={set("billable")}>
          <option value="">Select…</option>
          {BILLABLE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="col-md-2">
        <label className="form-label small mb-1">Submission Date</label>
        <input type="date" className="form-control" value={form.sub_date} onChange={(e) => setForm((f) => ({ ...f, sub_date: e.target.value, due_date: e.target.value }))} />
      </div>
      <div className="col-md-2">
        <label className="form-label small mb-1">Due Date</label>
        <input type="date" className="form-control" value={form.due_date} onChange={set("due_date")} />
      </div>
      <div className="col-md-2">
        <label className="form-label small mb-1">Status</label>
        <select className="form-select" value={form.status_override} onChange={set("status_override")}>
          {(statusOptions || statusOptionsFor(null)).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {showInvoice && (
        <div className="col-md-2">
          <label className="form-label small mb-1">Invoice Released</label>
          <select
            className="form-select"
            value={form.invoice_released ? "yes" : "no"}
            onChange={(e) => setForm((f) => ({ ...f, invoice_released: e.target.value === "yes" }))}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
      )}
      <div className="col-md-4">
        <label className="form-label small mb-1">Remarks</label>
        <input className="form-control" placeholder="Remarks" value={form.remarks} onChange={set("remarks")} />
      </div>
      <div className="col-md-2 d-flex align-items-end gap-2">
        <button type="submit" className={`btn ${editing ? "btn-primary" : "btn-dark"} flex-fill`} disabled={busy}>
          {editing ? "Save" : <><i className="bi bi-plus-lg" /> {submitLabel}</>}
        </button>
        {editing && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </form>
  );
}
