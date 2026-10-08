const express = require("express");
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const env = require("./config/env");

const authRoutes = require("./routes/auth");
const recordsRoutes = require("./routes/records");
const usersRoutes = require("./routes/users");
const projectsRoutes = require("./routes/projects");
const projectItemsRoutes = require("./routes/projectItems");
const completedLogRoutes = require("./routes/completedLog");
const settingsRoutes = require("./routes/settings");
const reportsRoutes = require("./routes/reports");
const dashboardsRoutes = require("./routes/dashboards");
const requestLogRoutes = require("./routes/requestLog");
const requestLogger = require("./middleware/requestLogger");
const { denyRoles } = require("./middleware/auth");

const app = express();

app.set("trust proxy", 1);

app.use(
  cors({
    // Reflects the request origin (localhost, LAN IP, ...) — internal tool used from many devices.
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(
  session({
    name: "rebar.sid",
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: env.mongoUri, collectionName: "sessions" }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    },
  })
);

app.use(requestLogger);
app.use("/api/auth", authRoutes);
// Finance users only get the Finance dashboard — keep them out of submission / project data.
app.use(["/api/records", "/api/projects", "/api/completed-log", "/api/reports"], denyRoles("finance"));
app.use("/api/records", recordsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/projects", projectItemsRoutes);
app.use("/api/completed-log", completedLogRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/dashboards", dashboardsRoutes);
app.use("/api/request-log", requestLogRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[UNHANDLED ERROR]", err);
  res.status(500).json({ ok: false, error: err.message || "Internal server error" });
});

module.exports = app;
