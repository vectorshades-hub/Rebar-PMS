/** 401 unless there's a logged-in session. */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.username || !req.session.role) {
    return res.status(401).json({ ok: false, error: "Not authenticated" });
  }
  next();
}

/** 401 unless logged in, 403 unless the session role is one of `roles`. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.username || !req.session.role) {
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    }
    if (!roles.includes(req.session.role)) {
      return res.status(403).json({ ok: false, error: "Permission denied" });
    }
    next();
  };
}

/** 403 for the listed roles (an unauthenticated request falls through to the route's own auth check). */
function denyRoles(...roles) {
  return (req, res, next) => {
    if (req.session && roles.includes(req.session.role)) {
      return res.status(403).json({ ok: false, error: "Permission denied" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, denyRoles };
