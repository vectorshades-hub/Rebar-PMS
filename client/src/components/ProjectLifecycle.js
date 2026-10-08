"use client";
import { useState } from "react";
import Modal from "./Modal";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import StatusBadge from "./StatusBadge";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/ToastContext";

// Submission types that sit on each stretch of the timeline (between stage i and i + 1).
const SEGMENT_TYPES = [["OFA", "REAPPROVAL"], ["FIELD USE"], ["BAR LISTING"]];
const STAGES = ["Project Received", "OFA – Issued for Approval", "Fabrication", "Completed"];
const isDone = (r) => r.tag === "completed" || r.tag === "completed_overdue";

/** One dot per distinct submission date inside each segment, spread evenly along it. */
function buildSegments(records) {
  return SEGMENT_TYPES.map((types) => {
    const recs = records.filter((r) => types.includes(r.submission_type));
    const byDate = new Map();
    for (const r of recs) {
      const key = r.sub_date_raw || "";
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(r);
    }
    const dots = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([date, rs]) => ({ date, records: rs }));
    return { recs, dots, done: recs.filter(isDone).length };
  });
}

const ACTIONS = [
  { stage: "ofa", label: "OFA" },
  { stage: "fabrication", label: "Fabrication" },
  { stage: "project", label: "Project", complete: "Mark Project Completed", reopen: "Reopen Project" },
];

/**
 * Project Received -> Issued for Approval -> Fabrication -> Completed. Stages 2-4 are completed by
 * hand (buttons, in order); the first stage that isn't done is the active one.
 */
