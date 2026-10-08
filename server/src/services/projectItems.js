// Serialisation + status rules for a project's CO/PO and RFI/Clarification items.
const statusEngine = require("./statusEngine");

const iso = (d) => statusEngine.fmtDateOnlyISO(d);
const todayISO = () => new Date().toISOString().slice(0, 10);
const round2 = (n) => Math.round(n * 100) / 100;

function linked(ids, recordsByLegacyId) {
  return (ids || []).map((id) => {
    const r = recordsByLegacyId.get(id);
    return { id: String(id), name: r ? r.submission_name : "(unavailable)", due_date: r ? r.due_date : "" };
  });
}

function serializeChangeOrder(c, recordsByLegacyId = new Map()) {
  return {
    id: String(c._id),
    kind: c.kind || "CO",
    co_number: c.coNumber,
    date: iso(c.date),
    change: c.change,
    notes: c.notes || "",
    tonnage: c.tonnage || 0,
    currency: c.currency || "USD",
    rate_per_ton: c.ratePerTon || 0,
    total: round2((c.tonnage || 0) * (c.ratePerTon || 0)),
    status: c.status,
    created_by: c.createdBy || "",
    created_at: c.createdAt ? new Date(c.createdAt).toISOString() : "",
    linked_submissions: linked(c.linkedSubmissions, recordsByLegacyId),
  };
}

/** returned = every question answered; overdue = not returned and past the expected response date. */
function serializeRfi(r, recordsByLegacyId = new Map()) {
  const questions = (r.questions || []).map((q) => ({
    id: String(q._id),
    text: q.text,
    response: q.response || "",
    response_date: iso(q.responseDate),
  }));
  const received = questions.filter((q) => q.response_date).length;
  const returned = questions.length > 0 && received === questions.length;
  const expected = iso(r.expectedResponseDate);
  const status = returned ? "returned" : expected && expected < todayISO() ? "overdue" : "pending";
  return {
    id: String(r._id),
    type: r.type,
    rfi_number: r.rfiNumber || "",
    title: r.title,
    questions,
    date: iso(r.date),
    expected_response_date: expected,
    status,
    progress_pct: questions.length ? Math.round((received / questions.length) * 100) : 0,
    created_by: r.createdBy || "",
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : "",
    linked_submissions: linked(r.linkedSubmissions, recordsByLegacyId),
  };
}

module.exports = { serializeChangeOrder, serializeRfi };
