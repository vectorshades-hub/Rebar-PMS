"use client";
import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "../../components/AppLayout";
import PageHero from "../../components/PageHero";
import StatPill from "../../components/StatPill";
import { api } from "../../lib/api";
import { fmtDateTime } from "../../components/CoDashboardShared";

const METHOD_CLASS = { POST: "bg-success", PUT: "bg-primary", PATCH: "bg-info text-dark", DELETE: "bg-danger" };

function RequestLog() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("");
  const [outcome, setOutcome] = useState("");
  const [user, setUser] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [open, setOpen] = useState(null); // id of the row whose request body is expanded

  const params = { page, search, method, outcome, user, date_from: range.from, date_to: range.to };
  const { data, isFetching } = useQuery({
    queryKey: ["request-log", params],
    queryFn: () => api.get("/request-log", params),
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: true,
  });
  const items = data?.items || [];
  const filtersActive = search || method || outcome || user || range.from || range.to;
  const reset = (fn) => (v) => { fn(v); setPage(1); };

  return (
    <div>
      <PageHero theme="navy" icon="bi-journal-text" title="Request Log" meta="Every change request (POST, PUT, PATCH, DELETE) made to the API — GET requests are not logged. Kept for 90 days." />

      <div className="d-flex flex-wrap gap-2 mb-3">
        <StatPill num={data?.total ?? 0} label="Requests" color="#0f766e" active={!outcome} onClick={() => reset(setOutcome)("")} />
        <StatPill num="OK" label="Succeeded" color="#15803d" active={outcome === "ok"} onClick={() => reset(setOutcome)("ok")} />
        <StatPill num="ERR" label="Failed" color="#dc2626" active={outcome === "error"} onClick={() => reset(setOutcome)("error")} />
      </div>

      <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
        <select className="form-select form-select-sm" style={{ width: "auto" }} value={method} onChange={(e) => reset(setMethod)(e.target.value)} aria-label="Filter by method">
          <option value="">All methods</option>
          {["POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="form-select form-select-sm" style={{ width: "auto" }} value={user} onChange={(e) => reset(setUser)(e.target.value)} aria-label="Filter by user">
          <option value="">All users</option>
          {(data?.users || []).map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <div className={`date-range-inline${range.from || range.to ? " active" : ""}`}>
          <i className="bi bi-calendar3 date-range-icon" />
          <input type="date" className="date-range-input" value={range.from} onChange={(e) => reset(setRange)({ ...range, from: e.target.value })} aria-label="From" />
          <i className="bi bi-arrow-right date-range-sep" />
          <i className="bi bi-calendar3 date-range-icon" />
          <input type="date" className="date-range-input" value={range.to} onChange={(e) => reset(setRange)({ ...range, to: e.target.value })} aria-label="To" />
        </div>
        <div className="position-relative">
          <i className="bi bi-search position-absolute text-muted" style={{ left: 10, top: 8, fontSize: "0.8rem" }} />
          <input className="form-control" style={{ maxWidth: 240, paddingLeft: 28 }} placeholder="Search path, user, body…" value={search} onChange={(e) => reset(setSearch)(e.target.value)} />
        </div>
        {filtersActive && (
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setSearch(""); setMethod(""); setOutcome(""); setUser(""); setRange({ from: "", to: "" }); setPage(1); }}>
            <i className="bi bi-x-circle" /> Reset
          </button>
        )}
      </div>

      <div className="table-wrap table-wrap-page-sticky">
        <table className="table table-sm table-hover mb-0">
          <thead>
            <tr><th>Time</th><th>User</th><th>Method</th><th>Path</th><th>Status</th><th>IP</th><th>Ms</th><th /></tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td className="text-nowrap">{fmtDateTime(r.at)}</td>
                  <td>{r.username || <span className="text-muted">—</span>}{r.role && <span className="small text-muted"> ({r.role})</span>}</td>
                  <td><span className={`badge ${METHOD_CLASS[r.method] || "bg-secondary"}`}>{r.method}</span></td>
                  <td><code>{r.path}</code></td>
                  <td><span className={`badge ${r.status >= 400 ? "bg-danger" : "bg-success"}`}>{r.status}</span></td>
                  <td className="small text-muted">{r.ip}</td>
                  <td className="small text-muted">{r.duration_ms}</td>
                  <td className="text-end">
                    {r.body && (
                      <button className="btn btn-sm btn-outline-secondary" title="Request body" onClick={() => setOpen(open === r.id ? null : r.id)}>
                        <i className={`bi ${open === r.id ? "bi-chevron-up" : "bi-chevron-down"}`} />
                      </button>
                    )}
                  </td>
                </tr>
                {open === r.id && (
                  <tr>
                    <td colSpan={8} className="bg-light"><pre className="mb-0 small" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{r.body}</pre></td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!items.length && !isFetching && (
              <tr><td colSpan={8} className="text-center text-muted py-4">No requests logged yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <nav className="mt-2 d-flex align-items-center gap-2">
          <button className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span className="small text-muted">Page {page} of {data.pages}</span>
          <button className="btn btn-sm btn-outline-secondary" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </nav>
      )}
    </div>
  );
}

export default function RequestLogPage() {
  return (
    <AppLayout allow={["admin"]}>
      <RequestLog />
    </AppLayout>
  );
}