export default function ProjectLifecycle({ projectId, lifecycle = {}, records, canManage, canAdd, onNewCo, onNewRfi }) {
  const [popup, setPopup] = useState(null);
  const [confirm, setConfirm] = useState(null); // { stage, done, title, text, button }
  const toast = useToast();
  const qc = useQueryClient();
  const segments = buildSegments(records);
  const last = STAGES.length - 1;

  const setStage = useMutation({
    mutationFn: ({ stage, done }) => api.put(`/projects/${projectId}/lifecycle`, { stage, done }),
    onSuccess: () => {
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ["project-detail"] });
    },
    onError: (e) => {
      setConfirm(null);
      toast.error(e instanceof ApiError ? e.message : "Failed to update the stage.");
    },
  });

  const doneAt = [true, lifecycle.ofa, lifecycle.fabrication, lifecycle.project]; // stage i done?
  const currentIdx = doneAt.findIndex((d) => !d);
  const state = doneAt.map((d, i) => (d ? "done" : i === currentIdx ? "current" : "pending"));
  const latestDone = currentIdx === -1 ? last : currentIdx - 1;
  const fillPct = (latestDone / last) * 100;

  const total = records.length;
  const completed = records.filter(isDone).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const stageLabel = currentIdx === -1 ? "All stages complete" : `Stage ${currentIdx + 1} of ${STAGES.length} — ${STAGES[currentIdx]}`;
  const pos = (i) => `${(i / last) * 100}%`;

  return (
    <div className="detail-panel lifecycle-card p-3 mb-3">
      <div className="lifecycle-head">
        <div>
          <div className="lifecycle-title">Project Lifecycle</div>
          <div className="lifecycle-subtitle">Submissions grouped by stage - OFA / Reapproval, Field Use, Bar Listing</div>
        </div>
        {(canManage || canAdd) && (
          <div className="lifecycle-actions">
            {canAdd && (
              <>
                <button className="btn btn-sm btn-outline-warning" onClick={onNewRfi}><i className="bi bi-file-earmark-text" /> RFI / Clarification</button>
                <button className="btn btn-sm btn-outline-success" onClick={onNewCo}><i className="bi bi-cash-coin" /> CO/PO</button>
              </>
            )}
            {canManage && ACTIONS.map((a, k) => {
              const done = !!doneAt[k + 1];
              const name = a.stage === "project" ? "the project" : a.label;
              if (done) {
                // Only the latest completed stage can be reopened.
                return k + 1 === latestDone ? (
                  <button key={a.stage} className="btn btn-sm btn-outline-secondary" disabled={setStage.isPending} onClick={() => setConfirm({ stage: a.stage, done: false, title: `Reopen ${name}?`, text: `${a.label === "Project" ? "The project" : a.label} will be marked as not completed again.`, button: a.reopen || `Reopen ${a.label}` })}>
                    <i className="bi bi-arrow-counterclockwise" /> {a.reopen || `Reopen ${a.label}`}
                  </button>
                ) : null;
              }
              return (
                <button key={a.stage} className={`btn btn-sm ${k === 2 ? "btn-primary" : "btn-outline-primary"}`} disabled={setStage.isPending || !doneAt[k]} onClick={() => setConfirm({ stage: a.stage, done: true, title: `Complete ${name}?`, text: `Mark ${name} as completed? You can reopen it afterwards if needed.`, button: a.complete || `Complete ${a.label}` })}>
                  <i className="bi bi-flag-fill" /> {a.complete || `Complete ${a.label}`}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="lifecycle-track" style={{ margin: "0 90px 1.25rem" }}>
        <div className="lifecycle-track-line" style={{ left: 0, width: "100%" }} />
        <div className="lifecycle-track-fill" style={{ left: 0, width: `${fillPct}%` }} />

        {segments.map((s, si) =>
          s.dots.map((d, j) => {
            const allDone = d.records.every(isDone);
            return (
              <button
                key={`${si}-${d.date}-${j}`}
                type="button"
                className={`lifecycle-type-dot${allDone ? " lifecycle-dot-done" : ""}`}
                style={{ left: `${((si + (j + 1) / (s.dots.length + 1)) / last) * 100}%` }}
                title={`${d.records.length} submission${d.records.length === 1 ? "" : "s"}${d.date ? ` — ${d.date}` : ""}`}
                onClick={() => setPopup(d)}
              >
                {d.records.length > 1 && <span className="lifecycle-dot-count">{d.records.length}</span>}
              </button>
            );
          })
        )}

        {STAGES.map((label, i) => {
          const st = state[i];
          return (
            <div key={label} className={`lifecycle-step lifecycle-step-${st}`} style={{ left: pos(i) }}>
              <div className="lifecycle-circle">{st === "done" ? <i className="bi bi-check-lg" /> : i + 1}</div>
              <div className="lifecycle-step-label">{label}</div>
              <span className={`lifecycle-stage-badge lifecycle-stage-${st}`}>{st === "done" ? "DONE" : st === "current" ? "ACTIVE" : "PENDING"}</span>
            </div>
          );
        })}
      </div>

      <div className="lifecycle-footer">
        <span>{stageLabel}</span>
        <span className={`lifecycle-pct ${pct === 100 ? "lifecycle-pct-done" : pct === 0 ? "lifecycle-pct-zero" : "lifecycle-pct-mid"}`}>{pct}%</span>
      </div>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        aboveModals
        title={confirm?.title}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
            <button className={`btn ${confirm?.done ? "btn-primary" : "btn-warning"}`} disabled={setStage.isPending} onClick={() => setStage.mutate({ stage: confirm.stage, done: confirm.done })}>
              {confirm?.button}
            </button>
          </>
        }
      >
        <p className="mb-0">{confirm?.text}</p>
      </Modal>

      <Modal open={!!popup} onClose={() => setPopup(null)} title={popup?.date ? `Submissions — ${popup.date}` : "Submissions"}>
        {popup?.records.map((r, i) => (
          <div key={r.id} className={i ? "dot-popup-record-sep" : ""}>
            <div className="dot-popup-title">
              <span className="dot-popup-type">{r.submission_type}</span>
              {r.submission_name}
            </div>
            <div className="small text-muted">Due {r.due_date || "—"}</div>
            <div className="dot-popup-status"><StatusBadge status={r.status} tag={r.tag} /></div>
          </div>
        ))}
      </Modal>
    </div>
  );
}
