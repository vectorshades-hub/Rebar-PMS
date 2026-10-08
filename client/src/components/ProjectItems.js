"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Modal from "./Modal";
import SearchableDropdown from "./SearchableDropdown";
import { api, ApiError, API_URL } from "../lib/api";
import { useToast } from "../lib/ToastContext";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-30" -> "Sep 30, 2026" */
export function fmtDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[3]}, ${m[1]}` : "";
}
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const money = (currency, n) => `${currency} ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tons = (n) => (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function useItemMutation(fn) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ["project-detail"] }) });
}

function errMsg(err, fallback) {
  return err instanceof ApiError ? err.message : fallback;
}

/** Plain white-header modal shared by the CO/PO and RFI forms (see .co-modal in globals.css). */
function FormModal({ open, onClose, icon, iconClass = "", title, subtitle, maxWidth, onSubmit, busy, submitLabel, submitClass, children }) {
  if (!open) return null;
  // Portal to <body>: inside .detail-panel (overflow:hidden + hover transform) a fixed modal gets trapped and clipped.
  return createPortal(
    <div className="st-modal-backdrop co-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="st-modal co-modal" style={maxWidth ? { maxWidth } : undefined} onSubmit={onSubmit}>
        <div className="co-modal-header">
          <div className={`co-modal-header-icon ${iconClass}`}><i className={`bi ${icon}`} /></div>
          <div>
            <div className="co-modal-title">{title}</div>
            <div className="co-modal-subtitle">{subtitle}</div>
          </div>
          <button type="button" className="co-modal-close" aria-label="Close" onClick={onClose}><i className="bi bi-x-lg" /></button>
        </div>
        <div className="st-modal-body">{children}</div>
        <div className="st-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className={`btn ${submitClass}`} disabled={busy}>{submitLabel}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}

/** Search-and-add picker for linking this project's submissions to a CO/PO or RFI. */
function LinkedSubmissions({ records, value, onChange }) {
  const [query, setQuery] = useState("");
  const label = (r) => `#${r.id} ${r.submission_name}`;
  const byLabel = new Map(records.map((r) => [label(r), r]));
  // Only open submissions can be newly linked; already-linked completed ones stay visible below.
  const isDone = (r) => r.tag === "completed" || r.tag === "completed_overdue";
  const options = records.filter((r) => !isDone(r) && !value.includes(Number(r.id))).map(label);
  const selected = value.map((id) => records.find((r) => Number(r.id) === id)).filter(Boolean);
  return (
    <div className="mb-3">
      <label className="form-label fw-semibold co-linked-label">
        Linked Submissions <span className="co-optional-label">optional</span>
        {selected.length > 0 && <span className="co-linked-count">{selected.length} linked</span>}
      </label>
      <div className="co-link-search">
        <i className="bi bi-search co-link-search-icon" />
        <SearchableDropdown
          value={query}
          onChange={setQuery}
          onSelect={(opt) => {
            const r = byLabel.get(opt);
            if (r) onChange([...value, Number(r.id)]);
            setQuery("");
          }}
          options={options}
          placeholder="Search by submission # or name..."
        />
      </div>
      {selected.length > 0 && (
        <div className="co-linked-submissions">
          {selected.map((r) => (
            <div key={r.id} className="co-linked-row">
              <div className="co-linked-row-icon"><i className="bi bi-file-earmark-text" /></div>
              <div className="co-linked-row-name"><span className="co-linked-row-id">#{r.id}</span> {r.submission_name}</div>
              <div className="co-linked-row-meta">
                <span className="submission-row-date">{r.due_date}</span>
                <button type="button" className="co-link-remove" aria-label="Unlink" onClick={() => onChange(value.filter((x) => x !== Number(r.id)))}>
                  <i className="bi bi-x-lg" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Header({ icon, color, title, subtitle, count, actions }) {
  return (
    <div className={`detail-panel-header dp-header-${color}`}>
      <div className="dp-header-row">
        <div className="dp-header-left">
          <div className={`dp-icon dp-icon-${color}`}><i className={`bi ${icon}`} /></div>
          <div>
            <div className="dp-header-title">{title}{count != null && <span className="dp-count-badge">{count}</span>}</div>
            <div className="dp-header-subtitle">{subtitle}</div>
          </div>
        </div>
        <div className="dp-header-actions">{actions}</div>
      </div>
    </div>
  );
}

function FilterBar({ options, value, onChange }) {
  return (
    <div className="rfi-filter-bar">
      <span className="rfi-filter-label">Filter:</span>
      {options.map(([key, label, icon]) => (
        <button key={key} type="button" className={`rfi-filter-pill${value === key ? " active" : ""}`} onClick={() => onChange(key)}>
          {icon && <i className={`bi ${icon}`} />} {label}
        </button>
      ))}
    </div>
  );
}

function downloadCsv(filename, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ConfirmDelete({ target, label, onClose, onConfirm, busy }) {
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={`Delete ${label}`}
      theme="danger"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>Delete</button>
        </>
      }
    >
      <p className="mb-0">Delete {target?.name}? This cannot be undone.</p>
    </Modal>
  );
}

// ── CO / PO ───────────────────────────────────────────────────────────────
const CO_STATUS = {
  pending: { label: "Pending", icon: "bi-hourglass-split", cls: "co-status-pending" },
  sent_finance: { label: "Sent to Finance", icon: "bi-send", cls: "co-status-sent" },
  finance_approved: { label: "Finance Approved", icon: "bi-bank", cls: "co-status-finance" },
};
const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "INR", "AUD"];
const blankCo = () => ({ kind: "CO", co_number: "", date: todayISO(), change: "", notes: "", linked_submissions: [], tonnage: "", currency: "USD", rate_per_ton: "", status: "pending" });

export function ChangeOrdersPanel({ projectId, items, records, canWrite, canDelete, openSignal = 0 }) {
  const toast = useToast();
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState(null); // null = closed; { id?, ...fields }
  // A bump of `openSignal` (e.g. the lifecycle header's button) opens a blank form.
  useEffect(() => {
    if (openSignal) setForm(blankCo());
  }, [openSignal]);
  const [del, setDel] = useState(null);
  const save = useItemMutation((f) =>
    f.id ? api.put(`/projects/${projectId}/change-orders/${f.id}`, f) : api.post(`/projects/${projectId}/change-orders`, f)
  );
  const remove = useItemMutation((id) => api.delete(`/projects/${projectId}/change-orders/${id}`));

  const shown = items.filter((c) => filter === "all" || c.status === filter);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const total = (Number(form?.tonnage) || 0) * (Number(form?.rate_per_ton) || 0);

  async function submit(e) {
    e.preventDefault();
    try {
      toast.success((await save.mutateAsync(form)).message);
      setForm(null);
    } catch (err) {
      toast.error(errMsg(err, "Failed to save."));
    }
  }
  async function confirmDelete() {
    try {
      toast.success((await remove.mutateAsync(del.id)).message);
      setDel(null);
    } catch (err) {
      toast.error(errMsg(err, "Failed to delete."));
    }
  }
  function exportCsv() {
    downloadCsv("co-po.csv", [
      ["Type", "Number", "Date", "Change", "Status", "Tonnage", "Currency", "Rate per ton", "Total", "Notes", "Linked submissions", "Created by"],
      ...items.map((c) => [c.kind, c.co_number, c.date, c.change, CO_STATUS[c.status]?.label, c.tonnage, c.currency, c.rate_per_ton, c.total, c.notes, c.linked_submissions.map((l) => `#${l.id}`).join(" "), c.created_by]),
    ]);
  }

  return (
    <div className="detail-panel">
      <Header
        icon="bi-cash-coin"
        color="green"
        title="CO / PO"
        subtitle="Approved and pending changes to scope, cost, or schedule"
        count={items.length}
        actions={
          <>
            <button className="btn btn-sm btn-outline-secondary" onClick={exportCsv} disabled={!items.length}><i className="bi bi-download" /> Export</button>
            {canWrite && <button className="btn btn-sm btn-success" onClick={() => setForm(blankCo())}><i className="bi bi-plus-lg" /> Add CO/PO</button>}
          </>
        }
      />
      <FilterBar
        value={filter}
        onChange={setFilter}
        options={[["all", "All"], ...Object.entries(CO_STATUS).map(([k, v]) => [k, v.label, v.icon])]}
      />
      <div className="detail-panel-body">
        <div className="co-list">
          {shown.map((c) => {
            const st = CO_STATUS[c.status] || CO_STATUS.pending;
            return (
              <div key={c.id} className="co-card">
                <div className="co-card-top">
                  <div className="co-card-left">
                    <span className="co-number-pill">{c.kind}{c.co_number}</span>
                    <span className="co-change-type">{c.change}</span>
                  </div>
                </div>
                <div className="co-card-status-row">
                  <span className={`co-status-pill ${st.cls}`}><i className={`bi ${st.icon}`} /> {st.label.toUpperCase()}</span>
                  <div className="co-card-actions">
                    {canWrite && (
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => setForm({ ...c, tonnage: c.tonnage, rate_per_ton: c.rate_per_ton, linked_submissions: c.linked_submissions.map((l) => Number(l.id)) })}>
                        <i className="bi bi-pencil" /> Edit
                      </button>
                    )}
                    {canDelete && (
                      <button className="btn btn-sm btn-outline-danger" onClick={() => setDel({ id: c.id, name: `${c.kind} ${c.co_number}` })}>
                        <i className="bi bi-trash" /> Delete
                      </button>
                    )}
                  </div>
                </div>
                {c.notes && <div className="co-notes">{c.notes}</div>}
                <div className="co-chip-row">
                  <span className="co-chip"><i className="bi bi-calendar3" /> <span className="co-chip-label">Date</span> {fmtDay(c.date)}</span>
                  <span className="co-chip"><i className="bi bi-box-seam" /> <span className="co-chip-label">Tonnage</span> {tons(c.tonnage)} t</span>
                  <span className="co-chip"><i className="bi bi-currency-dollar" /> <span className="co-chip-label">Total</span> {money(c.currency, c.total)}</span>
                </div>
                {c.linked_submissions.length > 0 && (
                  <div className="co-linked-section">
                    <div className="co-linked-section-label"><i className="bi bi-link-45deg" /> Linked submissions</div>
                    <div className="co-linked-submissions">
                      {c.linked_submissions.map((l) => (
                        <div key={l.id} className="co-linked-row">
                          <div className="co-linked-row-icon"><i className="bi bi-file-earmark-text" /></div>
                          <div className="co-linked-row-name"><span className="co-linked-row-id">#{l.id}</span> {l.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="co-card-bottom">
                  <span className="co-created-by"><i className="bi bi-person" /> {c.created_by || "—"}</span>
                </div>
              </div>
            );
          })}
          {!shown.length && <div className="text-center text-muted py-4">{items.length ? "Nothing matches this filter." : "No CO/PO yet."}</div>}
        </div>
      </div>

      <FormModal
        open={!!form}
        onClose={() => setForm(null)}
        icon="bi-currency-dollar"
        title={form?.id ? "Edit CO / PO" : "Create CO / PO"}
        subtitle={form?.id ? "Update this CO/PO" : "Add a new CO/PO to this project"}
        maxWidth={680}
        onSubmit={submit}
        busy={save.isPending}
        submitLabel={form?.id ? "Save changes" : "Create CO/PO"}
        submitClass="btn-success"
      >
        {form && (
          <>
            <div className="row g-3 mb-3">
              <div className="col-4">
                <label className="form-label fw-semibold">Type <span className="text-danger">*</span></label>
                <select className="form-select" value={form.kind} onChange={set("kind")}>
                  <option value="CO">CO</option>
                  <option value="PO">PO</option>
                </select>
              </div>
              <div className="col-4">
                <label className="form-label fw-semibold">CO/PO # <span className="text-danger">*</span></label>
                <input className="form-control" placeholder="e.g. 001" value={form.co_number} onChange={set("co_number")} required />
              </div>
              <div className="col-4">
                <label className="form-label fw-semibold">Date <span className="text-danger">*</span></label>
                <input type="date" className="form-control" value={form.date} onChange={set("date")} required />
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label fw-semibold">Change <span className="text-danger">*</span></label>
              <input className="form-control" placeholder="Select or type a change type" list="co-change-types" value={form.change} onChange={set("change")} required />
              <datalist id="co-change-types">
                {["Scope change", "Added drawings", "Revision", "Additional tonnage", "Schedule change"].map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div className="mb-3">
              <label className="form-label fw-semibold">Notes</label>
              <textarea className="form-control" rows={3} placeholder="Additional details..." value={form.notes} onChange={set("notes")} />
            </div>
            <LinkedSubmissions records={records} value={form.linked_submissions} onChange={(v) => setForm((f) => ({ ...f, linked_submissions: v }))} />
            <div className="co-amount-grid">
              <div>
                <label className="form-label fw-semibold">Tonnage</label>
                <div className="input-group">
                  <input type="number" min="0" step="0.01" className="form-control" placeholder="0.0" value={form.tonnage} onChange={set("tonnage")} />
                  <span className="input-group-text">t</span>
                </div>
              </div>
              <div>
                <label className="form-label fw-semibold">Currency</label>
                <select className="form-select" value={form.currency} onChange={set("currency")}>
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label fw-semibold">Amount / ton</label>
                <input type="number" min="0" step="0.01" className="form-control" placeholder="0.00" value={form.rate_per_ton} onChange={set("rate_per_ton")} />
              </div>
              <div className="co-total-box">
                <span className="co-total-label">Total</span>
                <span className="co-total-value">{money(form.currency, total)}</span>
              </div>
            </div>
            {form.id && (
              <div className="mt-3">
                <label className="form-label fw-semibold">Status</label>
                <select className="form-select" value={form.status} onChange={set("status")}>
                  {Object.entries(CO_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            )}
          </>
        )}
      </FormModal>
      <ConfirmDelete target={del} label="CO/PO" onClose={() => setDel(null)} onConfirm={confirmDelete} busy={remove.isPending} />
    </div>
  );
}

// ── RFI / Clarification ───────────────────────────────────────────────────
const RFI_STATUS = {
  pending: { label: "Pending", icon: "bi-hourglass-split", cls: "rfi-status-pending", bar: "#94a3b8" },
  overdue: { label: "Overdue", icon: "bi-exclamation-triangle-fill", cls: "rfi-status-overdue", bar: "#ef4444" },
  returned: { label: "Returned", icon: "bi-check2", cls: "rfi-status-returned", bar: "#22c55e" },
};
const blankQuestion = () => ({ text: "", response: "", response_date: "" });
const RFI_TYPES = ["RFI", "Clarification", "BFA Clarification", "Field Verification", "GC to Verify", "Other"];
const blankRfi = () => ({ type: "RFI", rfi_number: "", title: "", questions: [blankQuestion()], linked_submissions: [], date: todayISO(), expected_response_date: addDaysISO(2) });

export function RfiPanel({ projectId, items, records, canWrite, canDelete, openSignal = 0 }) {
  const toast = useToast();
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState(null);
  useEffect(() => {
    if (openSignal) setForm(blankRfi());
  }, [openSignal]);
  const [del, setDel] = useState(null);
  const [view, setView] = useState(null);
  const save = useItemMutation((f) => (f.id ? api.put(`/projects/${projectId}/rfis/${f.id}`, f) : api.post(`/projects/${projectId}/rfis`, f)));
  const remove = useItemMutation((id) => api.delete(`/projects/${projectId}/rfis/${id}`));

  const shown = items.filter((r) => filter === "all" || r.status === filter);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setQ = (i, patch) => setForm((f) => ({ ...f, questions: f.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));
  const viewing = view && items.find((r) => r.id === view);

  function openEdit(r) {
    setForm({ ...r, linked_submissions: r.linked_submissions.map((l) => Number(l.id)) });
  }
  async function submit(e) {
    e.preventDefault();
    try {
      toast.success((await save.mutateAsync(form)).message);
      setForm(null);
    } catch (err) {
      toast.error(errMsg(err, "Failed to save."));
    }
  }
  async function confirmDelete() {
    try {
      toast.success((await remove.mutateAsync(del.id)).message);
      setDel(null);
    } catch (err) {
      toast.error(errMsg(err, "Failed to delete."));
    }
  }
  function exportCsv() {
    downloadCsv("rfi-clarification.csv", [
      ["Type", "Number", "Title", "Status", "Date", "Expected response", "Question", "Response", "Response received", "Created by"],
      ...items.flatMap((r) =>
        r.questions.map((q) => [r.type, r.rfi_number, r.title, RFI_STATUS[r.status].label, r.date, r.expected_response_date, q.text, q.response, q.response_date, r.created_by])
      ),
    ]);
  }

  return (
    <div className="detail-panel">
      <Header
        icon="bi-journal-bookmark-fill"
        color="amber"
        title="RFI / Clarification"
        subtitle="Questions and clarifications for this project"
        count={items.length}
        actions={
          <>
            <button className="btn btn-sm btn-outline-secondary" onClick={exportCsv} disabled={!items.length}><i className="bi bi-download" /> Export</button>
            {canWrite && <button className="btn btn-sm btn-rfi-orange" onClick={() => setForm(blankRfi())}><i className="bi bi-plus-lg" /> Add</button>}
          </>
        }
      />
      <FilterBar
        value={filter}
        onChange={setFilter}
        options={[["all", "All"], ...Object.entries(RFI_STATUS).map(([k, v]) => [k, v.label, v.icon])]}
      />
      <div className="detail-panel-body">
        <div className="co-list">
          {shown.map((r) => {
            const st = RFI_STATUS[r.status];
            return (
              <div key={r.id} className={`rfi-row rfi-row-${r.status}`} role="button" tabIndex={0} onClick={() => setView(r.id)} onKeyDown={(e) => e.key === "Enter" && setView(r.id)}>
                <div className="rfi-row-content">
                  <div className="rfi-row-top">
                    <span className="rfi-type-pill">{r.type === "RFI" ? "RFI" : r.type === "Clarification" ? "CLR" : r.type.toUpperCase()}</span>
                    <div className="rfi-row-title">{r.rfi_number && <span className="text-muted">#{r.rfi_number} </span>}{r.title}</div>
                  </div>
                  <div className="rfi-row-bottom">
                    <span className={`co-status-pill ${st.cls}`}><i className={`bi ${st.icon}`} /> {st.label.toUpperCase()}</span>
                    <div className="rfi-row-progress">
                      <div className="rfi-row-progress-track"><div className="rfi-row-progress-bar" style={{ width: `${r.progress_pct}%`, background: st.bar }} /></div>
                      <span className="rfi-row-progress-pct">{r.progress_pct}%</span>
                    </div>
                    <div className="rfi-row-actions" onClick={(e) => e.stopPropagation()}>
                      {canWrite && <button className="btn btn-sm btn-outline-secondary" onClick={() => openEdit(r)}><i className="bi bi-pencil" /> Edit</button>}
                      {canDelete && <button className="btn btn-sm btn-outline-danger" onClick={() => setDel({ id: r.id, name: `"${r.title}"` })}><i className="bi bi-trash" /> Delete</button>}
                    </div>
                  </div>
                </div>
                <i className="bi bi-chevron-right rfi-row-chevron" />
              </div>
            );
          })}
          {!shown.length && <div className="text-center text-muted py-4">{items.length ? "Nothing matches this filter." : "No RFI / Clarification yet."}</div>}
        </div>
      </div>

      <FormModal
        open={!!form}
        onClose={() => setForm(null)}
        icon="bi-journal-bookmark-fill"
        iconClass="co-modal-header-icon-amber"
        title={form?.id ? "Edit RFI / Clarification" : "Create RFI / Clarification"}
        subtitle="RFI / Clarification Request"
        maxWidth={900}
        onSubmit={submit}
        busy={save.isPending}
        submitLabel={form?.id ? "Save changes" : "Create RFI"}
        submitClass="btn-rfi-orange"
      >
        {form && (
          <>
            <div className="row g-3 mb-3">
              <div className="col-md-3">
                <label className="form-label fw-semibold">Type</label>
                <select className="form-select" value={form.type} onChange={set("type")}>
                  {RFI_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label fw-semibold">RFI Number</label>
                <input className="form-control" placeholder="e.g. RFI-001" value={form.rfi_number} onChange={set("rfi_number")} />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">Title <span className="text-danger">*</span></label>
                <input className="form-control" placeholder="Brief subject" value={form.title} onChange={set("title")} required />
              </div>
            </div>

            <div className="rfi-questions-form-label">
              <label className="form-label fw-semibold mb-0">Questions <span className="text-danger">*</span></label>
              <span className="co-linked-count">{form.questions.length}</span>
            </div>
            <div className="rfi-questions-form-hint">Add each item you need clarified — every question tracks its own response date.</div>
            <div className="rfi-question-form-list">
              {form.questions.map((q, i) => (
                <div key={q.id || i} className={`rfi-question-form-card${q.response_date ? " rfi-question-form-card-received" : ""}`}>
                  <div className="rfi-question-form-head">
                    <span className={`rfi-question-badge${q.response_date ? " rfi-question-badge-received" : ""}`}>Q{i + 1}</span>
                    {form.questions.length > 1 && (
                      <button type="button" className="rfi-question-remove" aria-label="Remove question" onClick={() => setForm((f) => ({ ...f, questions: f.questions.filter((_, j) => j !== i) }))}>
                        <i className="bi bi-x-lg" />
                      </button>
                    )}
                  </div>
                  <textarea className="form-control" rows={2} placeholder="Describe the information needed..." value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} />
                  <div className="rfi-question-answer-field">
                    <label className="rfi-question-answer-label">Response</label>
                    <textarea className="form-control" rows={2} placeholder="Enter the answer, once received..." value={q.response} onChange={(e) => setQ(i, { response: e.target.value })} />
                  </div>
                  <div className="rfi-question-form-footer">
                    <span className={`rfi-question-date-label${q.response_date ? " rfi-question-date-label-received" : ""}`}><i className="bi bi-calendar-check" /> Response Received</span>
                    <input type="date" className="form-control form-control-sm rfi-question-date-input" value={q.response_date} onChange={(e) => setQ(i, { response_date: e.target.value })} />
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="rfi-add-question-btn mb-3" onClick={() => setForm((f) => ({ ...f, questions: [...f.questions, blankQuestion()] }))}>
              <i className="bi bi-plus" /> Add Question
            </button>

            <LinkedSubmissions records={records} value={form.linked_submissions} onChange={(v) => setForm((f) => ({ ...f, linked_submissions: v }))} />
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label fw-semibold">Date <span className="text-danger">*</span></label>
                <input type="date" className="form-control" value={form.date} onChange={set("date")} required />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">Expected Response Date <span className="text-danger">*</span></label>
                <input type="date" className="form-control" value={form.expected_response_date} onChange={set("expected_response_date")} required />
              </div>
            </div>
          </>
        )}
      </FormModal>

      <Modal
        open={!!viewing}
        onClose={() => setView(null)}
        title={viewing ? `${viewing.type}${viewing.rfi_number ? ` #${viewing.rfi_number}` : ""}` : ""}
        maxWidth={720}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setView(null)}>Close</button>
            {canWrite && viewing && <button className="btn btn-rfi-orange" onClick={() => { openEdit(viewing); setView(null); }}>Edit</button>}
          </>
        }
      >
        {viewing && (
          <>
            <h6 className="fw-bold">{viewing.title}</h6>
            <div className="rfi-details-top">
              <span className={`co-status-pill ${RFI_STATUS[viewing.status].cls}`}>{RFI_STATUS[viewing.status].label.toUpperCase()}</span>
              <span className="rfi-details-progress-label">{viewing.progress_pct}% answered</span>
            </div>
            <div className="co-chip-row mt-2">
              <span className="co-chip"><i className="bi bi-calendar3" /> <span className="co-chip-label">Date</span> {fmtDay(viewing.date)}</span>
              <span className="co-chip co-chip-amber"><i className="bi bi-calendar-event" /> <span className="co-chip-label">Expected</span> {fmtDay(viewing.expected_response_date)}</span>
            </div>
            <div className="rfi-questions">
              <div className="rfi-questions-label">Questions</div>
              {viewing.questions.map((q, i) => (
                <div key={q.id} className={`rfi-question-item${q.response_date ? " rfi-question-item-received" : ""}`}>
                  <div className="rfi-question-item-row">
                    <span className={`rfi-question-badge${q.response_date ? " rfi-question-badge-received" : ""}`}>Q{i + 1}</span>
                    <div className="rfi-question-text">{q.text}</div>
                    <div className="rfi-question-response">
                      {q.response_date ? <span className="co-chip co-chip-green"><i className="bi bi-check2" /> {fmtDay(q.response_date)}</span> : <span className="co-chip co-chip-muted">Awaiting</span>}
                    </div>
                  </div>
                  {q.response && <div className="rfi-question-answer"><span className="rfi-answer-tag">A:</span> {q.response}</div>}
                </div>
              ))}
            </div>
            {viewing.linked_submissions.length > 0 && (
              <div className="co-linked-section">
                <div className="co-linked-section-label"><i className="bi bi-link-45deg" /> Linked submissions</div>
                <div className="co-linked-submissions">
                  {viewing.linked_submissions.map((l) => (
                    <div key={l.id} className="co-linked-row">
                      <div className="co-linked-row-icon"><i className="bi bi-file-earmark-text" /></div>
                      <div className="co-linked-row-name"><span className="co-linked-row-id">#{l.id}</span> {l.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="co-created-by rfi-details-created-by"><i className="bi bi-person" /> {viewing.created_by || "—"}</div>
          </>
        )}
      </Modal>
      <ConfirmDelete target={del} label="RFI / Clarification" onClose={() => setDel(null)} onConfirm={confirmDelete} busy={remove.isPending} />
    </div>
  );
}

// ── Project image ─────────────────────────────────────────────────────────
const MAX_IMAGE_MB = 5;

export function ProjectImagePanel({ projectId, image, canEdit }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [lightbox, setLightbox] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState(false);
  const upload = useItemMutation((body) => api.put(`/projects/${projectId}/image`, body));
  const remove = useItemMutation(() => api.delete(`/projects/${projectId}/image`));
  const src = image ? `${API_URL}/projects/${projectId}/image?v=${image.version}` : "";

  async function handleFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return toast.error("Choose a PNG, JPEG, WEBP or GIF image.");
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) return toast.error(`Image must be under ${MAX_IMAGE_MB} MB.`);
    const data_url = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
    try {
      toast.success((await upload.mutateAsync({ filename: file.name, data_url })).message);
    } catch (err) {
      toast.error(errMsg(err, "Upload failed."));
    }
  }
  // Ctrl/Cmd+V anywhere on the page (outside text fields) uploads an image from the clipboard.
  const handleFileRef = useRef(handleFile);
  handleFileRef.current = handleFile;
  useEffect(() => {
    if (!canEdit) return undefined;
    function onPaste(e) {
      if (e.target.closest?.("input, textarea, [contenteditable]")) return;
      const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === "file" && i.type.startsWith("image/"));
      if (!item) return;
      e.preventDefault();
      handleFileRef.current(item.getAsFile());
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [canEdit]);

  async function handleRemove() {
    try {
      toast.success((await remove.mutateAsync()).message);
    } catch (err) {
      toast.error(errMsg(err, "Failed to remove image."));
    }
  }

  return (
    <div className="detail-panel">
      <Header icon="bi-image-fill" color="rose" title="Project Image" subtitle="Cover photo or reference image for this project" count={null} actions={null} />
      <div className="detail-panel-body">
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ""; }} />
        {image ? (
          <>
            <div className="project-image-preview" onClick={() => { setZoom(1); setLightbox(true); }} title="Click to enlarge">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="Project" />
            </div>
            {canEdit && (
              <div className="project-image-actions">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => inputRef.current.click()} disabled={upload.isPending}><i className="bi bi-arrow-repeat" /> Replace</button>
                <button className="btn btn-sm btn-outline-danger" onClick={handleRemove} disabled={remove.isPending}><i className="bi bi-trash" /> Remove</button>
              </div>
            )}
          </>
        ) : canEdit ? (
          <div
            className="project-image-dropzone"
            style={drag ? { borderColor: "#6366f1", background: "#f8f9fc" } : undefined}
            onClick={() => inputRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
          >
            <i className="bi bi-cloud-arrow-up fs-3 d-block mb-1" />
            <div className="fw-semibold">{upload.isPending ? "Uploading…" : "Click, drop or paste (Ctrl+V) an image"}</div>
            <div className="small">PNG, JPEG, WEBP or GIF · up to {MAX_IMAGE_MB} MB</div>
          </div>
        ) : (
          <div className="text-muted small text-center py-3">No project image.</div>
        )}
      </div>

      {lightbox && createPortal(
        <div className="image-lightbox-backdrop" onClick={(e) => e.target === e.currentTarget && setLightbox(false)}>
          <div className="image-lightbox-toolbar">
            <div className="image-lightbox-title">{image?.filename || "Project image"}</div>
            <div className="image-lightbox-tools">
              <button className="btn btn-sm btn-outline-light" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}><i className="bi bi-zoom-out" /></button>
              <span className="image-lightbox-zoom-pct">{Math.round(zoom * 100)}%</span>
              <button className="btn btn-sm btn-outline-light" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}><i className="bi bi-zoom-in" /></button>
              <button className="btn btn-sm btn-outline-light" onClick={() => setLightbox(false)}><i className="bi bi-x-lg" /></button>
            </div>
          </div>
          <div className="image-lightbox-body" onClick={(e) => e.target === e.currentTarget && setLightbox(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Project" style={{ transform: `scale(${zoom})` }} />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
