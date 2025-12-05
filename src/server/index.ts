import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import http from 'http';
import authRoutes from './routes/auth.routes';
import teamRoutes from './routes/team.routes';
import checkinRoutes from './routes/checkin.routes';
import workItemRoutes from './routes/workitem.routes';
import aiRoutes from './routes/ai.routes';
import backlogRoutes from './routes/backlog.routes';
import weeklyReportRoutes from './routes/weekly-report.routes';
import standupRoutes from './routes/standup.routes';
import { errorHandler } from './middleware/error.middleware';
import { initDatabase } from './database/init';
import { initStandupSocket } from './websocket/standup';

// Robust .env loader for IIS/iisnode and local
(() => {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
  ];
  let loadedFrom: string | null = null;
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        dotenv.config({ path: p });
        loadedFrom = p;
        break;
      }
    } catch {
      // ignore
    }
  }
  if (!loadedFrom) {
    dotenv.config(); // fallback default
  }
  // Minimal, safe summary for troubleshooting (do not print secrets)
  try {
    const pwdLen = (process.env.DB_PASSWORD || '').length;
    // eslint-disable-next-line no-console
    console.log('[ENV] .env loaded from:', loadedFrom || 'default');
    // eslint-disable-next-line no-console
    console.log('[ENV] DB_HOST:', process.env.DB_HOST, 'DB_USER:', process.env.DB_USER, 'DB_PASSWORD length:', pwdLen);
  } catch {
    // ignore
  }
})();

const app: Application = express();
app.set('etag', false);
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const SKIP_DB_INIT = (process.env.SKIP_DB_INIT || 'false').toLowerCase() === 'true';
let DB_READY = false;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  hsts: false,
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/api/workitems', workItemRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/backlog', backlogRoutes);
app.use('/api/weekly-reports', weeklyReportRoutes);
app.use('/api/standup', standupRoutes);

// Serve static files from the React app
const clientBuildPath = path.join(__dirname, '../client/build');
app.use(express.static(clientBuildPath));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: SKIP_DB_INIT ? 'skipped' : (DB_READY ? 'ready' : 'error'),
    env: process.env.NODE_ENV,
  });
});

// Error handling
app.use(errorHandler);

// Initialize database and start server
const startServer = async () => {
  try {
    if (!SKIP_DB_INIT) {
      await initDatabase();
      DB_READY = true;
      console.log('✓ Database initialized');
    } else {
      console.warn('⚠ SKIP_DB_INIT is true; skipping database initialization');
    }
  } catch (error) {
    DB_READY = false;
    console.error('Failed to initialize database:', error);
    // Do not exit; allow app to start so health and static content still work
  }

  initStandupSocket(server);

  server.listen(PORT, () => {
    console.log(`✓ Server is running on port ${PORT}`);
    console.log(`✓ Environment: ${process.env.NODE_ENV}`);
    console.log(`✓ DB status: ${SKIP_DB_INIT ? 'skipped' : (DB_READY ? 'ready' : 'error')}`);
  });
};

startServer();

export default app;
