#!/usr/bin/env node
/**
 * Migration Runner
 * Executes database migrations in a controlled, ordered manner
 * Usage: node db/migrate.js [up|down]
 */

import sequelize from '../src/config/database.js';
import { connectDB } from '../src/config/database.js';
import { readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const configuredTestMigrationsDir = process.env.TASK_1_18_MIGRATIONS_DIR;
if (configuredTestMigrationsDir && !process.env.TASK_1_18_TEST_SCHEMA) {
  throw new Error('Alternate migration directories are permitted only in Task 1.18 schema tests.');
}
const MIGRATIONS_DIR = configuredTestMigrationsDir
  ? resolve(configuredTestMigrationsDir)
  : join(__dirname, '../migrations');
const MIGRATION_TABLE = '_migrations';

/**
 * Create migrations tracking table
 */
async function createMigrationTable(transaction) {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "${MIGRATION_TABLE}" (
        version VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, { transaction });
  } catch (error) {
    console.error('[Migration] Failed to create migration table:', error);
    throw error;
  }
}

/**
 * Get executed migrations
 */
async function getExecutedMigrations(transaction) {
  try {
    const result = await sequelize.query(
      `SELECT version FROM "${MIGRATION_TABLE}" ORDER BY executed_at ASC`,
      { transaction }
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
async function markMigrationExecuted(version, transaction) {
  await sequelize.query(
    `INSERT INTO "${MIGRATION_TABLE}" (version) VALUES (:version)`,
    { replacements: { version }, transaction }
  );
}

/**
 * Remove migration from executed list
 */
async function removeMigrationMark(version, transaction) {
  await sequelize.query(
    `DELETE FROM "${MIGRATION_TABLE}" WHERE version = :version`,
    { replacements: { version }, transaction }
  );
}

/**
 * Load all migration files
 */
function loadMigrations() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.js') && !file.endsWith('.test.js'))
    .sort((left, right) => {
      // The original schema and index migrations share a date prefix; plain
      // lexical order incorrectly ran the indexes before their tables.
      const initialSchema = '20241110_initial_schema.js';
      if (left === initialSchema) return -1;
      if (right === initialSchema) return 1;
      return left.localeCompare(right);
    });
  
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
 * Keep the transaction-scoped advisory lock and every migration query on the
 * same pooled connection. Each migration uses a nested Sequelize transaction
 * (savepoint), while the outer transaction owns the lock for the full run.
 */
async function withMigrationLock(work) {
  return sequelize.transaction(async (lockTransaction) => {
    await createMigrationTable(lockTransaction);
    const [rows] = await sequelize.query(
      'SELECT pg_try_advisory_xact_lock(12345) AS acquired',
      { transaction: lockTransaction }
    );
    if (!rows[0].acquired) {
      throw new Error('Cannot acquire migration lock - another migration may be in progress');
    }

    console.log('[Migration] Transaction-scoped advisory lock acquired.');
    return work(lockTransaction);
  });
}

/**
 * Run up migrations
 */
export async function up() {
  console.log('[Migration] Running up migrations...');
  
  await connectDB();
  await withMigrationLock(async (lockTransaction) => {
    const executed = await getExecutedMigrations(lockTransaction);
    const migrations = loadMigrations();
    
    for (const { module, version } of migrations) {
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
      const transaction = await sequelize.transaction({ transaction: lockTransaction });
      try {
        await migration.up({ transaction });
        await markMigrationExecuted(version, transaction);
        await transaction.commit();
        console.log(`[Migration] Completed: ${version}`);
      } catch (error) {
        await transaction.rollback();
        console.error(`[Migration] Failed: ${version}`, error);
        throw error;
      }
    }
    
    console.log('[Migration] All up migrations completed.');
  });
}

/**
 * Run down migrations (rollback last migration)
 */
export async function down() {
  console.log('[Migration] Running down migration (rollback last)...');
  
  await connectDB();
  
  await withMigrationLock(async (lockTransaction) => {
    const executed = await getExecutedMigrations(lockTransaction);
    
    if (executed.length === 0) {
      console.log('[Migration] No migrations to rollback.');
      return;
    }
    
    const executionOrder = loadMigrations().map((migration) => migration.version);
    const lastVersion = executionOrder.filter((version) => executed.includes(version)).at(-1);
    if (!lastVersion) {
      throw new Error('Executed migrations do not match the available migration files.');
    }
    const migrationFile = `${lastVersion}.js`;
    const migrationPath = join(MIGRATIONS_DIR, migrationFile);
    
    console.log(`[Migration] Rolling back: ${lastVersion}`);
    const migration = await import(migrationPath);
    
    if (typeof migration.down !== 'function') {
      throw new Error(`Migration ${lastVersion} does not export a down() function`);
    }
    
    // Execute rollback in transaction
    const transaction = await sequelize.transaction({ transaction: lockTransaction });
    try {
      await migration.down({ transaction });
      await removeMigrationMark(lastVersion, transaction);
      await transaction.commit();
      console.log(`[Migration] Rolled back: ${lastVersion}`);
    } catch (error) {
      await transaction.rollback();
      console.error(`[Migration] Rollback failed: ${lastVersion}`, error);
      throw error;
    }
    
    console.log('[Migration] Rollback completed.');
  });
}

/**
 * Show migration status
 */
export async function status() {
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

// Keep imports side-effect free so tests and tooling can inspect the runner.
const isDirectExecution = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  const command = process.argv[2] || 'up';
  const commands = { up, down, status };
  const selectedCommand = commands[command];

  if (!selectedCommand) {
    console.log('Usage: node db/migrate.js [up|down|status]');
    process.exit(1);
  }

  selectedCommand().then(() => process.exit(0)).catch((err) => {
    console.error(`[Migration] ${command} failed:`, err);
    process.exit(1);
  });
}
