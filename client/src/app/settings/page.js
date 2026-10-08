"use client";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "../../components/AppLayout";
import PageHero from "../../components/PageHero";
import PermissionEditor from "../../components/PermissionEditor";
import { api } from "../../lib/api";

/**
 * Admin-only app configuration: independent "who can do X" lists, each saved on
 * its own. Admins can always do all three, so they're left out of the pickers.
 */
export default function SettingsPage() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["settings"], queryFn: () => api.get("/settings") });
  const selectableUsers = (data?.users || []).filter((u) => !["admin", "finance"].includes(u.role));

  async function saveList(field, usernames) {
    const res = await api.post("/settings", { [field]: usernames });
    refetch();
    return res;
  }

  return (
    <AppLayout allow={["admin"]}>
      <PageHero theme="navy" icon="bi-gear-fill" title="Settings" meta="Who can edit, delete, release invoices and edit the completed log" />

      {isLoading || !data ? (
        <p className="text-muted small">Loading…</p>
      ) : (
        <div className="settings-grid">
          <PermissionEditor
            icon="bi-receipt"
            color="blue"
            title="Invoice Released — Who Can Edit"
            description='Admins can always change the "Invoice Released" field. Pick anyone else who should also be able to — only these users see the Invoice Released control in the Edit form and can use the toggle in the records listing. Everyone else sees it read-only.'
            emptyNote="No one selected yet — only admins can change Invoice Released."
            users={selectableUsers}
            initial={data.invoice_release_editors || []}
            onSave={(usernames) => saveList("invoice_release_editors", usernames)}
          />

          <PermissionEditor
            icon="bi-check2-square"
            color="green"
            title="Completed Log - Who Can Edit"
            description="Admins can always edit completed submissions. Users picked here (besides admins) can open the Completed Log and edit completed submissions from it."
            emptyNote="No one selected yet - only admins can edit the Completed Log."
            users={selectableUsers}
            initial={data.completed_log_editors || []}
            onSave={(usernames) => saveList("completed_log_editors", usernames)}
          />

          <PermissionEditor
            icon="bi-pencil-square"
            color="amber"
            title="Update Records — Who Can Edit"
            description="Admins can always edit a record. Only the users picked here (besides admins) get the Edit button and can update records."
            emptyNote="No one selected yet — only admins can update records."
            users={selectableUsers}
            initial={data.record_updaters || []}
            onSave={(usernames) => saveList("record_updaters", usernames)}
          />

          <PermissionEditor
            icon="bi-trash"
            color="rose"
            title="Delete Records — Who Can Delete"
            description="Admins can always delete a record. Only the users picked here (besides admins) get the Delete button and can delete records."
            emptyNote="No one selected yet — only admins can delete records."
            users={selectableUsers}
            initial={data.record_deleters || []}
            onSave={(usernames) => saveList("record_deleters", usernames)}
          />
        </div>
      )}
    </AppLayout>
  );
}
