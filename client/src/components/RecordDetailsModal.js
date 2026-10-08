"use client";
import Modal from "./Modal";

const fmtCompleted = (iso) => (iso ? new Date(iso).toLocaleString() : "");

/** Read-only popup with every field of a record, including the ones the lists don't show. */
export default function RecordDetailsModal({ record, onClose }) {
  const r = record;
  return (
    <Modal
      open={!!r}
      onClose={onClose}
      title={`Record #${r?.id} Details`}
      footer={<button className="btn btn-secondary" onClick={onClose}>Close</button>}
    >
      {r && (
        <table className="table table-sm mb-0">
          <tbody>
            {[
              ["Project", r.project],
              ["Submission Name", r.submission_name],
              ["Client", r.client],
              ["Type", r.submission_type],
              ["Tonnage", r.tonnage],
              ["Team", r.team],
              ["Billable", r.billable],
              ["Invoice Released", r.invoice_released ? "Yes" : "No"],
              ["Unplanned", r.unplanned ? "Yes" : "No"],
              ["Sub Date", r.sub_date],
              ["Due Date", r.due_date],
              ["Status", r.status],
              ["Created At", r.created_at],
              ["Created By", r.created_by],
              ["Completed At", fmtCompleted(r.completed_at)],
              ["Remarks", r.remarks],
            ].map(([label, value]) => (
              <tr key={label}>
                <th className="w-25 text-muted fw-semibold">{label}</th>
                <td style={{ whiteSpace: "pre-wrap" }}>{value === "" || value == null ? "—" : value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
