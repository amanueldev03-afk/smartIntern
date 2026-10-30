import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { Op } from 'sequelize';

import { PORT, MEDIA_ROOT } from './src/config/env.js';
import sequelize, { connectDB } from './src/config/database.js';
import models, { User, Skill, CareerInterest, Internship, DataSource } from './src/models/index.js';
import { hashPassword } from './src/services/authService.js';

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
app.use(cors({
  origin: '*',
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

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  const status = err.status || 500;
  return res.status(status).json({
    detail: err.message || 'Internal server error.',
    error: err.toString(),
  });
});

// -------------------------------------------------------------
// Seed Database with Initial Data
// -------------------------------------------------------------
const seedInitialData = async () => {
  try {
    // 1. Ensure Admin User exists
    let admin = await User.findOne({
      where: {
        [Op.or]: [{ email: 'admin@smartintern.et' }, { email: 'admin1@smartintern.et' }, { username: 'admin' }]
      }
    });
    if (!admin) {
      const pw = await hashPassword('AdminPassword123!');
      await User.create({
        email: 'admin@smartintern.et',
        username: 'admin',
        password: pw,
        first_name: 'System',
        last_name: 'Administrator',
        role: 'admin',
        is_staff: true,
        is_superuser: true,
        is_active: true,
        is_email_verified: true,
        is_approved: true,
      });
      console.log('[Seed] Admin account provisioned: admin@smartintern.et / AdminPassword123!');
    }

    // 2. Ensure Student User exists
    let student = await User.findOne({
      where: {
        [Op.or]: [{ email: 'student@smartintern.et' }, { email: 'student@example.com' }, { username: 'student' }]
      }
    });
    if (!student) {
      const pw = await hashPassword('StudentPassword123!');
      await User.create({
        email: 'student@smartintern.et',
        username: 'student',
        password: pw,
        first_name: 'Amanuel',
        last_name: 'Student',
        role: 'student',
        is_active: true,
        is_email_verified: true,
        is_approved: true,
      });
      console.log('[Seed] Student provisioned: student@smartintern.et / StudentPassword123!');
    }

    // 3. Ensure Skills exist
    const initialSkills = [
      'Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Express',
      'Django', 'PostgreSQL', 'Docker', 'Machine Learning', 'Git', 'REST API'
    ];
    for (const name of initialSkills) {
      await Skill.findOrCreate({ where: { name }, defaults: { name, category: 'Technical' } });
    }

    // 4. Ensure Interests exist
    const initialInterests = [
      'Software Engineering', 'Artificial Intelligence', 'Web Development',
      'Data Science', 'Cloud Computing', 'Cybersecurity'
    ];
    for (const name of initialInterests) {
      await CareerInterest.findOrCreate({ where: { name }, defaults: { name } });
    }

    // 5. Ensure Data Sources exist
    await DataSource.findOrCreate({
      where: { name: 'Ethiopian Career Portal' },
      defaults: {
        name: 'Ethiopian Career Portal',
        base_url: 'https://careers.et',
        type: 'api',
        description: 'Primary Ethiopian career aggregation portal',
        is_active: true,
        config: {}
      }
    });

    // 6. Ensure sample Internships exist
    const internshipCount = await Internship.count();
    if (internshipCount === 0) {
      await Internship.bulkCreate([
        {
          title: 'Full Stack Software Engineer Intern',
          organization_name: 'Commercial Bank of Ethiopia (CBE)',
          description: 'Build enterprise fintech web applications using React, Node.js, and PostgreSQL with high scalability.',
          category: 'Software Engineering',
          country: 'Ethiopia',
          city: 'Addis Ababa',
          internship_type: 'onsite',
          work_type: 'full_time',
          compensation_type: 'paid',
          minimum_compensation: 5000,
          maximum_compensation: 8000,
          compensation_currency: 'ETB',
          required_skills: ['React', 'Node.js', 'JavaScript', 'PostgreSQL'],
          preferred_skills: ['Docker', 'Git'],
          duration_min_weeks: 12,
          duration_max_weeks: 16,
          is_verified: true,
          status: 'active',
        },
        {
          title: 'Machine Learning & AI Intern',
          organization_name: 'Artificial Intelligence Institute of Ethiopia',
          description: 'Develop NLP models for local Ethiopian languages (Amharic, Afaan Oromoo) and computer vision systems.',
          category: 'Artificial Intelligence',
          country: 'Ethiopia',
          city: 'Addis Ababa',
          internship_type: 'hybrid',
          work_type: 'full_time',
          compensation_type: 'paid',
          minimum_compensation: 6000,
          maximum_compensation: 9000,
          compensation_currency: 'ETB',
          required_skills: ['Python', 'Machine Learning', 'Git'],
          preferred_skills: ['PyTorch', 'Docker'],
          duration_min_weeks: 12,
          duration_max_weeks: 16,
          is_verified: true,
          status: 'active',
        },
        {
          title: 'Backend Node.js Developer Intern',
          organization_name: 'Ethio Telecom',
          description: 'Develop high-performance REST APIs and microservices for digital telecommunications infrastructure.',
          category: 'Software Engineering',
          country: 'Ethiopia',
          city: 'Addis Ababa',
          internship_type: 'remote',
          work_type: 'full_time',
          compensation_type: 'paid',
          minimum_compensation: 4500,
          maximum_compensation: 7500,
          compensation_currency: 'ETB',
          required_skills: ['Node.js', 'Express', 'JavaScript', 'REST API', 'PostgreSQL'],
          preferred_skills: ['Docker', 'Redis'],
          duration_min_weeks: 8,
          duration_max_weeks: 12,
          is_verified: true,
          status: 'active',
        }
      ]);
      console.log('[Seed] Sample internships created.');
    }
  } catch (err) {
    console.error('[Seed] Warning during initial seed:', err.message);
  }
};

// -------------------------------------------------------------
// Server Start
// -------------------------------------------------------------
const startServer = async () => {
  try {
    await connectDB();
    await sequelize.sync();
    console.log('[Database] Models synchronized.');

    await seedInitialData();

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
