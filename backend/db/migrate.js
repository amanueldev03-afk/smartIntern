#!/usr/bin/env node
/**
 * Migration Runner
 * Executes database migrations in a controlled, ordered manner
 * Usage: node db/migrate.js [up|down]
 */

import sequelize from '../src/config/database.js';
import { connectDB } from '../src/config/database.js';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, '../migrations');
const MIGRATION_TABLE = '_migrations';

/**
 * Create migrations tracking table
 */
async function createMigrationTable() {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "${MIGRATION_TABLE}" (
        version VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
  `);
  } catch (error) {
    console.error('[Migration] Failed to create migration table:', error);
    throw error;
  }
}

/**
 * Get executed migrations
 */
async function getExecutedMigrations() {
  try {
    const result = await sequelize.query(
      `SELECT version FROM "${MIGRATION_TABLE}" ORDER BY executed_at ASC`
    );
    return result[0].map(row => row.version);
  } catch (error) {
    if (error.message.includes('does not exist')) {
      return [];
    }
    throw error;
  }
}

/**
 * Mark migration as executed
 */
async function markMigrationExecuted(version) {
  await sequelize.query(
    `INSERT INTO "${MIGRATION_TABLE}" (version) VALUES (:version)`,
    { replacements: { version } }
  );
}

/**
 * Remove migration from executed list
 */
async function removeMigrationMark(version) {
  await sequelize.query(
    `DELETE FROM "${MIGRATION_TABLE}" WHERE version = :version`,
    { replacements: { version } }
  );
}

/**
 * Load all migration files
 */
function loadMigrations() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.js') && !file.endsWith('.test.js'))
    .sort(); // Execute in filename order (chronological)
  
  return files.map(file => {
    const migration = import(join(MIGRATIONS_DIR, file));
    return {
      file,
      module: migration,
      version: file.replace('.js', '')
    };
  });
}

/**
 * Acquire advisory lock to prevent concurrent migration execution
 */
async function acquireLock() {
  // PostgreSQL advisory lock using a fixed lock ID (12345)
  // This ensures only one migration runner operates at a time
  const result = await sequelize.query(
    'SELECT pg_try_advisory_lock(12345) as acquired'
  );
  const acquired = result[0][0].acquired;
  
  if (!acquired) {
    throw new Error('Cannot acquire migration lock - another migration may be in progress');
  }
  
  console.log('[Migration] Advisory lock acquired.');
}

/**
 * Release advisory lock
 */
async function releaseLock() {
  await sequelize.query('SELECT pg_advisory_unlock(12345)');
  console.log('[Migration] Advisory lock released.');
}

/**
 * Run up migrations
 */
async function up() {
  console.log('[Migration] Running up migrations...');
  
  await connectDB();
  await createMigrationTable();
  
  // Acquire lock to prevent concurrent execution
  await acquireLock();
  
  try {
    const executed = await getExecutedMigrations();
    const migrations = loadMigrations();
    
    for (const { file, module, version } of migrations) {
      if (executed.includes(version)) {
        console.log(`[Migration] Skipping already executed: ${version}`);
        continue;
      }
      
      console.log(`[Migration] Executing: ${version}`);
      const migration = await module;
      
      if (typeof migration.up !== 'function') {
        throw new Error(`Migration ${version} does not export an up() function`);
      }
      
      // Execute migration in transaction
      const transaction = await sequelize.transaction();
      try {
        await migration.up();
        await markMigrationExecuted(version);
        await transaction.commit();
        console.log(`[Migration] Completed: ${version}`);
      } catch (error) {
        await transaction.rollback();
        console.error(`[Migration] Failed: ${version}`, error);
        throw error;
      }
    }
    
    console.log('[Migration] All up migrations completed.');
  } finally {
    // Always release lock
    await releaseLock();
  }
}

/**
 * Run down migrations (rollback last migration)
 */
async function down() {
  console.log('[Migration] Running down migration (rollback last)...');
  
  await connectDB();
  
  // Acquire lock to prevent concurrent execution
  await acquireLock();
  
  try {
    const executed = await getExecutedMigrations();
    
    if (executed.length === 0) {
      console.log('[Migration] No migrations to rollback.');
      return;
    }
    
    const lastVersion = executed[executed.length - 1];
    const migrationFile = `${lastVersion}.js`;
    const migrationPath = join(MIGRATIONS_DIR, migrationFile);
    
    console.log(`[Migration] Rolling back: ${lastVersion}`);
    const migration = await import(migrationPath);
    
    if (typeof migration.down !== 'function') {
      throw new Error(`Migration ${lastVersion} does not export a down() function`);
    }
    
    // Execute rollback in transaction
    const transaction = await sequelize.transaction();
    try {
      await migration.down();
      await removeMigrationMark(lastVersion);
      await transaction.commit();
      console.log(`[Migration] Rolled back: ${lastVersion}`);
    } catch (error) {
      await transaction.rollback();
      console.error(`[Migration] Rollback failed: ${lastVersion}`, error);
      throw error;
    }
    
    console.log('[Migration] Rollback completed.');
  } finally {
    // Always release lock
    await releaseLock();
  }
}

/**
 * Show migration status
 */
async function status() {
  console.log('[Migration] Migration status:');
  
  await connectDB();
  await createMigrationTable();
  
  const executed = await getExecutedMigrations();
  const migrations = loadMigrations();
  
  console.log(`\nExecuted: ${executed.length}`);
  executed.forEach(v => console.log(`  ✓ ${v}`));
  
  const pending = migrations.filter(m => !executed.includes(m.version));
  console.log(`\nPending: ${pending.length}`);
  pending.forEach(m => console.log(`  ○ ${m.version}`));
}

// CLI interface
const command = process.argv[2] || 'up';

switch (command) {
  case 'up':
    up().then(() => process.exit(0)).catch(err => {
      console.error('[Migration] Up failed:', err);
      process.exit(1);
    });
    break;
  case 'down':
    down().then(() => process.exit(0)).catch(err => {
      console.error('[Migration] Down failed:', err);
      process.exit(1);
    });
    break;
  case 'status':
    status().then(() => process.exit(0)).catch(err => {
      console.error('[Migration] Status failed:', err);
      process.exit(1);
    });
    break;
  default:
    console.log('Usage: node db/migrate.js [up|down|status]');
    process.exit(1);
}
