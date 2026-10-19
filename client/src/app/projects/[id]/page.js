"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "../../../components/AppLayout";
import PageHero from "../../../components/PageHero";
import StatPill from "../../../components/StatPill";
import StatusBadge from "../../../components/StatusBadge";
import Modal from "../../../components/Modal";
import ProjectLifecycle from "../../../components/ProjectLifecycle";
import RecordDetailsModal from "../../../components/RecordDetailsModal";
import { ChangeOrdersPanel, RfiPanel, ProjectImagePanel, fmtDay } from "../../../components/ProjectItems";
import RecordForm, { formFromRecord, statusOptionsFor } from "../../../components/RecordForm";
import { useAuth } from "../../../lib/AuthContext";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../lib/ToastContext";
import { useDashboardConfig, useMasterLists, useUpdateRecord, useDeleteRecord } from "../../../hooks/useRecords";

const TAG_LABELS = {
  overdue: "Overdue",
  duesoon: "Due Soon",
  ontrack: "On Track",
  completed: "Completed",
  completed_overdue: "Completed Overdue",
  hold: "On Hold",
  nodue: "No Due",
};
const isCompleted = (r) => r.tag === "completed" || r.tag === "completed_overdue";
const unique = (arr) => [...new Set(arr.filter(Boolean))];

