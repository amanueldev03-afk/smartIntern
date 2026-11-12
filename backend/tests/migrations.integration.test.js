import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import sequelize from '../src/config/database.js';
import { User } from '../src/models/index.js';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = process.env.TASK_1_18_TEST_SCHEMA || '';
const runId = process.env.TASK_1_18_TEST_RUN_ID || '';
const expectedMigrations = [
  '20241110_add_performance_indexes',
  '20241110_initial_schema',
  '20261111_add_runtime_model_schema',
];
const tempDirs = [];

function makeMigrationDirectory(filename, source) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'task-1-18-migration-'));
  tempDirs.push(directory);
  writeFileSync(path.join(directory, filename), source, { mode: 0o600 });
  return directory;
}

function migrationSource(body) {
  const sequelizeUrl = pathToFileURL(path.join(backendDir, 'src/config/database.js')).href;
  return `import sequelize from ${JSON.stringify(sequelizeUrl)};\n${body}\n`;
}

function runMigration(command, extraEnv = {}) {
  return spawnSync(process.execPath, ['db/migrate.js', command], {
    cwd: backendDir,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
}

function migrationEnvironment(directory) {
  return {
    TASK_1_18_TEST_SCHEMA: schema,
    TASK_1_18_TEST_RUN_ID: runId,
    TASK_1_18_MIGRATIONS_DIR: directory,
  };
}

function startMigration(directory) {
  const child = spawn(process.execPath, ['db/migrate.js', 'up'], {
    cwd: backendDir,
    env: { ...process.env, ...migrationEnvironment(directory) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
  return { child, closed };
}

async function waitForMigrationSleep(timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [rows] = await sequelize.query(`SELECT 1 FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid() AND state = 'active'
        AND query LIKE '%pg_sleep(2.5)%' LIMIT 1`);
    if (rows.length) return true;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return false;
}

describe('Task 1.18 PostgreSQL migration integration', () => {
  before(async () => {
    assert.equal(sequelize.getDialect(), 'postgres');
    assert.match(schema, /^task_1_18_test_[a-f0-9]{32}$/);
    assert.match(runId, /^[0-9a-f-]{36}$/i);
    await sequelize.authenticate();
    const [rows] = await sequelize.query(`SELECT current_database() AS database_name,
      current_schema() AS schema_name,
      (SELECT run_id FROM _task_1_18_run_marker LIMIT 1) AS run_id`);
    assert.equal(rows[0].database_name, 'ai_internship');
    assert.equal(rows[0].schema_name, schema);
    assert.equal(rows[0].run_id, runId);
  });

  after(async () => {
    for (const directory of tempDirs) rmSync(directory, { recursive: true, force: true });
    await sequelize.close();
  });

  it('executes both historical migrations and reports their isolated status', async () => {
    const beforeStatus = runMigration('status');
    assert.equal(beforeStatus.status, 0, `${beforeStatus.stdout}\n${beforeStatus.stderr}`);
    assert.match(beforeStatus.stdout, /Migration metadata table does not exist/);
    const [beforeMetadata] = await sequelize.query("SELECT to_regclass('_migrations') AS table_name");
    assert.equal(beforeMetadata[0].table_name, null, 'Status must not create migration metadata.');

    const up = runMigration('up');
    assert.equal(up.status, 0, `${up.stdout}\n${up.stderr}`);

    const [rows] = await sequelize.query('SELECT version FROM "_migrations" ORDER BY version');
    assert.deepEqual(rows.map((row) => row.version), expectedMigrations);

    const [tables] = await sequelize.query(`SELECT count(*)::int AS count FROM pg_tables
      WHERE schemaname = current_schema()`);
    assert.ok(tables[0].count > 40, 'Historical and runtime schemas should coexist in the isolated schema.');
    const [runtimeTable] = await sequelize.query("SELECT to_regclass('accounts_user') AS table_name");
    const [legacyTable] = await sequelize.query("SELECT to_regclass('users') AS table_name");
    assert.ok(runtimeTable[0].table_name, 'Runtime tables should be added.');
    assert.ok(legacyTable[0].table_name, 'Historical tables should remain intact.');

    const status = runMigration('status');
    assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
    assert.match(status.stdout, /Executed: 3/);
    assert.match(status.stdout, /Pending: 0/);
  });

  it('rolls back both migrations in dependency order and reapplies them', async () => {
    const preservedUser = await User.create({
      email: `migration-rollback-${runId}@example.test`,
      username: `migration-rollback-${runId}`,
      password: 'test-only-hash',
      role: 'student',
    });
    const [runtimeBeforeDown] = await sequelize.query("SELECT to_regclass('accounts_user') AS table_name");
    assert.ok(runtimeBeforeDown[0].table_name);
    const downRuntime = runMigration('down');
    assert.equal(downRuntime.status, 0, `${downRuntime.stdout}\n${downRuntime.stderr}`);
    const [afterDown] = await sequelize.query('SELECT version FROM "_migrations" ORDER BY version');
    assert.deepEqual(afterDown.map((row) => row.version), ['20241110_add_performance_indexes', '20241110_initial_schema']);

    const [runtimeAfterDown] = await sequelize.query("SELECT to_regclass('accounts_user') AS table_name");
    assert.ok(runtimeAfterDown[0].table_name, 'Runtime tables and their data are preserved by rollback.');
    assert.ok(await User.findByPk(preservedUser.id), 'Runtime application data must remain intact after rollback.');

    const downIndexes = runMigration('down');
    assert.equal(downIndexes.status, 0, `${downIndexes.stdout}\n${downIndexes.stderr}`);
    const [afterIndexesDown] = await sequelize.query('SELECT version FROM "_migrations" ORDER BY version');
    assert.deepEqual(afterIndexesDown.map((row) => row.version), ['20241110_initial_schema']);

    const downSchema = runMigration('down');
    assert.equal(downSchema.status, 0, `${downSchema.stdout}\n${downSchema.stderr}`);
    const [afterSchemaDown] = await sequelize.query('SELECT version FROM "_migrations"');
    assert.equal(afterSchemaDown.length, 0);
    const [schemaTable] = await sequelize.query("SELECT to_regclass('internships') AS table_name");
    assert.equal(schemaTable[0].table_name, null);
    const [runtimeRetained] = await sequelize.query("SELECT to_regclass('accounts_user') AS table_name");
    assert.ok(runtimeRetained[0].table_name, 'Rolling back historical DDL must not drop runtime tables.');
    assert.ok(await User.findByPk(preservedUser.id), 'Historical rollback must not drop runtime application rows.');

    const up = runMigration('up');
    assert.equal(up.status, 0, `${up.stdout}\n${up.stderr}`);
    const [afterUp] = await sequelize.query('SELECT version FROM "_migrations" ORDER BY version');
    assert.deepEqual(afterUp.map((row) => row.version), expectedMigrations);
  });

  it('rolls back failed migration DDL and its tracking record, then releases the lock', async () => {
    const version = '99999999_task_1_18_forced_failure';
    const migrationDir = makeMigrationDirectory(`${version}.js`, migrationSource(`
      export const up = async ({ transaction }) => {
        await sequelize.query('CREATE TABLE task_1_18_failed_migration_table (id INTEGER)', { transaction });
        throw new Error('intentional Task 1.18 migration failure');
      };
      export const down = async () => {};
    `));
    const failed = runMigration('up', migrationEnvironment(migrationDir));
    assert.equal(failed.status, 1, `${failed.stdout}\n${failed.stderr}`);

    const [tableRows] = await sequelize.query("SELECT to_regclass('task_1_18_failed_migration_table') AS table_name");
    assert.equal(tableRows[0].table_name, null);
    const [versionRows] = await sequelize.query('SELECT version FROM "_migrations" WHERE version = :version', {
      replacements: { version },
    });
    assert.equal(versionRows.length, 0);

    const recoveryVersion = '99999999_task_1_18_lock_recovery';
    const recoveryDir = makeMigrationDirectory(`${recoveryVersion}.js`, migrationSource(`
      export const up = async ({ transaction }) => {
        await sequelize.query('CREATE TABLE task_1_18_recovery_table (id INTEGER)', { transaction });
      };
      export const down = async () => {};
    `));
    const recovered = runMigration('up', migrationEnvironment(recoveryDir));
    assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
  });

  it('serializes two real migration runner processes on the same PostgreSQL lock', async () => {
    const version = '99999999_task_1_18_concurrency_probe';
    const migrationDir = makeMigrationDirectory(`${version}.js`, migrationSource(`
      export const up = async ({ transaction }) => {
        const [locks] = await sequelize.query(
          "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted) AS held",
          { transaction }
        );
        if (!locks[0].held) throw new Error('Migration DDL connection does not own the advisory lock.');
        await sequelize.query('CREATE TABLE task_1_18_runner_probe (id INTEGER)', { transaction });
        await sequelize.query('INSERT INTO task_1_18_runner_probe (id) VALUES (1)', { transaction });
        await sequelize.query('SELECT pg_sleep(2.5)', { transaction });
      };
      export const down = async () => {};
    `));

    const first = startMigration(migrationDir);
    const firstEnteredMigration = await waitForMigrationSleep();
    assert.ok(firstEnteredMigration, 'First migration runner did not reach its controlled pause.');

    const second = startMigration(migrationDir);
    const [firstResult, secondResult] = await Promise.all([first.closed, second.closed]);
    assert.equal(firstResult.status, 0, `${firstResult.stdout}\n${firstResult.stderr}`);
    if (secondResult.status !== 0) {
      assert.match(`${secondResult.stdout}\n${secondResult.stderr}`, /Cannot acquire migration lock/);
    }

    const [runs] = await sequelize.query('SELECT count(*)::int AS count FROM task_1_18_runner_probe');
    assert.equal(runs[0].count, 1, 'Only one migration process should apply the migration.');
    const [versions] = await sequelize.query('SELECT count(*)::int AS count FROM "_migrations" WHERE version = :version', {
      replacements: { version },
    });
    assert.equal(versions[0].count, 1);
  });
});
