import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'crypto';

// Import models
import {
  User,
  StudentProfile,
  Internship
} from '../src/models/index.js';

import sequelize from '../src/config/database.js';

// Use test schema
const TEST_SCHEMA = 'test_monetary_precision';

describe('Task 1.12: Monetary Precision Tests', () => {
  before(async () => {
    // Create test schema
    try {
      await sequelize.query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`);
      await sequelize.query(`SET search_path TO ${TEST_SCHEMA}, public`);
    } catch (err) {
      console.warn('Warning: Could not create test schema, using default schema:', err.message);
    }

    // Sync models (this will create tables with DECIMAL types)
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

  describe('StudentProfile Monetary Fields', () => {
    it('should accept DECIMAL values for minimum_compensation', async () => {
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

      // PostgreSQL DECIMAL is returned as string to preserve precision
      assert.strictEqual(typeof profile.minimum_compensation, 'string');
      assert.strictEqual(typeof profile.maximum_compensation, 'string');
      assert.strictEqual(profile.minimum_compensation, '1000.50');
      assert.strictEqual(profile.maximum_compensation, '2500.75');
    });

    it('should accept NULL for monetary fields', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456',
        minimum_compensation: null,
        maximum_compensation: null
      });

      assert.strictEqual(profile.minimum_compensation, null);
      assert.strictEqual(profile.maximum_compensation, null);
    });

    it('should preserve exact decimal precision', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456',
        minimum_compensation: '0.10',
        maximum_compensation: '0.20'
      });

      // Verify exact precision preservation (no floating-point rounding)
      assert.strictEqual(profile.minimum_compensation, '0.10');
      assert.strictEqual(profile.maximum_compensation, '0.20');
      
      // Verify these are not floating-point approximations
      assert.notStrictEqual(profile.minimum_compensation, 0.1);
      assert.notStrictEqual(profile.maximum_compensation, 0.2);
    });

    it('should handle large monetary values', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456',
        minimum_compensation: '9999999999.99',
        maximum_compensation: '9999999999.99'
      });

      assert.strictEqual(profile.minimum_compensation, '9999999999.99');
      assert.strictEqual(profile.maximum_compensation, '9999999999.99');
    });

    it('should allow updating monetary fields', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456',
        minimum_compensation: '1000.00',
        maximum_compensation: '2000.00'
      });

      await profile.update({
        minimum_compensation: '1500.25',
        maximum_compensation: '3000.50'
      });

      assert.strictEqual(profile.minimum_compensation, '1500.25');
      assert.strictEqual(profile.maximum_compensation, '3000.50');
    });
  });

  describe('Internship Monetary Fields', () => {
    it('should accept DECIMAL values for minimum_compensation', async () => {
      const internship = await Internship.create({
        title: 'Test Internship',
        organization_name: 'Test Company',
        description: 'Test description',
        minimum_compensation: '1000.50',
        maximum_compensation: '2500.75'
      });

      assert.strictEqual(typeof internship.minimum_compensation, 'string');
      assert.strictEqual(typeof internship.maximum_compensation, 'string');
      assert.strictEqual(internship.minimum_compensation, '1000.50');
      assert.strictEqual(internship.maximum_compensation, '2500.75');
    });

    it('should accept NULL for monetary fields', async () => {
      const internship = await Internship.create({
        title: 'Test Internship',
        organization_name: 'Test Company',
        description: 'Test description',
        minimum_compensation: null,
        maximum_compensation: null
      });

      assert.strictEqual(internship.minimum_compensation, null);
      assert.strictEqual(internship.maximum_compensation, null);
    });

    it('should preserve exact decimal precision', async () => {
      const internship = await Internship.create({
        title: 'Test Internship',
        organization_name: 'Test Company',
        description: 'Test description',
        minimum_compensation: '0.10',
        maximum_compensation: '0.20'
      });

      assert.strictEqual(internship.minimum_compensation, '0.10');
      assert.strictEqual(internship.maximum_compensation, '0.20');
      
      // Verify these are not floating-point approximations
      assert.notStrictEqual(internship.minimum_compensation, 0.1);
      assert.notStrictEqual(internship.maximum_compensation, 0.2);
    });

    it('should handle large monetary values', async () => {
      const internship = await Internship.create({
        title: 'Test Internship',
        organization_name: 'Test Company',
        description: 'Test description',
        minimum_compensation: '9999999999.99',
        maximum_compensation: '9999999999.99'
      });

      assert.strictEqual(internship.minimum_compensation, '9999999999.99');
      assert.strictEqual(internship.maximum_compensation, '9999999999.99');
    });

    it('should allow updating monetary fields', async () => {
      const internship = await Internship.create({
        title: 'Test Internship',
        organization_name: 'Test Company',
        description: 'Test description',
        minimum_compensation: '1000.00',
        maximum_compensation: '2000.00'
      });

      await internship.update({
        minimum_compensation: '1500.25',
        maximum_compensation: '3000.50'
      });

      assert.strictEqual(internship.minimum_compensation, '1500.25');
      assert.strictEqual(internship.maximum_compensation, '3000.50');
    });
  });

  describe('Compensation Range Comparisons', () => {
    it('should allow string-based comparison for compensation ranges', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456',
        minimum_compensation: '1000.00',
        maximum_compensation: '5000.00'
      });

      const internship = await Internship.create({
        title: 'Test Internship',
        organization_name: 'Test Company',
        description: 'Test description',
        minimum_compensation: '2500.00',
        maximum_compensation: '4000.00'
      });

      // String comparison works for DECIMAL when values have same precision
      const internshipInRange = 
        internship.minimum_compensation >= profile.minimum_compensation &&
        internship.maximum_compensation <= profile.maximum_compensation;

      assert.strictEqual(internshipInRange, true);
    });

    it('should handle NULL in compensation range comparisons', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456',
        minimum_compensation: null,
        maximum_compensation: null
      });

      const internship = await Internship.create({
        title: 'Test Internship',
        organization_name: 'Test Company',
        description: 'Test description',
        minimum_compensation: '2500.00',
        maximum_compensation: '4000.00'
      });

      // NULL compensation means "any compensation"
      assert.strictEqual(profile.minimum_compensation, null);
      assert.strictEqual(profile.maximum_compensation, null);
    });
  });

  describe('Validation', () => {
    it('should reject values exceeding DECIMAL(12,2) precision', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      try {
        await StudentProfile.create({
          user_id: user.id,
          phone: '+251911123456',
          minimum_compensation: '999999999999.99' // Exceeds DECIMAL(12,2)
        });
        assert.fail('Should have thrown validation error');
      } catch (err) {
        // PostgreSQL will reject value exceeding precision
        assert.ok(
          err.message.includes('value too long') ||
          err.message.includes('numeric field overflow') ||
          err.message.includes('precision')
        );
      }
    });

    it('should round values with more than 2 decimal places', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      // PostgreSQL rounds DECIMAL values to the specified scale
      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456',
        minimum_compensation: '1000.123' // Will be rounded to 1000.12
      });

      // Verify rounding occurred
      assert.strictEqual(profile.minimum_compensation, '1000.12');
    });
  });

  describe('API Compatibility', () => {
    it('should serialize DECIMAL as string in JSON', async () => {
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

      const json = profile.toJSON();
      
      // Sequelize should serialize DECIMAL as string
      assert.strictEqual(typeof json.minimum_compensation, 'string');
      assert.strictEqual(typeof json.maximum_compensation, 'string');
      assert.strictEqual(json.minimum_compensation, '1000.50');
      assert.strictEqual(json.maximum_compensation, '2500.75');
    });

    it('should handle NULL serialization correctly', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456',
        minimum_compensation: null,
        maximum_compensation: null
      });

      const json = profile.toJSON();
      
      assert.strictEqual(json.minimum_compensation, null);
      assert.strictEqual(json.maximum_compensation, null);
    });
  });
});
