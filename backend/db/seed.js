/**
 * Development Seed Data
 * Creates initial reference data for development environment
 * 
 * WARNING: This should NEVER be run in production
 * Uses environment variable NODE_ENV to prevent production execution
 */

import { Op } from 'sequelize';
import {
  User,
  Skill,
  CareerInterest,
  DataSource,
  Internship
} from '../src/models/index.js';
import { hashPassword } from '../src/services/authService.js';
import sequelize from '../src/config/database.js';

export const seed = async () => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed data cannot be run in production environment');
  }

  console.log('[Seed] Starting development seed data...');

  try {
    // 1. Ensure Admin User exists
    let admin = await User.findOne({
      where: {
        [Op.or]: [{ email: 'admin@smartintern.et' }, { email: 'admin1@smartintern.et' }, { username: 'admin' }]
      }
    });
    if (!admin) {
      const pw = await hashPassword('AdminPassword123!');
      admin = await User.create({
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
      student = await User.create({
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
    console.log(`[Seed] ${initialSkills.length} skills seeded.`);

    // 4. Ensure Interests exist
    const initialInterests = [
      'Software Engineering', 'Artificial Intelligence', 'Web Development',
      'Data Science', 'Cloud Computing', 'Cybersecurity'
    ];
    for (const name of initialInterests) {
      await CareerInterest.findOrCreate({ where: { name }, defaults: { name } });
    }
    console.log(`[Seed] ${initialInterests.length} career interests seeded.`);

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
    console.log('[Seed] Data source configured.');

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
          minimum_compensation: '5000.00',
          maximum_compensation: '8000.00',
          compensation_currency: 'ETB',
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
          minimum_compensation: '6000.00',
          maximum_compensation: '9000.00',
          compensation_currency: 'ETB',
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
          minimum_compensation: '4500.00',
          maximum_compensation: '7500.00',
          compensation_currency: 'ETB',
          preferred_skills: ['Docker', 'Redis'],
          duration_min_weeks: 8,
          duration_max_weeks: 12,
          is_verified: true,
          status: 'active',
        }
      ]);
      console.log('[Seed] 3 sample internships created.');
    }

    console.log('[Seed] Development seed data completed successfully.');
  } catch (err) {
    console.error('[Seed] Seed failed:', err);
    throw err;
  }
};

export default seed;
