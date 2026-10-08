"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AppLayout from "../../components/AppLayout";
import PageHero from "../../components/PageHero";
import StatPill from "../../components/StatPill";
import Modal from "../../components/Modal";
import { CoFilterBar, SortTh, StatusPill, coLabel, money, tons, useCoFilters } from "../../components/CoDashboardShared";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../lib/ToastContext";

const INVOICE = { yes: "Yes", no: "No", "": "Not Set" };

function InvoicePill({ value }) {
  const cls = value === "yes" ? "inv-yes" : value === "no" ? "inv-no-red" : "inv-notset";
  return <span className={`inv-pill ${cls}`}>{INVOICE[value] ?? "Not Set"}</span>;
}

function ManagementDashboard() {
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["mgmt-dashboard"], queryFn: () => api.get("/dashboards/management") });
  const items = data?.items || [];
  const { f, set, rows, sort, toggleSort } = useCoFilters(items);
  const [invoiceFilter, setInvoiceFilter] = useState(null); // null = all, else "yes" | "no" | ""
  const [target, setTarget] = useState(null); // { co, value }
  const [confirming, setConfirming] = useState(false); // "send to Finance" confirmation step
  const [pending, setPending] = useState(null); // linked submissions blocking the release

  const count = (v) => items.filter((c) => c.invoice_released === v).length;
  const shown = invoiceFilter === null ? rows : rows.filter((c) => c.invoice_released === invoiceFilter);

  const save = useMutation({
    mutationFn: ({ co, value }) => api.put(`/dashboards/management/${co.id}/invoice`, { invoice_released: value }),
    onSettled: () => setConfirming(false),
    onSuccess: (res) => {
      toast.success(res.message);
      setTarget(null);
      qc.invalidateQueries({ queryKey: ["mgmt-dashboard"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.data?.pending) setPending({ message: e.message, list: e.data.pending });
      else toast.error(e instanceof ApiError ? e.message : "Failed to update.");
    },
  });

  const open = (co) => {
    setPending(null);
    setTarget({ co, value: co.invoice_released });
  };
  const th = { sort, onSort: toggleSort };

  return (
    <div>
      <PageHero theme="navy" icon="bi-graph-up" title="Management Dashboard" meta="Change Order submissions across all projects — Invoice Released status" />

      <div className="d-flex flex-wrap gap-2 mb-3">
        <StatPill num={items.length} label="All CO submissions" color="#0f766e" active={invoiceFilter === null} onClick={() => setInvoiceFilter(null)} />
        <StatPill num={count("yes")} label="Invoice Released — Yes" color="#15803d" active={invoiceFilter === "yes"} onClick={() => setInvoiceFilter("yes")} />
        <StatPill num={count("no")} label="Invoice Released — No" color="#dc2626" active={invoiceFilter === "no"} onClick={() => setInvoiceFilter("no")} />
        <StatPill num={count("")} label="Not Set" color="#475569" active={invoiceFilter === ""} onClick={() => setInvoiceFilter("")} />
      </div>

      <CoFilterBar items={items} f={f} set={set} />

      <div className="table-wrap table-wrap-page-sticky">
        <table className="table table-sm table-hover mb-0">
          <thead>
            <tr>
              <SortTh col="project" label="Project" {...th} />
              <SortTh col="client" label="Client" {...th} />
              <SortTh col="co" label="CO #" {...th} />
              <SortTh col="date" label="Date" {...th} />
              <SortTh col="change" label="Change Type" {...th} />
              <SortTh col="tonnage" label="Tonnage" {...th} />
              <SortTh col="rate" label="Rate" {...th} />
              <SortTh col="total" label="Total" {...th} />
              <SortTh col="status" label="Status" {...th} />
              <SortTh col="invoice" label="Invoice Released" {...th} />
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id}>
                <td><a className="proj-link" href={`/projects/${c.project_id}`}>{c.project}</a></td>
                <td>{c.client}</td>
                <td className="fw-bold">{coLabel(c)}</td>
                <td>{c.date}</td>
                <td>{c.change}</td>
                <td>{tons(c.tonnage)}</td>
                <td>{money(c.currency, c.rate_per_ton)}</td>
                <td className="fw-bold">{money(c.currency, c.total)}</td>
                <td><StatusPill status={c.status} /></td>
                <td><InvoicePill value={c.invoice_released} /></td>
                <td className="text-end">
                  {(c.status === "pending" || user.role === "admin") && (
                  <button
                    className="btn btn-sm btn-outline-primary"
                    disabled={c.status === "finance_approved"}
                    title={c.status === "finance_approved" ? "Approved by Finance" : ""}
                    onClick={() => open(c)}
                  >
                    <i className="bi bi-pencil" /> Update
                  </button>
                  )}
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr><td colSpan={11} className="text-center text-muted py-4">{isLoading ? "Loading…" : "No CO/PO found."}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={`Invoice Released — ${target ? coLabel(target.co) : ""}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setTarget(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={save.isPending} onClick={() => { setPending(null); if (target.value === "yes") setConfirming(true); else save.mutate(target); }}>Save</button>
          </>
        }
      >
        {target && (
          <>
            <label className="form-label">Invoice Released</label>
            <div className="d-flex gap-3">
              {[["", "Not Set"], ["yes", "Yes"], ["no", "No"]].map(([v, label]) => (
                <div className="form-check" key={label}>
                  <input
                    className="form-check-input"
                    type="radio"
                    id={`inv-${label}`}
                    checked={target.value === v}
                    onChange={() => { setPending(null); setTarget({ ...target, value: v }); }}
                  />
                  <label className="form-check-label" htmlFor={`inv-${label}`}>{label}</label>
                </div>
              ))}
            </div>
            {target.value === "yes" && !pending && (
              <div className="form-text mt-2">Saving as Yes sends this CO/PO to Finance once all its linked submissions are completed.</div>
            )}
            {pending && (
              <div className="alert alert-warning mt-3 mb-0">
                <div className="fw-semibold mb-1"><i className="bi bi-exclamation-triangle-fill" /> {pending.message}</div>
                <ul className="mb-0 ps-3">
                  {pending.list.map((s) => <li key={s.id}>#{s.id} {s.name}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={confirming && !!target}
        onClose={() => setConfirming(false)}
        aboveModals
        title="Send to Finance?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirming(false)}>No, go back</button>
            <button className="btn btn-success" disabled={save.isPending} onClick={() => save.mutate(target)}>Yes, send to Finance</button>
          </>
        }
      >
        <p className="mb-0">
          Release the invoice for <strong>{target ? coLabel(target.co) : ""}</strong> and send it to Finance? Its linked submissions will be marked Invoice Released.
        </p>
      </Modal>
    </div>
  );
}

/** Admins and users granted "Invoice Released" editing in Settings only. */
function Guard({ children }) {
  const { user } = useAuth();
  const router = useRouter();
  const ok = !!user?.permissions?.editInvoiceReleased;
  useEffect(() => {
    if (user && !ok) router.replace("/");
  }, [user, ok, router]);
  return ok ? children : null;
}

export default function ManagementDashboardPage() {
  return (
    <AppLayout allow={["admin", "management", "team_lead", "user"]}>
      <Guard><ManagementDashboard /></Guard>
    </AppLayout>
  );
}
