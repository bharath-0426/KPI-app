require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initSchema, runMigrations } = require('./db/schema');
const { attachEmployee } = require('./middleware/auth');

// Routes
const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const metaRoutes = require('./routes/meta');
const periodRoutes = require('./routes/periods');
const scoringRoutes = require('./routes/scoring');
const reconcileRoutes = require('./routes/reconcile');
const distributionRoutes = require('./routes/distribution');
const dashboardRoutes = require('./routes/dashboard');
const kpiTemplateRoutes = require('./routes/kpiTemplates');
const reportRoutes = require('./routes/reports');
const departmentRoutes = require('./routes/departments');
const roleRoutes = require('./routes/roles');
const kpiAttributeRoutes = require('./routes/kpiAttributes');
const scoreTypeRoutes = require('./routes/scoreTypes');
const frequencyRoutes = require('./routes/frequencies');
const ratingsRoutes = require('./routes/ratings');
const settingsRoutes = require('./routes/settings');
const notificationRoutes = require('./routes/notifications');

const app = express();
app.use(helmet());
app.use(compression());
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

const CLIENT_BUILD = path.join(__dirname, '../../client/dist');
const IS_BUILT = fs.existsSync(CLIENT_BUILD);

// ── Middleware ────────────────────────────────────────────────────────────────
// In dev (no build), allow Vite dev server on 5173. In production, same origin.
if (!IS_BUILT) {
  app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true,
  }));
}
app.use(express.json());

// Session store using better-sqlite3 (no native sqlite3 needed)
const Database = require('better-sqlite3');
const BetterSqliteStore = require('better-sqlite3-session-store')(session);
const sessionDb = new Database(path.join(__dirname, '../data/sessions.db'));

app.use(session({
  store: new BetterSqliteStore({ client: sessionDb }),
  secret: process.env.SESSION_SECRET || 'kpi-app-dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,          // must be false for localhost (no HTTPS)
    sameSite: 'strict',
    maxAge: 1000 * 60 * 60 * 8, // 8 hours
  },
}));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString().slice(11,19)} ${req.method} ${req.path}`);
  next();
});
app.use(attachEmployee);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/kpi-attributes', kpiAttributeRoutes);
app.use('/api/score-types', scoreTypeRoutes);
app.use('/api/frequencies', frequencyRoutes);
app.use('/api/periods', periodRoutes);
app.use('/api/scoring', scoringRoutes);
app.use('/api/reconcile', reconcileRoutes);
app.use('/api/distribution', distributionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/kpi-templates', kpiTemplateRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/ratings', ratingsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', metaRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Serve built React app (production) ───────────────────────────────────────
if (IS_BUILT) {
  app.use(express.static(CLIENT_BUILD));
  // SPA fallback — React Router handles client-side routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_BUILD, 'index.html'));
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
initSchema();
runMigrations();
const server = app.listen(PORT, () => {
  console.log(`KPI server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nERROR: Port ${PORT} is already in use.`);
    console.error(`Kill the existing process first:\n  powershell -Command "Get-Process -Name node | Stop-Process -Force"\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
