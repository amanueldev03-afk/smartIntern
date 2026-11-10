import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'crypto';
import { Op } from 'sequelize';

// Import models
import {
  User,
  StudentProfile,
  CV
} from '../src/models/index.js';

import sequelize from '../src/config/database.js';

// Use test schema
const TEST_SCHEMA = 'test_data_type_audit';

describe('Task 1.13: Data Type Audit Tests', () => {
  before(async () => {
    // Create test schema
    try {
      await sequelize.query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`);
      await sequelize.query(`SET search_path TO ${TEST_SCHEMA}, public`);
    } catch (err) {
      console.warn('Warning: Could not create test schema, using default schema:', err.message);
    }

    // Sync models (this will create tables with corrected types)
    await sequelize.sync({ force: true });
  });

  after(async () => {
    // Clean up: drop all tables in test schema
    try {
      await sequelize.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
      await sequelize.query(`SET search_path TO public`);
    } catch (err) {
      console.warn('Warning: Could not drop test schema:', err.message);
    }

    // Re-sync without schema to ensure clean state
    await sequelize.sync({ force: false });
  });

  describe('StudentProfile.current_year Type Correction', () => {
    it('should accept INTEGER values for current_year', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456',
        current_year: 4
      });

      // Verify current_year is stored as number (INTEGER)
      assert.strictEqual(typeof profile.current_year, 'number');
      assert.strictEqual(profile.current_year, 4);
    });

    it('should accept different academic year values', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456',
        current_year: 5
      });

      assert.strictEqual(typeof profile.current_year, 'number');
      assert.strictEqual(profile.current_year, 5);
    });

    it('should allow sorting by current_year as numeric', async () => {
      const user1 = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const user2 = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile1 = await StudentProfile.create({
        user_id: user1.id,
        phone: '+251911123456',
        current_year: 3
      });

      const profile2 = await StudentProfile.create({
        user_id: user2.id,
        phone: '+251911123456',
        current_year: 5
      });

      const profiles = await StudentProfile.findAll({
        where: {
          id: { [Op.in]: [profile1.id, profile2.id] }
        },
        order: [['current_year', 'ASC']]
      });

      assert.strictEqual(profiles.length, 2);
      assert.strictEqual(profiles[0].current_year, 3);
      assert.strictEqual(profiles[1].current_year, 5);
    });
  });

  describe('CV.extracted_experience_years Type Correction', () => {
    it('should accept DECIMAL values for extracted_experience_years', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const cv = await CV.create({
        student_id: user.id,
        file: 'resume.pdf',
        extracted_experience_years: '2.5'
      });

      // PostgreSQL DECIMAL is returned as string to preserve precision
      assert.strictEqual(typeof cv.extracted_experience_years, 'string');
      assert.strictEqual(cv.extracted_experience_years, '2.5');
    });

    it('should preserve exact decimal precision for partial years', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const cv = await CV.create({
        student_id: user.id,
        file: 'resume.pdf',
        extracted_experience_years: '3.7'
      });

      assert.strictEqual(cv.extracted_experience_years, '3.7');
    });

    it('should handle zero experience', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const cv = await CV.create({
        student_id: user.id,
        file: 'resume.pdf',
        extracted_experience_years: '0.0'
      });

      assert.strictEqual(cv.extracted_experience_years, '0.0');
    });

    it('should allow updating experience years', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const cv = await CV.create({
        student_id: user.id,
        file: 'resume.pdf',
        extracted_experience_years: '1.0'
      });

      await cv.update({ extracted_experience_years: '2.5' });

      assert.strictEqual(cv.extracted_experience_years, '2.5');
    });
  });

  describe('Existing Type Preservations', () => {
    it('should preserve DECIMAL for monetary fields (Task 1.12)', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456',
        minimum_compensation: '1000.50',
        maximum_compensation: '2500.75'
      });

      assert.strictEqual(typeof profile.minimum_compensation, 'string');
      assert.strictEqual(typeof profile.maximum_compensation, 'string');
      assert.strictEqual(profile.minimum_compensation, '1000.50');
      assert.strictEqual(profile.maximum_compensation, '2500.75');
    });

    it('should preserve FLOAT for GPA (non-monetary)', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456',
        gpa: 3.75
      });

      // GPA is FLOAT (appropriate for academic grades)
      assert.strictEqual(typeof profile.gpa, 'number');
      assert.strictEqual(profile.gpa, 3.75);
    });

    it('should preserve UUID and BIGINT identifier architecture (Task 1.10)', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      // User.id should be UUID
      assert.ok(user.id);
      assert.strictEqual(typeof user.id, 'string');
      assert.ok(user.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i));

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456'
      });

      // StudentProfile.id should be BIGINT (PostgreSQL returns as string for precision)
      assert.ok(profile.id);
      // Note: PostgreSQL driver returns BIGINT as string to preserve precision
      assert.ok(typeof profile.id === 'string' || typeof profile.id === 'number');
      const idAsNumber = typeof profile.id === 'string' ? parseInt(profile.id, 10) : profile.id;
      assert.ok(idAsNumber > 0);
    });
  });

  describe('Model Definition Validation', () => {
    it('should load all model definitions without errors', async () => {
      // Simply importing and accessing models validates they're defined correctly
      assert.ok(User);
      assert.ok(StudentProfile);
      assert.ok(CV);
      assert.ok(typeof User.findOne === 'function');
      assert.ok(typeof StudentProfile.findOne === 'function');
      assert.ok(typeof CV.findOne === 'function');
    });

    it('should maintain associations after type changes', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456',
        current_year: 4
      });

      // Test User → StudentProfile association
      const userProfile = await User.findOne({
        where: { id: user.id },
        include: [{ model: StudentProfile, as: 'profile' }]
      });

      assert.ok(userProfile);
      assert.ok(userProfile.profile);
      assert.strictEqual(userProfile.profile.current_year, 4);
    });
  });
});
