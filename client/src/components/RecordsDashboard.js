"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { ApiError } from "../lib/api";
import {
  useRecordsQuery,
  useDashboardConfig,
  useMasterLists,
  useAddRecord,
  useUpdateRecord,
  useDeleteRecord,
  useInvoiceReleased,
} from "../hooks/useRecords";
import StatusBadge from "./StatusBadge";
import { UnplannedBadge, TypePill, Tonnage, BillablePill, InvoiceReleased } from "./RecordCells";
import Modal from "./Modal";
import RecordDetailsModal from "./RecordDetailsModal";
import RecordForm, { EMPTY_FORM, todayISO, formFromRecord, statusOptionsFor } from "./RecordForm";
import { SUBMISSION_TYPES, BILLABLE_TYPES } from "../lib/statusStyles";
import { useToast } from "../lib/ToastContext";

const STATUS_FILTERS = [
  ["", "All statuses"],
  ["overdue", "Overdue"],
  ["duesoon", "Due soon"],
  ["ontrack", "On track"],
  ["hold", "On hold"],
  ["completed", "Completed"],
];

/** The records index shown right after login — shared by every role, branches on `user.permissions`. */
export default function RecordsDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const perms = user.permissions || {};
  const role = user.role;

  const { data: lists } = useMasterLists();
  const projectClientMap = useMemo(() => {
    const map = {};
    for (const p of lists?.projectDetails || []) if (p.client) map[p.name] = p.client;
    return map;
  }, [lists]);

  const { data: config } = useDashboardConfig(user.username);
  const [selectedTeams, setSelectedTeams] = useState(null);
  useEffect(() => {
    if (config && selectedTeams === null) setSelectedTeams(config.selectedTeams || []);
  }, [config, selectedTeams]);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ col: "", dir: "asc" });
  const [typeFilter, setTypeFilter] = useState("");
  const [billableFilter, setBillableFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [unplannedOnly, setUnplannedOnly] = useState(false);
  const [customRange, setCustomRange] = useState({ from: "", to: "" });

  const queryParams = {
    page,
    search,
    teams: (selectedTeams || []).join(","),
    sort: sort.col,
    dir: sort.dir,
    type: typeFilter,
    billable: billableFilter,
    tag: tagFilter,
    unplanned: unplannedOnly ? "1" : "",
    date_from: customRange.from,
    date_to: customRange.to,
  };
  const { data, isFetching } = useRecordsQuery(selectedTeams === null ? null : queryParams);
  const records = data?.records || [];

  const defaultTeam = role === "team_lead" ? user.username : "";
  const freshForm = (team = defaultTeam) => ({ ...EMPTY_FORM, sub_date: todayISO(), due_date: todayISO(), team });

  // ── Add ────────────────────────────────────────────────
  const [addForm, setAddForm] = useState(() => freshForm());
  const addMutation = useAddRecord();
  async function submitAdd(e) {
    e.preventDefault();
    try {
      const res = await addMutation.mutateAsync(addForm);
      toast.success(res.message);
      setAddForm(freshForm(addForm.team));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add record.");
    }
  }

  // ── Edit ───────────────────────────────────────────────
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const updateMutation = useUpdateRecord();
  // Edit / delete / invoice-released are per-user grants from Settings (admin always has them).
  const canEditRow = () => !!perms.editRecords;
  const invoiceMutation = useInvoiceReleased();
  async function setInvoice(r, value) {
    try {
      await invoiceMutation.mutateAsync({ id: r.id, value });
      toast.success(`Invoice Released set to ${value ? "Yes" : "No"} for #${r.id}.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update Invoice Released.");
    }
  }
  function openEdit(r) {
    setEditing(r);
    setEditForm(formFromRecord(r));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function submitEdit(e) {
    e.preventDefault();
    try {
      const res = await updateMutation.mutateAsync({ id: editing.id, body: editForm });
      toast.success(res.message);
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update record.");
    }
  }

  // ── View details (admin) ───────────────────────────────
  const [viewTarget, setViewTarget] = useState(null);

  // ── Delete ─────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState(null);
  const deleteMutation = useDeleteRecord();
  async function confirmDelete() {
    try {
      const res = await deleteMutation.mutateAsync({ id: deleteTarget.id });
      toast.success(res.message);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete record.");
    }
  }

  function toggleTeam(t) {
    setSelectedTeams((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
    setPage(1);
  }
  function toggleSort(col) {
    setSort((prev) => (prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" }));
    setPage(1);
  }
  const arrow = (col) => (sort.col === col ? (sort.dir === "asc" ? "▲" : "▼") : "⇅");
  const filtersActive = typeFilter || billableFilter || tagFilter || unplannedOnly || customRange.from || customRange.to || search;

  return (
    <div>
      {perms.addRecords && (
        <div className="card-form">
          <div className="section-title"><i className="bi bi-plus-circle" /> Add New Record</div>
          <RecordForm
            form={addForm}
            setForm={setAddForm}
            onSubmit={submitAdd}
            busy={addMutation.isPending}
            projects={lists?.projects || []}
            clients={lists?.clients || []}
            teams={config?.selectableTeams || []}
            projectClientMap={projectClientMap}
            lockTeam={role === "team_lead"}
          />
        </div>
      )}

      {editing && (
        <div id="editPanel" className="visible">
          <div className="section-title">Edit Record #{editing.id}</div>
          <RecordForm
            form={editForm}
            setForm={setEditForm}
            onSubmit={submitEdit}
            onCancel={() => setEditing(null)}
            busy={updateMutation.isPending}
            projects={lists?.projects || []}
            clients={lists?.clients || []}
            teams={config?.selectableTeams || []}
            projectClientMap={projectClientMap}
            statusOptions={statusOptionsFor(editing)}
            lockTeam={role === "team_lead"}
            showInvoice={!!perms.editInvoiceReleased}
          />
        </div>
      )}

      {config?.showTeamSelector && (config.selectableTeams || []).length > 0 && (
        <div className="card-form">
          <div className="section-title"><i className="bi bi-people" /> Select Teams</div>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            {config.selectableTeams.map((t) => (
              <button
                key={t}
                type="button"
                className={`team-btn${(selectedTeams || []).includes(t) ? " selected" : ""}`}
                onClick={() => toggleTeam(t)}
              >
                <i className="bi bi-person-fill" />
                {t}
                {t === user.username ? " (you)" : ""}
              </button>
            ))}
          </div>
          <div className="d-flex gap-2 align-items-center mt-2">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setSelectedTeams(config.selectableTeams); setPage(1); }}>
              <i className="bi bi-check2-all" /> Select All
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setSelectedTeams([]); setPage(1); }}>
              <i className="bi bi-x-circle" /> Clear
            </button>
            <span className="text-muted small ms-2">{(selectedTeams || []).length} selected</span>
          </div>
        </div>
      )}

      <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
        <div className="section-title mb-0">
          <i className="bi bi-table" /> Records ({data?.total ?? 0} record{data?.total === 1 ? "" : "s"})
        </div>
        <div className="ms-auto d-flex flex-wrap gap-2 align-items-center">
          <select className="form-select form-select-sm" style={{ width: "auto" }} value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} aria-label="Filter by type">
            <option value="">All types</option>
            {SUBMISSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="form-select form-select-sm" style={{ width: "auto" }} value={billableFilter} onChange={(e) => { setBillableFilter(e.target.value); setPage(1); }} aria-label="Filter by billable">
            <option value="">All billable</option>
            {BILLABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="form-select form-select-sm" style={{ width: "auto" }} value={tagFilter} onChange={(e) => { setTagFilter(e.target.value); setPage(1); }} aria-label="Filter by status">
            {STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="d-flex align-items-center gap-1 small mb-0">
            <input type="checkbox" className="form-check-input mt-0" checked={unplannedOnly} onChange={(e) => { setUnplannedOnly(e.target.checked); setPage(1); }} />
            Unplanned only
          </label>
          <div className={`date-range-inline${customRange.from || customRange.to ? " active" : ""}`}>
            <i className="bi bi-calendar3 date-range-icon" />
            <input type="date" className="date-range-input" value={customRange.from} onChange={(e) => { setCustomRange({ ...customRange, from: e.target.value }); setPage(1); }} aria-label="From date" />
            <i className="bi bi-arrow-right date-range-sep" />
            <i className="bi bi-calendar3 date-range-icon" />
            <input type="date" className="date-range-input" value={customRange.to} onChange={(e) => { setCustomRange({ ...customRange, to: e.target.value }); setPage(1); }} aria-label="To date" />
            {(customRange.from || customRange.to) && (
              <button type="button" className="date-range-clear" onClick={() => { setCustomRange({ from: "", to: "" }); setPage(1); }} aria-label="Clear date range">
                <i className="bi bi-x-lg" />
              </button>
            )}
          </div>
          <div className="position-relative">
            <i className="bi bi-search position-absolute text-muted" style={{ left: 10, top: 8, fontSize: "0.8rem" }} />
            <input
              className="form-control"
              style={{ maxWidth: 220, paddingLeft: 28 }}
              placeholder="Search…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          {filtersActive && (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => { setSearch(""); setTypeFilter(""); setBillableFilter(""); setTagFilter(""); setUnplannedOnly(false); setCustomRange({ from: "", to: "" }); setPage(1); }}
            >
              <i className="bi bi-x-circle" /> Reset
            </button>
          )}
        </div>
      </div>

      <div className="table-wrap table-wrap-page-sticky">
        <table className="table table-sm table-hover mb-0 records-table">
          <thead>
            <tr>
              <th>#</th>
              {[
                ["project", "Project"],
                ["submission", "Submission Name"],
                ["unplanned", "Unplanned"],
                ["client", "Client"],
                ["type", "Type"],
                ["tonnage", "Tonnage"],
                ["team", "Team"],
                ["sub_date", "Sub Date"],
                ["due_date", "Due Date"],
              ].map(([key, label]) => (
                <th key={key} onClick={() => toggleSort(key)} className={key === "tonnage" ? "text-center" : ""} style={{ cursor: "pointer" }}>
                  {label} {arrow(key)}
                </th>
              ))}
              <th>Remarks</th>
              <th onClick={() => toggleSort("status")} style={{ cursor: "pointer" }}>Status {arrow("status")}</th>
              <th onClick={() => toggleSort("billable")} style={{ cursor: "pointer" }}>Billable {arrow("billable")}</th>
              <th className="text-center" onClick={() => toggleSort("invoice")} style={{ cursor: "pointer" }}>Invoice Released {arrow("invoice")}</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} className={r.tag}>
                <td className="cell-muted">{r.row_number}</td>
                <td><a className="proj-link" href={`/projects/${r.project_id}`}>{r.project}</a></td>
                <td className="fw-semibold">{r.submission_name}</td>
                <td><UnplannedBadge value={r.unplanned} /></td>
                <td>{r.client}</td>
                <td><TypePill type={r.submission_type} /></td>
                <td className="text-center"><Tonnage value={r.tonnage} /></td>
                <td>{role === "admin" ? r.team : <span className="badge bg-dark">{r.team}</span>}</td>
                <td>{r.sub_date}</td>
                <td>{r.due_date}</td>
                <td className="cell-remarks" title={r.remarks}>{r.remarks || <span className="cell-muted">—</span>}</td>
                <td><StatusBadge status={r.status} tag={r.tag} /></td>
                <td><BillablePill value={r.billable} /></td>
                <td className="text-center"><InvoiceReleased value={r.invoice_released} canEdit={!!perms.editInvoiceReleased} onChange={(v) => setInvoice(r, v)} /></td>
                <td className="text-nowrap">
                  <button className="btn btn-sm btn-outline-secondary me-1" title="View details" onClick={() => setViewTarget(r)}>
                    <i className="bi bi-eye" />
                  </button>

                  {canEditRow(r) && (
                    <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => openEdit(r)}>
                      <i className="bi bi-pencil" />
                    </button>
                  )}
                  {perms.deleteRecords && (
                    <button className="btn btn-sm btn-outline-danger ms-1" title="Delete" onClick={() => setDeleteTarget(r)}>
                      <i className="bi bi-trash" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!records.length && !isFetching && (
              <tr>
                <td colSpan={15} className="text-center text-muted py-4">No records to show.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <nav className="mt-2">
          <ul className="pagination pagination-sm">
            <li className={`page-item${page <= 1 ? " disabled" : ""}`}>
              <button className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
            </li>
            {Array.from({ length: data.pages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === data.pages || Math.abs(p - page) <= 2)
              .map((p, idx, arr) => (
                <span key={p} style={{ display: "contents" }}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && <li className="page-item disabled"><span className="page-link">…</span></li>}
                  <li className={`page-item${p === page ? " active" : ""}`}>
                    <button className="page-link" onClick={() => setPage(p)}>{p}</button>
                  </li>
                </span>
              ))}
            <li className={`page-item${page >= data.pages ? " disabled" : ""}`}>
              <button className="page-link" onClick={() => setPage((p) => Math.min(data.pages, p + 1))}>Next</button>
            </li>
          </ul>
        </nav>
      )}

      <RecordDetailsModal record={viewTarget} onClose={() => setViewTarget(null)} />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Record"
        theme="danger"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={confirmDelete} disabled={deleteMutation.isPending}>Delete</button>
          </>
        }
      >
        <p className="mb-0">Delete record #{deleteTarget?.id} ({deleteTarget?.project})? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
