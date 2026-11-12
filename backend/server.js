import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { Op } from 'sequelize';

import { PORT, MEDIA_ROOT, CORS_ALLOWED_ORIGINS, DEBUG } from './src/config/env.js';
import sequelize, { connectDB } from './src/config/database.js';
import models, { User, Skill, CareerInterest, Internship, DataSource } from './src/models/index.js';
import { hashPassword } from './src/services/authService.js';
import { routeErrorResponse } from './src/utils/routeErrors.js';

// Route imports
import authRoutes from './src/routes/auth.js';
import studentsRoutes from './src/routes/students.js';
import internshipsRoutes from './src/routes/internships.js';
import recommendationsRoutes from './src/routes/recommendations.js';
import projectsRoutes from './src/routes/projects.js';
import logisticsRoutes from './src/routes/logistics.js';
import uilProfilesRoutes from './src/routes/uilProfiles.js';
import notificationsRoutes from './src/routes/notifications.js';
import companiesRoutes from './src/routes/companies.js';
import adminRoutes from './src/routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
const allowedOrigins = new Set(CORS_ALLOWED_ORIGINS || []);
app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (mobile apps, server-to-server, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin) || allowedOrigins.has('*')) {
      return callback(null, true);
    }
    // Allow localhost/127.0.0.1 in debug mode
    if (DEBUG && (/^http:\/\/localhost(:\d+)?$/.test(origin) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin))) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
}));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(morgan('dev'));

// Static media files
app.use('/media', express.static(MEDIA_ROOT));

// -------------------------------------------------------------
// Health and System Endpoints
// -------------------------------------------------------------
app.get('/api/health/', (req, res) => {
  return res.status(200).json({ status: 'OK' });
});

app.get('/api/schema/', (req, res) => {
  return res.status(200).json({
    openapi: '3.0.3',
    info: {
      title: 'SmartIntern-ET API',
      version: '1.0.0',
      description: 'API for AI-powered internship recommendation, clearance, and assessment platform.'
    },
    paths: {}
  });
});

app.get('/api/docs/', (req, res) => {
  res.send('<html><head><title>API Docs</title></head><body style="font-family:sans-serif;padding:2rem;"><h2>SmartIntern-ET API Documentation</h2><p>Node.js & Express REST Backend</p><a href="/api/schema/">View OpenAPI Schema</a></body></html>');
});

app.get('/api/redoc/', (req, res) => {
  res.send('<html><head><title>ReDoc</title></head><body style="font-family:sans-serif;padding:2rem;"><h2>SmartIntern-ET ReDoc</h2><a href="/api/schema/">View OpenAPI Schema</a></body></html>');
});

// -------------------------------------------------------------
// API Route Registration
// -------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/accounts', authRoutes);
app.use('/api/v1/accounts', authRoutes);

app.use('/api/students', studentsRoutes);
app.use('/api/v1/students', studentsRoutes);

app.use('/api/internships', internshipsRoutes);
app.use('/api/v1/internships', internshipsRoutes);
app.use('/api/applications', internshipsRoutes);
app.use('/api/v1/applications', internshipsRoutes);

app.use('/api/recommendations', recommendationsRoutes);

app.use('/api/v1/projects', projectsRoutes);
app.use('/api/projects', projectsRoutes);

app.use('/api/v1/logistics', logisticsRoutes);
app.use('/api/logistics', logisticsRoutes);

app.use('/api/v1/uil-profiles', uilProfilesRoutes);
app.use('/api/uil-profiles', uilProfilesRoutes);
app.use('/api/v1/uil', uilProfilesRoutes);

app.use('/api/v1/teams', projectsRoutes);
app.use('/api/teams', projectsRoutes);

app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/notifications', notificationsRoutes);

app.use('/api/v1/companies', companiesRoutes);
app.use('/api/companies', companiesRoutes);

app.use('/api/admin', adminRoutes);
app.use('/api/v1/admin', adminRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  const mapped = routeErrorResponse(err, 'Internal server error.');
  return res.status(mapped.status).json({ detail: mapped.detail });
});

// -------------------------------------------------------------
// Load Seed Data (Development Only)
// -------------------------------------------------------------
const loadSeedData = async () => {
  // Only seed in development environment
  if (process.env.NODE_ENV !== 'production') {
    try {
      const seed = (await import('./db/seed.js')).default;
      await seed();
    } catch (err) {
      console.error('[Seed] Failed to load seed data:', err.message);
      // Don't fail server startup if seed fails
    }
  }
};

// -------------------------------------------------------------
// Server Start
// -------------------------------------------------------------
const startServer = async () => {
  try {
    await connectDB();
    
    // In development, allow migrations via npm script. In production, use migrations explicitly.
    if (process.env.NODE_ENV === 'development' && process.env.AUTO_MIGRATE === 'true') {
      console.log('[Database] WARNING: AUTO_MIGRATE is enabled. Using sequelize.sync() is unsafe.');
      await sequelize.sync();
      console.log('[Database] Models synchronized (unsafe). Use migrations in production.');
    } else {
      console.log('[Database] Models loaded. Run migrations with: node db/migrate.js up');
    }

    await loadSeedData();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[SmartIntern-ET] Node & Express Backend running on http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
