"use client";

/** Read-only "Unplanned" marker — an orange pill when set, a quiet dash otherwise. */
export function UnplannedBadge({ value }) {
  return value ? (
    <span className="unplanned-pill"><i className="bi bi-exclamation-circle-fill" /> Unplanned</span>
  ) : (
    <span className="cell-muted" aria-label="Planned">—</span>
  );
}

const TYPE_CLASS = {
  OFA: "type-ofa",
  "FIELD USE": "type-field",
  REAPPROVAL: "type-reapproval",
  "BAR LISTING": "type-barlist",
};

/** Colour-coded pill for the four submission types. */
export function TypePill({ type }) {
  return <span className={`type-pill ${TYPE_CLASS[type] || ""}`}>{type}</span>;
}

/** Right-aligned steel tonnage with a unit. */
export function Tonnage({ value }) {
  const n = Number(value) || 0;
  return (
    <span className="tonnage-cell">
      {n.toLocaleString(undefined, { maximumFractionDigits: 2 })}
    </span>
  );
}

const BILLABLE_CLASS = { CO: "bill-co", PO: "bill-po", "Non Billable": "bill-non" };

/** Billable category pill (CO / PO / Non Billable); a dash when unset. */
export function BillablePill({ value }) {
  if (!value) return <span className="cell-muted">—</span>;
  return <span className={`bill-pill ${BILLABLE_CLASS[value] || ""}`}>{value}</span>;
}

/** Invoice Released: an on/off switch for permitted users, a read-only Yes/No pill for everyone else. */
export function InvoiceReleased({ value, canEdit, onChange }) {
  if (!canEdit) {
    return value ? <span className="inv-pill inv-yes">Yes</span> : <span className="inv-pill inv-no">No</span>;
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!value}
      aria-label="Invoice Released"
      className={`switch-toggle${value ? " on" : ""}`}
      onClick={() => onChange(!value)}
    >
      <span className="switch-thumb" />
    </button>
  );
}
