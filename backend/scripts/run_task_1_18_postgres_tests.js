#!/usr/bin/env node
import { randomUUID } from 'crypto';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import sequelize from '../src/config/database.js';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runId = randomUUID();
const schema = `task_1_18_test_${runId.replaceAll('-', '')}`;
const markerTable = '_task_1_18_run_marker';
const quotedSchema = `"${schema}"`;
let schemaCreatedByThisRun = false;
let childExitCode = 1;
let interrupted = false;

process.on('SIGINT', () => { interrupted = true; });

function assertSafeConnection(row, dialect) {
  if (dialect !== 'postgres' || row.database_name !== 'ai_internship') {
    throw new Error('Task 1.18 tests require the existing PostgreSQL database ai_internship.');
  }
  if (!row.can_create_schema) {
    throw new Error('The configured role cannot create an isolated schema in ai_internship.');
  }
}

function runTests() {
  const testFiles = [
    'tests/transactions.integration.test.js',
    'tests/migrations.integration.test.js',
    'tests/businessTransactions.integration.test.js',
  ];
  const child = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...testFiles], {
    cwd: backendDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      TASK_1_18_TEST_SCHEMA: schema,
      TASK_1_18_TEST_RUN_ID: runId,
    },
  });
  if (child.error) throw child.error;
  return interrupted ? 130 : (child.status ?? 1);
}

async function cleanupOwnedSchema() {
  if (!schemaCreatedByThisRun) return;

  const [rows] = await sequelize.query(`
    SELECT current_database() AS database_name,
      current_user AS role_name,
      pg_get_userbyid(namespace.nspowner) AS schema_owner,
      marker.run_id
    FROM pg_namespace AS namespace
    JOIN ${quotedSchema}.${markerTable} AS marker ON true
    WHERE namespace.nspname = :schema
  `, { replacements: { schema } });

  if (rows.length !== 1
      || rows[0].database_name !== 'ai_internship'
      || rows[0].schema_owner !== rows[0].role_name
      || rows[0].run_id !== runId
      || schema === 'public') {
    throw new Error('Refusing to clean up: test schema ownership/safety verification failed.');
  }

  await sequelize.query(`DROP SCHEMA ${quotedSchema} CASCADE`);
  schemaCreatedByThisRun = false;
  console.log(`[Task 1.18] Removed this run's isolated schema ${schema}.`);
}

try {
  await sequelize.authenticate();
  const [rows] = await sequelize.query(`
    SELECT current_database() AS database_name,
      current_user AS role_name,
      has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schema,
      EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = :schema) AS schema_exists
  `, { replacements: { schema } });
  assertSafeConnection(rows[0], sequelize.getDialect());
  if (rows[0].schema_exists || !/^task_1_18_test_[a-f0-9]{32}$/.test(schema)) {
    throw new Error('Generated test schema is not unique or does not meet the safety policy.');
  }

  await sequelize.transaction(async (transaction) => {
    await sequelize.query(`CREATE SCHEMA ${quotedSchema}`, { transaction });
    await sequelize.query(`CREATE TABLE ${quotedSchema}.${markerTable} (run_id UUID PRIMARY KEY)`, { transaction });
    await sequelize.query(`INSERT INTO ${quotedSchema}.${markerTable} (run_id) VALUES (:runId)`, {
      replacements: { runId },
      transaction,
    });
  });
  schemaCreatedByThisRun = true;

  console.log(`[Task 1.18] PostgreSQL ${rows[0].database_name}; isolated schema ${schema}; credentials omitted.`);
  childExitCode = runTests();
} catch (error) {
  console.error('[Task 1.18] PostgreSQL test setup/execution failed:', error.message);
  childExitCode = 1;
} finally {
  try {
    await cleanupOwnedSchema();
  } catch (error) {
    console.error('[Task 1.18] Safe schema cleanup failed:', error.message);
    childExitCode = 1;
  }
  await sequelize.close();
}

process.exitCode = childExitCode;
