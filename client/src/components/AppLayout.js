"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/AuthContext";
import ReportsExportModal from "./ReportsExportModal";
import { ROLE_BADGE_STYLES, ROLE_LABELS } from "../lib/statusStyles";

/**
 * Persistent role-aware layout — wrap every authenticated page in this.
 * `allow` (optional array of roles) redirects to /login when signed out, or
 * back to the records index when the role isn't allowed.
 */
export default function AppLayout({ children, allow }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [reportsOpen, setReportsOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (allow && !allow.includes(user.role)) router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  if (loading || !user || (allow && !allow.includes(user.role))) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: "100vh" }}>
        <div className="spinner-border text-secondary" role="status" />
      </div>
    );
  }

  const role = user.role;
  const roleStyle = ROLE_BADGE_STYLES[role] || ROLE_BADGE_STYLES.user;

  return (
    <div className="d-flex flex-column" style={{ minHeight: "100vh" }}>
      <nav className="st-navbar">
        <a href="/" className="d-flex align-items-center gap-2 text-decoration-none">
          <img src="/logo.png" alt="" className="st-brand-logo" onError={(e) => (e.currentTarget.style.display = "none")} />
          <span className="st-brand-text">
            <span className="st-brand-title">Rebar PMS</span>
            <span className="st-brand-sub">Project Management System</span>
          </span>
        </a>

        <div className="d-flex align-items-center gap-3 ms-auto">
          {/* <a href="/"><i className="bi bi-table" /> Records</a> */}
          {["admin", "management", "team_lead"].includes(role) && <a href="/projects"><i className="bi bi-folder-fill" /> Projects</a>}
          {(["admin", "management", "team_lead"].includes(role) || user.permissions?.editCompletedLog) && <a href="/completed-log"><i className="bi bi-check2-square" /> Completed Log</a>}
          {["admin", "management", "team_lead"].includes(role) && (
            <a href="#" onClick={(e) => { e.preventDefault(); setReportsOpen(true); }}><i className="bi bi-file-earmark-bar-graph-fill" /> Reports</a>
          )}
          {user.permissions?.editInvoiceReleased && <a href="/management"><i className="bi bi-graph-up" /> Management Dashboard</a>}
          {["admin", "finance"].includes(role) && <a href="/finance"><i className="bi bi-cash-stack" /> Finance Dashboard</a>}
          {role === "admin" && <a href="/settings"><i className="bi bi-gear-fill" /> Settings</a>}
          {role === "admin" && <a href="/request-log"><i className="bi bi-journal-text" /> Request Log</a>}
          {role === "admin" && <a href="/users"><i className="bi bi-people-fill" /> Users</a>}
          <span className="d-flex align-items-center gap-1">
            <i className="bi bi-person-circle" /> {user.username}
            <span className="badge" style={{ background: roleStyle.bg, color: roleStyle.fg, fontSize: "0.65rem" }}>
              {ROLE_LABELS[role] || role.toUpperCase()}
            </span>
          </span>
          <button className="btn btn-sm btn-outline-light" onClick={logout}>
            <i className="bi bi-box-arrow-right" /> Logout
          </button>
        </div>
      </nav>
      <main className="p-3 flex-fill">{children}</main>
      <footer className="st-footer">
        &copy; {new Date().getFullYear()} Vectorshades LLC. All rights reserved.
        <span className="st-footer-sep">|</span>
        <i className="bi bi-lightning-charge-fill st-footer-bolt" /> Developed by R &amp; D Department, Vectorshades LLC
      </footer>
      {["admin", "management", "team_lead"].includes(role) && (
        <ReportsExportModal open={reportsOpen} onClose={() => setReportsOpen(false)} role={role} />
      )}
    </div>
  );
}
