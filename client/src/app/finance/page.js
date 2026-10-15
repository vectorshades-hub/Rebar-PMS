"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AppLayout from "../../components/AppLayout";
import PageHero from "../../components/PageHero";
import StatPill from "../../components/StatPill";
import { CoFilterBar, SortTh, StatusPill, coLabel, coQty, coRate, fmtDateTime, money, useCoFilters } from "../../components/CoDashboardShared";
import { api, ApiError } from "../../lib/api";
import { useToast } from "../../lib/ToastContext";

function FinanceDashboard() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["finance-dashboard"], queryFn: () => api.get("/dashboards/finance") });
  const items = data?.items || [];
  const { f, set, rows, sort, toggleSort } = useCoFilters(items, { defaultSort: { col: "released", dir: "desc" } });
  const [ackFilter, setAckFilter] = useState(null); // null = all, true = acknowledged, false = not

  const acked = (c) => c.status === "finance_approved";
  const shown = ackFilter === null ? rows : rows.filter((c) => acked(c) === ackFilter);

  const acknowledge = useMutation({
    mutationFn: (id) => api.post(`/dashboards/finance/${id}/acknowledge`),
    onSuccess: (res) => toast.success(res.message),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to acknowledge."),
    onSettled: () => qc.invalidateQueries({ queryKey: ["finance-dashboard"] }),
  });
  const th = { sort, onSort: toggleSort };

  return (
    <div>
      <PageHero theme="navy" icon="bi-cash-stack" title="Finance Dashboard" meta="Change Orders released to finance from the Management Dashboard" />

      <div className="d-flex flex-wrap gap-2 mb-3">
        <StatPill num={items.length} label="All released COs" color="#0f766e" active={ackFilter === null} onClick={() => setAckFilter(null)} />
        <StatPill num={items.filter(acked).length} label="Acknowledged" color="#15803d" active={ackFilter === true} onClick={() => setAckFilter(true)} />
        <StatPill num={items.filter((c) => !acked(c)).length} label="Not acknowledged" color="#dc2626" active={ackFilter === false} onClick={() => setAckFilter(false)} />
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
              <SortTh col="tonnage" label="Hours / Tons" {...th} />
              <SortTh col="rate" label="Rate" {...th} />
              <SortTh col="total" label="Total" {...th} />
              <SortTh col="released" label="Released" {...th} />
              <SortTh col="status" label="Status" {...th} />
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id}>
                <td>{c.project}</td>
                <td>{c.client}</td>
                <td className="fw-bold">{coLabel(c)}</td>
                <td>{c.date}</td>
                <td>{c.change}</td>
                <td>{coQty(c)}</td>
                <td>{coRate(c)}</td>
                <td className="fw-bold">{money(c.currency, c.total)}</td>
                <td>
                  <div className="small fw-semibold">{c.released_by}</div>
                  <div className="small text-muted">{fmtDateTime(c.released_at)}</div>
                </td>
                <td>
                  {acked(c) ? (
                    <>
                      <StatusPill status={c.status} />
                      <div className="small text-muted mt-1">{c.acknowledged_by} · {fmtDateTime(c.acknowledged_at)}</div>
                    </>
                  ) : (
                    <button
                      className="btn btn-sm btn-outline-success"
                      disabled={acknowledge.isPending && acknowledge.variables === c.id}
                      onClick={() => acknowledge.mutate(c.id)}
                    >
                      <i className="bi bi-check2" /> Acknowledge
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr><td colSpan={10} className="text-center text-muted py-4">{isLoading ? "Loading…" : "No released CO/PO yet."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FinanceDashboardPage() {
  return (
    <AppLayout allow={["admin", "finance"]}>
      <FinanceDashboard />
    </AppLayout>
  );
}