function PanelHeader({ icon, color, title, subtitle, count }) {
  return (
    <div className={`detail-panel-header dp-header-${color}`}>
      <div className="dp-header-row">
        <div className="dp-header-left">
          <div className={`dp-icon dp-icon-${color}`}><i className={`bi ${icon}`} /></div>
          <div>
            <div className="dp-header-title">{title}{count != null && <span className="dp-count-badge">{count}</span>}</div>
            {subtitle && <div className="dp-header-subtitle">{subtitle}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="dp-field-label">{label}</div>
      <div className="dp-field-value">{children || "—"}</div>
    </div>
  );
}

function ProjectDetail({ id }) {
  const { user } = useAuth();
  const toast = useToast();
  const perms = user.permissions || {};

  const { data, isLoading, error } = useQuery({
    queryKey: ["project-detail", id],
    queryFn: () => api.get(`/projects/${id}`),
    retry: false,
  });
  const { data: lists } = useMasterLists();
  const { data: config } = useDashboardConfig(user.username);
  const updateMutation = useUpdateRecord();
  const deleteMutation = useDeleteRecord();

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [doneFilter, setDoneFilter] = useState("");
  const [coSignal, setCoSignal] = useState(0);
  const [rfiSignal, setRfiSignal] = useState(0);

  if (isLoading) return <div className="text-center py-5"><div className="spinner-border text-secondary" /></div>;
  if (error || !data) {
    return (
      <div className="alert alert-warning">
        {error instanceof ApiError ? error.message : "Project not found."} <a href="/">Back to records</a>
      </div>
    );
  }

  const { project, records } = data;
  const changeOrders = data.change_orders || [];
  const rfis = data.rfis || [];
  const canEditRow = () => !!perms.editRecords;
  const projectClientMap = Object.fromEntries((lists?.projectDetails || []).filter((p) => p.client).map((p) => [p.name, p.client]));

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

  async function confirmDelete() {
    try {
      const res = await deleteMutation.mutateAsync({ id: deleteTarget.id });
      toast.success(res.message);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete record.");
    }
  }

  const visible = records.filter(
    (r) =>
      (!typeFilter || r.submission_type === typeFilter) &&
      (!doneFilter || (doneFilter === "completed" ? isCompleted(r) : !isCompleted(r)))
  );
  const subDates = records.map((r) => r.sub_date_raw).filter(Boolean).sort();
  const startRecord = records.find((r) => r.sub_date_raw && r.sub_date_raw === subDates[0]);
  const tagCounts = {};
  for (const r of records) tagCounts[r.tag] = (tagCounts[r.tag] || 0) + 1;
  // "MM-DD-YYYY HH:MM:SS" (records) -> ISO so every activity source sorts and formats the same way.
  const recordTs = (r) => {
    const m = /^(\d{2})-(\d{2})-(\d{4}) (.*)$/.exec(r.created_at || "");
    return m ? `${m[3]}-${m[1]}-${m[2]}T${m[4]}` : "";
  };
  const recent = [
    ...records.map((r) => ({ key: `s${r.id}`, ts: recordTs(r), by: r.created_by, title: `Submission #${r.id} (${r.submission_type}) created` })),
    ...changeOrders.map((c) => ({ key: `c${c.id}`, ts: c.created_at, by: c.created_by, title: `${c.kind} ${c.co_number} "${c.change}" created` })),
    ...rfis.map((r) => ({ key: `r${r.id}`, ts: r.created_at, by: r.created_by, title: `${r.type} "${r.title}" created` })),
  ]
    .sort((a, b) => (b.ts > a.ts ? 1 : b.ts < a.ts ? -1 : 0))
    .slice(0, 6);
  const doneCount = (tagCounts.completed || 0) + (tagCounts.completed_overdue || 0);
  const totalTons = records.reduce((n, r) => n + (r.tonnage || 0), 0);

  return (
    <div>
      <PageHero
        theme="navy"
        icon="bi-folder-fill"
        title={`Project: ${project.name}`}
        meta={`${records.length} submission${records.length === 1 ? "" : "s"}`}
      />

      {editing && editForm && (
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
            lockTeam={user.role === "team_lead"}
            showInvoice={!!perms.editInvoiceReleased}
          />
        </div>
      )}

      <ProjectLifecycle projectId={project.id} lifecycle={project.lifecycle} records={records} canManage={["admin", "management", "team_lead"].includes(user.role)} canAdd={!!perms.addRecords} onNewCo={() => setCoSignal((n) => n + 1)} onNewRfi={() => setRfiSignal((n) => n + 1)} />

      <div className="detail-grid">
        <div className="detail-main">
          <div className="detail-panel">
            <PanelHeader icon="bi-list-ul" color="blue" title="Submission Details" subtitle="Every submission in this project" count={records.length} />
            <div className="detail-panel-body">
              <div className="d-flex flex-wrap gap-2 mb-3">
                <select className="form-select form-select-sm" style={{ width: "auto" }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by type">
                  <option value="">All types</option>
                  {unique(records.map((r) => r.submission_type)).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select className="form-select form-select-sm" style={{ width: "auto" }} value={doneFilter} onChange={(e) => setDoneFilter(e.target.value)} aria-label="Filter by completion">
                  <option value="">Completed &amp; not completed</option>
                  <option value="completed">Completed</option>
                  <option value="open">Not completed</option>
                </select>
              </div>
              <div className="submission-row-list">
                {visible.map((r) => (
                  <div key={r.id} className="submission-row">
                    <div className="submission-row-main">
                      <span className="submission-row-name">{r.submission_name}</span>
                      <span className="submission-row-type">{r.submission_type}</span>
                    </div>
                    <div className="submission-row-right">
                      <span className="submission-row-date">{r.due_date}</span>
                      <StatusBadge status={r.status} tag={r.tag} />
                      <button className="btn btn-sm btn-outline-secondary" title="View details" onClick={() => setViewTarget(r)}>
                        <i className="bi bi-info-circle" />
                      </button>
                      {canEditRow(r) && (
                        <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => { setEditing(r); setEditForm(formFromRecord(r)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                          <i className="bi bi-pencil" />
                        </button>
                      )}
                      {perms.deleteRecords && (
                        <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => setDeleteTarget(r)}>
                          <i className="bi bi-trash" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {!visible.length && (
                  <div className="text-center text-muted py-4">
                    {records.length ? "No submissions match these filters." : "No submissions linked to this project yet."}
                  </div>
                )}
              </div>
              <div className="d-flex flex-wrap gap-2 mt-3 pt-3 border-top">
                <StatPill num={records.length} label="Total" />
                <StatPill num={tagCounts.overdue || 0} label="Overdue" color="#e74c3c" />
                <StatPill num={tagCounts.duesoon || 0} label="Due Soon" color="#e67e22" />
                <StatPill num={tagCounts.ontrack || 0} label="On Track" color="#27ae60" />
                <StatPill num={doneCount} label="Completed" color="#3498db" />
                <StatPill num={tagCounts.hold || 0} label="On Hold" color="#7c3aed" />
              </div>
            </div>
          </div>

          <div className="co-rfi-row">
            <ChangeOrdersPanel openSignal={coSignal} projectId={project.id} items={changeOrders} records={records} canWrite={!!perms.addRecords} canDelete={!!perms.deleteRecords} canViewAmounts={!!perms.viewAmounts} />
            <RfiPanel openSignal={rfiSignal} projectId={project.id} items={rfis} records={records} canWrite={!!perms.addRecords} canDelete={!!perms.deleteRecords} />
          </div>
        </div>

        <div className="detail-side">
          <ProjectImagePanel projectId={project.id} image={data.image} canEdit={!!perms.manageProjects} />

          <div className="detail-panel">
            <PanelHeader icon="bi-info-circle-fill" color="navy" title="Project Details" subtitle="Key info about this project" />
            <div className="detail-panel-body">
              <div className="dp-fields-grid">
                <Field label="Client">{project.client}</Field>
                <Field label="Team">{unique(records.map((r) => r.team)).join(", ")}</Field>
                <Field label="Start Date">{startRecord?.sub_date}</Field>
                <Field label="Type">{unique(records.map((r) => r.submission_type)).join(", ")}</Field>
                <Field label="Created By">{unique(records.map((r) => r.created_by)).join(", ")}</Field>
                <Field label="Total Tons">{totalTons.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Field>
              </div>
              {project.description && <div className="dp-note">{project.description}</div>}
              <div className="dp-tags">
                {Object.entries(tagCounts).map(([tag, n]) => (
                  <span key={tag} className={`badge badge-${tag}`}>{n} {TAG_LABELS[tag] || tag}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="detail-panel">
            <PanelHeader icon="bi-clock-history" color="teal" title="Activity" subtitle="Recent updates and changes" />
            <div className="detail-panel-body">
              {recent.map((a) => (
                <div key={a.key} className="activity-item">
                  <span className="activity-dot" />
                  <div>
                    <div className="activity-title">{a.title}</div>
                    <div className="activity-meta">{a.by || "—"} · {fmtDay(a.ts.slice(0, 10))}</div>
                  </div>
                </div>
              ))}
              {!recent.length && <div className="text-muted small">No activity yet.</div>}
            </div>
          </div>
        </div>
      </div>

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
        <p className="mb-0">Delete record #{deleteTarget?.id} ({deleteTarget?.submission_name})? This cannot be undone.</p>
      </Modal>
    </div>
  );
}

export default function ProjectDetailPage({ params }) {
  return (
    <AppLayout>
      <ProjectDetail id={params.id} />
    </AppLayout>
  );
}
