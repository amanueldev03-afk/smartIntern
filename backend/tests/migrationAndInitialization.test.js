import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test migration functionality
const TEST_DATABASE = 'ai_internship_test_migration';

describe('Task 1.15: Database Initialization and Migration Tests', () => {
  before(() => {
    // Create test database
    try {
      execSync(`PGPASSWORD=ai_password psql -U ai_user -h localhost -c "CREATE DATABASE ${TEST_DATABASE}"`, {
        stdio: 'ignore'
      });
    } catch (err) {
      // Database may already exist
    }
  });

  after(() => {
    // Clean up test database
    try {
      execSync(`PGPASSWORD=ai_password psql -U ai_user -h localhost -c "DROP DATABASE ${TEST_DATABASE}"`, {
        stdio: 'ignore'
      });
    } catch (err) {
      // Ignore errors
    }
  });

  describe('Migration Files Exist', () => {
    it('should have migration directory', () => {
      const migrationsDir = join(__dirname, '../migrations');
      assert.ok(existsSync(migrationsDir));
    });

    it('should have initial schema migration', () => {
      const migrationFile = join(__dirname, '../migrations/20241110_initial_schema.js');
      assert.ok(existsSync(migrationFile));
    });

    it('should have migration runner', () => {
      const migrateFile = join(__dirname, '../db/migrate.js');
      assert.ok(existsSync(migrateFile));
    });

    it('should have seed file', () => {
      const seedFile = join(__dirname, '../db/seed.js');
      assert.ok(existsSync(seedFile));
    });
  });

  describe('Migration File Structure', () => {
    it('should export up function', async () => {
      const migration = await import('../migrations/20241110_initial_schema.js');
      assert.ok(typeof migration.up === 'function');
    });

    it('should export down function', async () => {
      const migration = await import('../migrations/20241110_initial_schema.js');
      assert.ok(typeof migration.down === 'function');
    });

    it('should export description', async () => {
      const migration = await import('../migrations/20241110_initial_schema.js');
      assert.ok(migration.description);
      assert.strictEqual(typeof migration.description, 'string');
    });

    it('should export version', async () => {
      const migration = await import('../migrations/20241110_initial_schema.js');
      assert.ok(migration.version);
      assert.strictEqual(migration.version, '20241110_initial_schema');
    });
  });

  describe('Production Safety', () => {
    it('should not run migrations automatically in production', () => {
      const serverFile = readFileSync(join(__dirname, '../server.js'), 'utf8');
      
      // Should not have sequelize.sync() without environment check
      // Should have NODE_ENV check before sequelize.sync()
      assert.ok(serverFile.includes('NODE_ENV === \'development\'') || 
                serverFile.includes('process.env.NODE_ENV === \'development\''));
    });

    it('should not seed in production', () => {
      const seedFile = readFileSync(join(__dirname, '../db/seed.js'), 'utf8');
      // Seed file should check NODE_ENV and throw in production
      assert.ok(seedFile.includes('production'));
      assert.ok(seedFile.includes('NODE_ENV'));
    });
  });

  describe('npm Scripts', () => {
    it('should have migrate script', () => {
      const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
      assert.ok(packageJson.scripts.migrate);
      assert.strictEqual(packageJson.scripts.migrate, 'node db/migrate.js up');
    });

    it('should have migrate:down script', () => {
      const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
      assert.ok(packageJson.scripts['migrate:down']);
      assert.strictEqual(packageJson.scripts['migrate:down'], 'node db/migrate.js down');
    });

    it('should have migrate:status script', () => {
      const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
      assert.ok(packageJson.scripts['migrate:status']);
      assert.strictEqual(packageJson.scripts['migrate:status'], 'node db/migrate.js status');
    });

    it('should have seed script', () => {
      const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
      assert.ok(packageJson.scripts.seed);
      assert.strictEqual(packageJson.scripts.seed, 'node db/seed.js');
    });
  });

  describe('Model Loading', () => {
    it('should load all models without sequelize.sync', async () => {
      // Import models without calling sync
      const models = await import('../src/models/index.js');
      assert.ok(models.User);
      assert.ok(models.StudentProfile);
      assert.ok(models.Internship);
      assert.ok(models.ProjectTeam);
      // All 21 models should load
      assert.strictEqual(Object.keys(models.default).length, 21);
    });
  });
});
