# Rebar Project Management System (RPMS)

A full-stack web application for managing rebar detailing projects: tracking projects, clients, change orders (CO), purchase orders (PO), submissions, request logs, completed work, and finance, with role-based access and Excel report export.

## Tech Stack

| Layer    | Technology |
|----------|------------|
| Frontend | Next.js 14 (App Router), React 18, TanStack React Query |
| Backend  | Node.js, Express 4, Mongoose 8 |
| Database | MongoDB (sessions stored via connect-mongo) |
| Reports  | ExcelJS |

## Project Structure

```
RPMS/
├── client/                 # Next.js frontend (port 5006)
│   ├── public/             # Static assets (logo, favicons)
│   └── src/
│       ├── app/            # Pages: dashboard, projects, finance, management,
│       │                   #        completed-log, request-log, users, settings, login
│       ├── components/     # Shared UI components
│       ├── hooks/          # Data hooks (useRecords)
│       └── lib/            # API client, auth, query & toast providers
└── server/                 # Express API (port 8006)
    └── src/
        ├── config/         # Environment and DB connection
        ├── middleware/     # Auth, request logger, async handler
        ├── models/         # Mongoose models
        ├── routes/         # REST endpoints under /api
        ├── services/       # Status engine, permissions, settings, bootstrap admin
        └── utils/
```

## Prerequisites

- Node.js 18+
- MongoDB Community Edition running locally (or a MongoDB connection string)

## Getting Started

### 1. Server

```bash
cd server
npm install
cp .env.example .env      # then edit values
npm run dev               # or: npm start
```

### 2. Client

```bash
cd client
npm install
cp .env.local.example .env.local
npm run dev
```

Open http://localhost:5006.

## Configuration

**server/.env**

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_URI` | `mongodb://localhost:27017/rebar_db` | MongoDB connection string |
| `PORT` | `8006` | API port |
| `SESSION_SECRET` | — | Long random string for signing sessions (**change it**) |
| `COMPLETED_DAYS_GRACE` | `5` | Days completed items stay visible |
| `COMPLETED_DAYS_GRACE_EXTENDED` | `15` | Extended visibility window |
| `DUE_SOON_DAYS` | `3` | Threshold for "due soon" status |

**client/.env.local**

| Variable | Example |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8006/api` |

## Default Login

On first start, if no users exist, an admin account is created automatically:

- Username: `admin`
- Password: `admin123`

**Change this password immediately after first login.**

## Scripts

| Location | Command | Purpose |
|----------|---------|---------|
| server | `npm run dev` | Start API with nodemon |
| server | `npm start` | Start API |
| client | `npm run dev` | Start Next.js dev server on port 5006 |
| client | `npm run build` / `npm start` | Production build / serve |
| client | `npm run lint` | Lint |

## Security Notes

- Never commit `.env` or `.env.local`; only the `.example` files are tracked.
- Set a strong `SESSION_SECRET` in production.
