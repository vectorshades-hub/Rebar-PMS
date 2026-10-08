"use client";
import { useMemo, useState } from "react";
import SearchableDropdown from "./SearchableDropdown";

export const CO_STATUS = {
  pending: { label: "Pending", icon: "bi-hourglass-split", cls: "co-status-pending" },
  sent_finance: { label: "Sent to Finance", icon: "bi-send", cls: "co-status-sent" },
  finance_approved: { label: "Finance Approved", icon: "bi-bank", cls: "co-status-finance" },
};

export const money = (currency, n) =>
  `${currency} ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const tons = (n) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const coLabel = (c) => `${c.kind}${c.co_number}`;

export function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function StatusPill({ status }) {
  const st = CO_STATUS[status] || CO_STATUS.pending;
  return <span className={`co-status-pill ${st.cls}`}><i className={`bi ${st.icon}`} /> {st.label}</span>;
}

const SORTERS = {
  project: (c) => c.project.toLowerCase(),
  client: (c) => c.client.toLowerCase(),
  co: (c) => coLabel(c).toLowerCase(),
  date: (c) => c.date,
  change: (c) => c.change.toLowerCase(),
  tonnage: (c) => c.tonnage,
  rate: (c) => c.rate_per_ton,
  total: (c) => c.total,
  status: (c) => c.status,
  invoice: (c) => c.invoice_released,
  released: (c) => c.released_at,
};

/** Filter / search / date-range / sort state shared by the Management and Finance dashboards. */
export function useCoFilters(items, { defaultSort = { col: "date", dir: "desc" } } = {}) {
  const [f, setF] = useState({ project: "", client: "", status: "", search: "", from: "", to: "" });
  const [sort, setSort] = useState(defaultSort);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const rows = useMemo(() => {
    const q = f.search.trim().toLowerCase();
    const out = items.filter(
      (c) =>
        (!f.project || c.project.toLowerCase().includes(f.project.toLowerCase())) &&
        (!f.client || c.client.toLowerCase().includes(f.client.toLowerCase())) &&
        (!f.status || c.status === f.status) &&
        (!f.from || c.date >= f.from) &&
        (!f.to || c.date <= f.to) &&
        (!q || [coLabel(c), c.co_number, c.project, c.change].some((s) => String(s).toLowerCase().includes(q)))
    );
    const get = SORTERS[sort.col];
    if (get) out.sort((a, b) => (get(a) < get(b) ? -1 : get(a) > get(b) ? 1 : 0) * (sort.dir === "asc" ? 1 : -1));
    return out;
  }, [items, f, sort]);

  const toggleSort = (col) => setSort((p) => (p.col === col ? { col, dir: p.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" }));
  return { f, set, rows, sort, toggleSort };
}

export function SortTh({ col, label, sort, onSort, className }) {
  return (
    <th onClick={() => onSort(col)} className={className}>
      {label} <i className={`bi ${sort.col === col ? (sort.dir === "asc" ? "bi-sort-up" : "bi-sort-down") : "bi-arrow-down-up"} sort-icon`} />
    </th>
  );
}

/** Project / client / status / search row plus the date range. */
export function CoFilterBar({ items, f, set }) {
  const unique = (key) => [...new Set(items.map((c) => c[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return (
    <div className="mb-3">
      <div className="row g-2 mb-2">
        <div className="col-md-3">
          <label className="form-label small mb-1">Project</label>
          <SearchableDropdown value={f.project} onChange={set("project")} options={unique("project")} placeholder="All projects" />
        </div>
        <div className="col-md-3">
          <label className="form-label small mb-1">Client</label>
          <SearchableDropdown value={f.client} onChange={set("client")} options={unique("client")} placeholder="All clients" />
        </div>
        <div className="col-md-3">
          <label className="form-label small mb-1">Status</label>
          <select className="form-select" value={f.status} onChange={(e) => set("status")(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(CO_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="col-md-3">
          <label className="form-label small mb-1">Search (CO #, Project, or Change Type)</label>
          <input className="form-control" placeholder="e.g. 001, Acme Tower, or Scope Addition" value={f.search} onChange={(e) => set("search")(e.target.value)} />
        </div>
      </div>
      <div className="d-flex align-items-center gap-2">
        <span className="small">Date</span>
        <div className={`date-range-inline${f.from || f.to ? " active" : ""}`}>
          <i className="bi bi-calendar3 date-range-icon" />
          <input type="date" className="date-range-input" value={f.from} onChange={(e) => set("from")(e.target.value)} aria-label="From" />
          <i className="bi bi-arrow-right date-range-sep" />
          <i className="bi bi-calendar3 date-range-icon" />
          <input type="date" className="date-range-input" value={f.to} onChange={(e) => set("to")(e.target.value)} aria-label="To" />
        </div>
      </div>
    </div>
  );
}
