"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Modal from "../../components/Modal";
import RecordForm, { formFromRecord, statusOptionsFor } from "../../components/RecordForm";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../lib/ToastContext";
import { useDashboardConfig, useMasterLists, useUpdateRecord } from "../../hooks/useRecords";
import AppLayout from "../../components/AppLayout";
import PageHero from "../../components/PageHero";
import StatPill from "../../components/StatPill";
import StatusBadge from "../../components/StatusBadge";
import { UnplannedBadge, TypePill, Tonnage, BillablePill, InvoiceReleased } from "../../components/RecordCells";
import { api, ApiError } from "../../lib/api";
import { SUBMISSION_TYPES, BILLABLE_TYPES } from "../../lib/statusStyles";

const COLUMNS = [
  ["project", "Project"],
  ["submission", "Submission Name"],
  [null, "Unplanned"],
  ["client", "Client"],
  ["type", "Type"],
  ["tonnage", "Tonnage"],
  ["team", "Team"],
  ["due_date", "Due Date"],
  ["completed", "Completed At"],
  [null, "Status"],
  ["billable", "Billable"],
  [null, "Invoice Released"],
];
const EDIT_COLUMN = [null, ""];

function CompletedLog() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const canEdit = !!user.permissions?.editCompletedLog;
  const { data: lists } = useMasterLists();
  const { data: config } = useDashboardConfig(user.username);
  const updateMutation = useUpdateRecord();
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const projectClientMap = Object.fromEntries((lists?.projectDetails || []).filter((p) => p.client).map((p) => [p.name, p.client]));

  async function submitEdit(e) {
    e.preventDefault();
    try {
      const res = await updateMutation.mutateAsync({ id: editing.id, body: editForm });
      toast.success(res.message);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["completed-log"] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update record.");
    }
  }

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [billable, setBillable] = useState("");
  const [lateOnly, setLateOnly] = useState(false);
  const [range, setRange] = useState({ from: "", to: "" });
  const [sort, setSort] = useState({ col: "completed", dir: "desc" });

  const params = {
    page, search, type, billable,
    late: lateOnly ? "1" : "",
    date_from: range.from, date_to: range.to,
    sort: sort.col, dir: sort.dir,
  };
  const [exporting, setExporting] = useState(false);
  async function exportExcel() {
    setExporting(true);
    try {
      await api.download("/completed-log/export", { params: { ...params, page: "" } });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }
  const { data, isFetching } = useQuery({
    queryKey: ["completed-log", params],
    queryFn: () => api.get("/completed-log", params),
    placeholderData: (prev) => prev,
  });
  const records = data?.records || [];
  const stats = data?.stats;
  const filtersActive = search || type || billable || lateOnly || range.from || range.to;

  const reset = (fn) => (v) => { fn(v); setPage(1); };
  function toggleSort(col) {
    if (!col) return;
    setSort((p) => (p.col === col ? { col, dir: p.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" }));
    setPage(1);
  }
  const arrow = (col) => (sort.col === col ? (sort.dir === "asc" ? "▲" : "▼") : "⇅");

  return (
    <div>
      <PageHero
        theme="emerald"
        icon="bi-check2-square"
        title="Completed Log"
        meta="Every completed submission, grouped under its project — newest completion first"
      />

      <div className="d-flex flex-wrap gap-2 mb-3">
        <StatPill num={stats?.total ?? 0} label="Completed" />
        <StatPill num={stats?.projects ?? 0} label="Projects" color="#0f766e" />
        <StatPill num={(stats?.total_tonnage ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} label="Total Tonnage" />
        <StatPill num={stats?.late ?? 0} label="Completed Late" color="#135d8f" active={lateOnly} onClick={() => reset(setLateOnly)(!lateOnly)} />
      </div>

      <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
        <div className="section-title mb-0"><i className="bi bi-table" /> Log ({data?.total ?? 0} record{data?.total === 1 ? "" : "s"})</div>
        <div className="ms-auto d-flex flex-wrap gap-2 align-items-center">
          <select className="form-select form-select-sm" style={{ width: "auto" }} value={type} onChange={(e) => reset(setType)(e.target.value)} aria-label="Filter by type">
            <option value="">All types</option>
            {SUBMISSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="form-select form-select-sm" style={{ width: "auto" }} value={billable} onChange={(e) => reset(setBillable)(e.target.value)} aria-label="Filter by billable">
            <option value="">All billable</option>
            {BILLABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className={`date-range-inline${range.from || range.to ? " active" : ""}`} title="Completed date range">
            <i className="bi bi-calendar3 date-range-icon" />
            <input type="date" className="date-range-input" value={range.from} onChange={(e) => reset(setRange)({ ...range, from: e.target.value })} aria-label="Completed from" />
            <i className="bi bi-arrow-right date-range-sep" />
            <i className="bi bi-calendar3 date-range-icon" />
            <input type="date" className="date-range-input" value={range.to} onChange={(e) => reset(setRange)({ ...range, to: e.target.value })} aria-label="Completed to" />
          </div>
          <div className="position-relative">
            <i className="bi bi-search position-absolute text-muted" style={{ left: 10, top: 8, fontSize: "0.8rem" }} />
            <input className="form-control" style={{ maxWidth: 220, paddingLeft: 28 }} placeholder="Search…" value={search} onChange={(e) => reset(setSearch)(e.target.value)} />
          </div>
          <button type="button" className="btn btn-sm btn-success" disabled={exporting || !data?.total} onClick={exportExcel}>
            <i className="bi bi-file-earmark-excel" /> {exporting ? "Exporting..." : "Export to Excel"}
          </button>
          {filtersActive && (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setSearch(""); setType(""); setBillable(""); setLateOnly(false); setRange({ from: "", to: "" }); setPage(1); }}>
              <i className="bi bi-x-circle" /> Reset
            </button>
          )}
        </div>
      </div>

      <div className="table-wrap table-wrap-page-sticky theme-emerald">
        <table className="table table-sm table-hover mb-0 records-table">
          <thead>
            <tr>
              <th>#</th>
              {(canEdit ? [...COLUMNS, EDIT_COLUMN] : COLUMNS).map(([key, label]) => (
                <th key={label} onClick={() => toggleSort(key)} className={label === "Tonnage" ? "text-center" : ""} style={{ cursor: key ? "pointer" : "default" }}>
                  {label} {key ? arrow(key) : ""}
                </th>
              ))}
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
                <td>{r.team}</td>
                <td>{r.due_date}</td>
                <td>{r.completed_at_fmt}</td>
                <td><StatusBadge status={r.status} tag={r.tag} /></td>
                <td><BillablePill value={r.billable} /></td>
                <td><InvoiceReleased value={r.invoice_released} canEdit={false} /></td>
                {canEdit && (
                  <td className="text-end">
                    <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => { setEditing(r); setEditForm(formFromRecord(r)); }}>
                      <i className="bi bi-pencil" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!records.length && !isFetching && (
              <tr><td colSpan={COLUMNS.length + 2} className="text-center text-muted py-4">No completed submissions yet.</td></tr>
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

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit Record #${editing.id}` : ""} maxWidth="1100px">
        {editing && editForm && (
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
            lockTeam={user.role === "team_lead"}
            showInvoice={!!user.permissions?.editInvoiceReleased}
          />
        )}
      </Modal>
    </div>
  );
}

/** Admin / management / team leads, plus users granted Completed Log editing in Settings. */
function Guard({ children }) {
  const { user } = useAuth();
  const router = useRouter();
  const ok = ["admin", "management", "team_lead"].includes(user?.role) || !!user?.permissions?.editCompletedLog;
  useEffect(() => {
    if (user && !ok) router.replace("/");
  }, [user, ok, router]);
  return ok ? children : null;
}

export default function CompletedLogPage() {
  return (
    <AppLayout allow={["admin", "management", "team_lead", "user"]}>
      <Guard><CompletedLog /></Guard>
    </AppLayout>
  );
}
