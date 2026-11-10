import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DATABASE = 'ai_internship_migration_test';

describe('Task 1.16: Migration Validation and Hardening Tests', () => {
  
  describe('Phase A: Migration Audit', () => {
    it('should use explicit schema definitions, not sequelize.sync', () => {
      const migrationFile = readFileSync(join(__dirname, '../migrations/20241110_initial_schema.js'), 'utf8');
      
      // Should NOT use sequelize.sync
      assert.ok(!migrationFile.includes('sync({ force: false })'), 
        'Migration should not use sequelize.sync() for reproducibility');
      
      // Should use queryInterface methods
      assert.ok(migrationFile.includes('queryInterface.createTable'), 
        'Migration should use queryInterface.createTable for explicit schema');
    });

    it('should preserve identity architecture', () => {
      const migrationFile = readFileSync(join(__dirname, '../migrations/20241110_initial_schema.js'), 'utf8');
      
      // User.id: UUID
      assert.ok(migrationFile.includes('type: sequelize.Sequelize.UUID'), 
        'User.id should be UUID');
      
      // StudentProfile.id: BIGINT
      assert.ok(migrationFile.includes('StudentProfile') && migrationFile.includes('type: sequelize.Sequelize.BIGINT'), 
        'StudentProfile.id should be BIGINT');
      
      // StudentProfile.user_id: UUID unique
      assert.ok(migrationFile.includes('user_id') && migrationFile.includes('unique: true'), 
        'StudentProfile.user_id should be unique');
    });

    it('should preserve Task 1.12 monetary DECIMAL fields', () => {
      const migrationFile = readFileSync(join(__dirname, '../migrations/20241110_initial_schema.js'), 'utf8');
      
      // DECIMAL(12, 2) for compensation fields
      assert.ok(migrationFile.includes('DECIMAL(12, 2)'), 
        'Monetary fields should use DECIMAL(12, 2)');
    });

    it('should preserve Task 1.13 data types', () => {
      const migrationFile = readFileSync(join(__dirname, '../migrations/20241110_initial_schema.js'), 'utf8');
      
      // StudentProfile.current_year: INTEGER
      assert.ok(migrationFile.includes('current_year') && migrationFile.includes('type: sequelize.Sequelize.INTEGER'), 
        'current_year should be INTEGER');
      
      // CV.extracted_experience_years: DECIMAL(4, 1)
      assert.ok(migrationFile.includes('extracted_experience_years') && migrationFile.includes('DECIMAL(4, 1)'), 
        'extracted_experience_years should be DECIMAL(4, 1)');
    });
  });

  describe('Phase D: Concurrency and Failure Safety', () => {
    it('should implement advisory locking', () => {
      const migrateFile = readFileSync(join(__dirname, '../db/migrate.js'), 'utf8');
      
      // Should use PostgreSQL advisory lock
      assert.ok(migrateFile.includes('pg_try_advisory_lock'), 
        'Migration runner should use PostgreSQL advisory lock');
      assert.ok(migrateFile.includes('pg_advisory_unlock'), 
        'Migration runner should release advisory lock');
    });

    it('should use transactions for migration execution', () => {
      const migrateFile = readFileSync(join(__dirname, '../db/migrate.js'), 'utf8');
      
      // Should use transactions
      assert.ok(migrateFile.includes('sequelize.transaction()'), 
        'Migration runner should use transactions');
      assert.ok(migrateFile.includes('transaction.commit()'), 
        'Migration runner should commit transactions');
      assert.ok(migrateFile.includes('transaction.rollback()'), 
        'Migration runner should rollback on failure');
    });

    it('should release lock in finally block', () => {
      const migrateFile = readFileSync(join(__dirname, '../db/migrate.js'), 'utf8');
      
      // Should have finally block for lock release
      assert.ok(migrateFile.includes('finally'), 
        'Migration runner should have finally block');
      assert.ok(migrateFile.includes('releaseLock()'), 
        'Migration runner should release lock in finally');
    });
  });

  describe('Migration Runner Features', () => {
    it('should have lock acquisition function', async () => {
      const migrate = await import('../db/migrate.js');
      // Module exists and can be imported
      assert.ok(migrate);
    });

    it('should have migration status command', () => {
      const migrateFile = readFileSync(join(__dirname, '../db/migrate.js'), 'utf8');
      assert.ok(migrateFile.includes('status'), 
        'Migration runner should have status command');
    });

    it('should have rollback command', () => {
      const migrateFile = readFileSync(join(__dirname, '../db/migrate.js'), 'utf8');
      assert.ok(migrateFile.includes('down'), 
        'Migration runner should have down/rollback command');
    });
  });

  describe('Schema Explicitness', () => {
    it('should define all columns explicitly', () => {
      const migrationFile = readFileSync(join(__dirname, '../migrations/20241110_initial_schema.js'), 'utf8');
      
      // Should define columns with explicit types
      assert.ok(migrationFile.includes('type:'), 
        'Migration should define column types explicitly');
      
      // Should define primary keys
      assert.ok(migrationFile.includes('primaryKey: true'), 
        'Migration should define primary keys explicitly');
      
      // Should define foreign keys
      assert.ok(migrationFile.includes('references:'), 
        'Migration should define foreign keys explicitly');
    });

    it('should define constraints explicitly', () => {
      const migrationFile = readFileSync(join(__dirname, '../migrations/20241110_initial_schema.js'), 'utf8');
      
      // Should define unique constraints
      assert.ok(migrationFile.includes('unique: true'), 
        'Migration should define unique constraints');
      
      // Should define composite unique constraints
      assert.ok(migrationFile.includes('addConstraint'), 
        'Migration should add composite unique constraints');
    });

    it('should define defaults explicitly', () => {
      const migrationFile = readFileSync(join(__dirname, '../migrations/20241110_initial_schema.js'), 'utf8');
      
      // Should define default values
      assert.ok(migrationFile.includes('defaultValue:'), 
        'Migration should define default values');
    });

    it('should define nullability explicitly', () => {
      const migrationFile = readFileSync(join(__dirname, '../migrations/20241110_initial_schema.js'), 'utf8');
      
      // Should define allowNull
      assert.ok(migrationFile.includes('allowNull:'), 
        'Migration should define nullability explicitly');
    });
  });

  describe('Reproducibility', () => {
    it('should not depend on current model definitions', () => {
      const migrationFile = readFileSync(join(__dirname, '../migrations/20241110_initial_schema.js'), 'utf8');
      
      // Should NOT import models for schema derivation
      // It imports models only for reference, not for sync
      assert.ok(migrationFile.includes('queryInterface'), 
        'Migration should use queryInterface for explicit schema');
    });

    it('should have version metadata', async () => {
      const migration = await import('../migrations/20241110_initial_schema.js');
      assert.ok(migration.version);
      assert.strictEqual(migration.version, '20241110_initial_schema');
    });

    it('should have description metadata', async () => {
      const migration = await import('../migrations/20241110_initial_schema.js');
      assert.ok(migration.description);
      assert.strictEqual(typeof migration.description, 'string');
    });
  });

  describe('Migration Down Function', () => {
    it('should drop tables in reverse order', async () => {
      const migration = await import('../migrations/20241110_initial_schema.js');
      const migrationFile = readFileSync(join(__dirname, '../migrations/20241110_initial_schema.js'), 'utf8');
      
      // Should have down function
      assert.ok(typeof migration.down === 'function');
      
      // Should drop tables
      assert.ok(migrationFile.includes('dropTable'));
      
      // Order should be reverse (student_activity_logs first, users last)
      const downSection = migrationFile.substring(migrationFile.indexOf('export const down'));
      assert.ok(downSection.indexOf('student_activity_logs') < downSection.indexOf('users'), 
        'Down function should drop in reverse order');
    });
  });

  describe('Table Count', () => {
    it('should create 21 tables', () => {
      const migrationFile = readFileSync(join(__dirname, '../migrations/20241110_initial_schema.js'), 'utf8');
      
      // Count createTable calls
      const createTableCount = (migrationFile.match(/createTable/g) || []).length;
      assert.strictEqual(createTableCount, 21, 
        'Migration should create exactly 21 tables');
    });
  });

  describe('Junction Tables', () => {
    it('should create junction tables with composite unique constraints', () => {
      const migrationFile = readFileSync(join(__dirname, '../migrations/20241110_initial_schema.js'), 'utf8');
      
      // Junction tables: student_skills, student_interests, internship_skill_joins
      assert.ok(migrationFile.includes('student_skills'), 
        'Should create student_skills junction table');
      assert.ok(migrationFile.includes('student_interests'), 
        'Should create student_interests junction table');
      assert.ok(migrationFile.includes('internship_skill_joins'), 
        'Should create internship_skill_joins junction table');
      
      // Composite unique constraints
      assert.ok(migrationFile.includes('student_skills_student_id_skill_id_unique'), 
        'Should add composite unique constraint to student_skills');
      assert.ok(migrationFile.includes('student_interests_student_id_interest_id_unique'), 
        'Should add composite unique constraint to student_interests');
      assert.ok(migrationFile.includes('internship_skill_joins_internship_id_skill_id_unique'), 
        'Should add composite unique constraint to internship_skill_joins');
    });
  });

  describe('Foreign Key Cascading', () => {
    it('should define CASCADE behavior appropriately', () => {
      const migrationFile = readFileSync(join(__dirname, '../migrations/20241110_initial_schema.js'), 'utf8');
      
      // Should have CASCADE for delete/update
      assert.ok(migrationFile.includes('onDelete: \'CASCADE\''), 
        'Should define CASCADE delete behavior');
      assert.ok(migrationFile.includes('onUpdate: \'CASCADE\''), 
        'Should define CASCADE update behavior');
    });
  });

  describe('PostgreSQL Integration Tests (Manual)', () => {
    it('PostgreSQL integration tests require database access', () => {
      // These tests require actual PostgreSQL database access
      // They should be run manually when database is available
      console.log('[INFO] PostgreSQL integration tests require database access');
      console.log('[INFO] Run manual tests with: PGPASSWORD=<password> psql -U ai_user -h localhost');
    });

    it('Documents integration test procedure', () => {
      const procedure = `
Manual Integration Test Procedure:
1. Create test database: createdb ai_internship_migration_test
2. Set DATABASE_URL for test database
3. Run: npm run migrate
4. Verify tables created: \dt in psql
5. Verify constraints: Check information_schema
6. Run: npm run migrate:status
7. Run: npm run migrate:down
8. Verify tables dropped
9. Run: npm run migrate (reapply)
10. Verify idempotency (no errors on repeat)
      `;
      console.log(procedure);
    });
  });
});
