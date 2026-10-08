"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AppLayout from "../../components/AppLayout";
import PageHero from "../../components/PageHero";
import Modal from "../../components/Modal";
import { api, ApiError } from "../../lib/api";
import { useToast } from "../../lib/ToastContext";
import { ROLE_BADGE_STYLES, ROLE_LABELS } from "../../lib/statusStyles";

const ROLES = ["admin", "management", "team_lead", "user", "finance"];
const EMPTY = { id: null, username: "", password: "", role: "user", linked_tls: [] };

/** Admin-only user management. Passwords are stored (and shown) as plain text for now. */
function UsersAdmin() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["users"], queryFn: () => api.get("/users") });
  const users = data?.users || [];
  const [form, setForm] = useState(null); // null = closed
  // Linkable teams = team lead and management users (never the user being edited)
  const teamOptions = users.filter((u) => ["team_lead", "management"].includes(u.role) && u.id !== form?.id).map((u) => u.username);

  const [deleteTarget, setDeleteTarget] = useState(null);

  const save = useMutation({
    mutationFn: (f) => {
      const body = { username: f.username, password: f.password, role: f.role, linked_tls: f.linked_tls };
      return f.id ? api.put(`/users/${f.id}`, body) : api.post("/users", body);
    },
    onSuccess: (res) => {
      toast.success(res.message);
      setForm(null);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to save user."),
  });
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/users/${id}`),
    onSuccess: (res) => {
      toast.success(res.message);
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to delete user."),
  });

  const toggleTl = (tl) =>
    setForm((f) => ({ ...f, linked_tls: f.linked_tls.includes(tl) ? f.linked_tls.filter((x) => x !== tl) : [...f.linked_tls, tl] }));

  return (
    <div>
      <PageHero
        theme="navy"
        icon="bi-people-fill"
        title="Users"
        meta={`${users.length} user${users.length === 1 ? "" : "s"}`}
        right={<button className="btn btn-dark btn-sm" onClick={() => setForm({ ...EMPTY })}><i className="bi bi-person-plus-fill" /> Add User</button>}
      />
      <div className="table-wrap">
        <table className="table table-sm mb-0">
          <thead>
            <tr><th>#</th><th>Username</th><th>Password</th><th>Role</th><th>Linked Teams</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const rs = ROLE_BADGE_STYLES[u.role] || ROLE_BADGE_STYLES.user;
              return (
                <tr key={u.id}>
                  <td>{i + 1}</td>
                  <td>{u.username}</td>
                  <td><code>{u.password}</code></td>
                  <td><span className="badge" style={{ background: rs.bg, color: rs.fg }}>{ROLE_LABELS[u.role]}</span></td>
                  <td>{(u.linked_tls || []).join(", ")}</td>
                  <td className="text-nowrap">
                    <button className="btn btn-sm btn-outline-primary" onClick={() => setForm({ id: u.id, username: u.username, password: "", role: u.role, linked_tls: u.linked_tls || [] })}>
                      <i className="bi bi-pencil" />
                    </button>
                    <button className="btn btn-sm btn-outline-danger ms-1" onClick={() => setDeleteTarget(u)}>
                      <i className="bi bi-trash" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit User" : "Add User"}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate(form)}>Save</button>
          </>
        }
      >
        {form && (
          <>
            <label className="form-label">Username</label>
            <input className="form-control mb-2" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
            <label className="form-label">Password {form.id && <span className="text-muted small">(leave blank to keep current)</span>}</label>
            <input className="form-control mb-2" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            <label className="form-label">Role</label>
            <select className="form-select mb-2" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            {(form.role === "user" || form.role === "management") && (
              <>
                <label className="form-label">Linked teams (team lead / management users whose records this user can see{form.role === "management" ? "; none selected = all teams" : ""})</label>
                <div className="d-flex flex-wrap gap-2">
                  {teamOptions.length === 0 && <span className="text-muted small">No team lead or management users yet.</span>}
                  {teamOptions.map((tl) => (
                    <button key={tl} type="button" className={`team-btn${form.linked_tls.includes(tl) ? " selected" : ""}`} onClick={() => toggleTl(tl)}>
                      {tl}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete User"
        theme="danger"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="btn btn-danger" disabled={remove.isPending} onClick={() => remove.mutate(deleteTarget.id)}>Delete</button>
          </>
        }
      >
        <p className="mb-0">Delete user <strong>{deleteTarget?.username}</strong>?</p>
      </Modal>
    </div>
  );
}

export default function UsersPage() {
  return (
    <AppLayout allow={["admin"]}>
      <UsersAdmin />
    </AppLayout>
  );
}
