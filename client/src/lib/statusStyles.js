export const ROLE_BADGE_STYLES = {
  admin: { bg: "#ffc107", fg: "#000" },
  management: { bg: "#0dcaf0", fg: "#000" },
  team_lead: { bg: "#198754", fg: "#fff" },
  user: { bg: "#6c757d", fg: "#fff" },
  finance: { bg: "#6f42c1", fg: "#fff" },
};

export const ROLE_LABELS = {
  admin: "ADMIN",
  management: "MANAGEMENT",
  team_lead: "TEAM LEAD",
  user: "USER",
  finance: "FINANCE",
};

// The four allowed record `Type` values — mirrors env.submissionTypes on the server.
export const BILLABLE_TYPES = ["CO", "PO", "Non Billable"];

export const SUBMISSION_TYPES = ["OFA", "FIELD USE", "REAPPROVAL", "BAR LISTING"];
