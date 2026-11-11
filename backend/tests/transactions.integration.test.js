import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sequelize from '../src/config/database.js';
import { withTransaction } from '../src/utils/transactions.js';
import { migrationQueryInterface } from '../db/migrationQueryInterface.js';

const TABLE = 'task_1_18_test_records';
const TEST_SCHEMA_PATTERN = /^task_1_18_test_[a-f0-9]{32}$/;
const TEST_SCHEMA = process.env.TASK_1_18_TEST_SCHEMA || '';
const TEST_RUN_ID = process.env.TASK_1_18_TEST_RUN_ID || '';

describe('Task 1.18 PostgreSQL transaction integration', () => {
  before(async () => {
    assert.equal(sequelize.getDialect(), 'postgres', 'These tests require PostgreSQL.');
    await sequelize.authenticate();
    assert.match(TEST_SCHEMA, TEST_SCHEMA_PATTERN, 'A unique Task 1.18 schema is required.');
    assert.match(TEST_RUN_ID, /^[0-9a-f-]{36}$/i, 'The schema run marker is required.');
    const [rows] = await sequelize.query(`SELECT current_database() AS database_name,
      current_schema() AS schema_name,
      (SELECT run_id FROM _task_1_18_run_marker LIMIT 1) AS run_id`);
    assert.equal(rows[0].database_name, 'ai_internship', 'Refusing to write outside ai_internship.');
    assert.equal(rows[0].schema_name, TEST_SCHEMA, 'Refusing to write outside the isolated schema.');
    assert.equal(rows[0].run_id, TEST_RUN_ID, 'Test schema ownership marker did not match this run.');
    await sequelize.query(`CREATE TABLE "${TABLE}" (
      id BIGSERIAL PRIMARY KEY,
      logical_key TEXT NOT NULL UNIQUE,
      value INTEGER NOT NULL
    )`);
  });

  after(async () => {
    if (sequelize.getDialect() === 'postgres') await sequelize.close();
  });

  it('commits every statement in a successful managed transaction', async () => {
    await withTransaction(async (transaction) => {
      await sequelize.query(`INSERT INTO "${TABLE}" (logical_key, value) VALUES ('commit-a', 1)`, { transaction });
      await sequelize.query(`INSERT INTO "${TABLE}" (logical_key, value) VALUES ('commit-b', 2)`, { transaction });
    });
    const [rows] = await sequelize.query(`SELECT count(*)::int AS count FROM "${TABLE}" WHERE logical_key LIKE 'commit-%'`);
    assert.equal(rows[0].count, 2);
  });

  it('rolls back prior writes when a later statement fails', async () => {
    await assert.rejects(withTransaction(async (transaction) => {
      await sequelize.query(`INSERT INTO "${TABLE}" (logical_key, value) VALUES ('rollback-me', 1)`, { transaction });
      await sequelize.query(`INSERT INTO "${TABLE}" (logical_key, value) VALUES ('commit-a', 9)`, { transaction });
    }));
    const [rows] = await sequelize.query(`SELECT count(*)::int AS count FROM "${TABLE}" WHERE logical_key = 'rollback-me'`);
    assert.equal(rows[0].count, 0);
    const [connectionRows] = await sequelize.query('SELECT 1 AS available');
    assert.equal(connectionRows[0].available, 1, 'A connection remains usable after rollback.');
  });

  it('keeps migration DDL inside its transaction and rolls it back on failure', async () => {
    const rollbackTable = 'task_1_18_rollback_table';
    await assert.rejects(withTransaction(async (transaction) => {
      const queryInterface = migrationQueryInterface(sequelize, transaction);
      await queryInterface.createTable(rollbackTable, {
        id: { type: sequelize.Sequelize.INTEGER, primaryKey: true },
      });
      throw new Error('force migration rollback');
    }), /force migration rollback/);

    const [rows] = await sequelize.query("SELECT to_regclass('task_1_18_rollback_table') AS table_name");
    assert.equal(rows[0].table_name, null);
  });

  it('serializes migration runners with a transaction-scoped advisory lock', async () => {
    const lockHolder = await sequelize.transaction();
    const contender = await sequelize.transaction();
    try {
      const [holderRows] = await sequelize.query(
        'SELECT pg_try_advisory_xact_lock(12345) AS acquired',
        { transaction: lockHolder }
      );
      const [contenderRows] = await sequelize.query(
        'SELECT pg_try_advisory_xact_lock(12345) AS acquired',
        { transaction: contender }
      );
      assert.equal(holderRows[0].acquired, true);
      assert.equal(contenderRows[0].acquired, false);
    } finally {
      await contender.rollback();
      await lockHolder.commit();
    }

    const releaseTransaction = await sequelize.transaction();
    const [releasedAfterCommit] = await sequelize.query(
      'SELECT pg_try_advisory_xact_lock(12345) AS acquired',
      { transaction: releaseTransaction }
    );
    assert.equal(releasedAfterCommit[0].acquired, true, 'Commit released the first transaction lock.');
    await releaseTransaction.commit();

    const rollbackTransaction = await sequelize.transaction();
    const [rollbackLock] = await sequelize.query(
      'SELECT pg_try_advisory_xact_lock(12345) AS acquired',
      { transaction: rollbackTransaction }
    );
    assert.equal(rollbackLock[0].acquired, true);
    await rollbackTransaction.rollback();

    const afterRollback = await sequelize.transaction();
    const [releasedAfterRollback] = await sequelize.query(
      'SELECT pg_try_advisory_xact_lock(12345) AS acquired',
      { transaction: afterRollback }
    );
    assert.equal(releasedAfterRollback[0].acquired, true, 'Rollback released the second transaction lock.');
    await afterRollback.rollback();
  });

  it('enforces unique keys during truly concurrent inserts on separate transactions', async () => {
    const attempts = [0, 0];
    const outcomes = await Promise.allSettled([1, 2].map((value) => withTransaction((transaction) => {
      attempts[value - 1] += 1;
      return sequelize.query(`INSERT INTO "${TABLE}" (logical_key, value) VALUES ('concurrent-key', :value)`, {
        replacements: { value }, transaction,
      });
    })));
    assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(attempts[outcomes[0].status === 'rejected' ? 0 : 1], 1,
      'Unique-constraint conflicts must not be retried.');
  });

  it('retries a lock-timeout transaction only up to the configured bound', async () => {
    await sequelize.query(`INSERT INTO "${TABLE}" (logical_key, value) VALUES ('retry-lock', 1)`);
    const holder = await sequelize.transaction();
    await sequelize.query(`SELECT id FROM "${TABLE}" WHERE logical_key = 'retry-lock' FOR UPDATE`, { transaction: holder });
    let attempts = 0;

    try {
      await assert.rejects(withTransaction(async (transaction) => {
        attempts += 1;
        await sequelize.query("SET LOCAL lock_timeout = '15ms'", { transaction });
        await sequelize.query(`UPDATE "${TABLE}" SET value = value + 1 WHERE logical_key = 'retry-lock'`, { transaction });
      }));
      assert.equal(attempts, 3, 'The work callback should run at most three times.');
    } finally {
      await holder.rollback();
    }
  });

  it('keeps a stable snapshot under REPEATABLE READ while READ COMMITTED sees a later commit', async () => {
    await sequelize.query(`INSERT INTO "${TABLE}" (logical_key, value) VALUES ('isolation-rr', 1), ('isolation-rc', 1)`);

    const repeatable = await sequelize.transaction({ isolationLevel: 'REPEATABLE READ' });
    const [initialRR] = await sequelize.query(`SELECT value FROM "${TABLE}" WHERE logical_key = 'isolation-rr'`, { transaction: repeatable });
    const readCommitted = await sequelize.transaction({ isolationLevel: 'READ COMMITTED' });
    const [initialRC] = await sequelize.query(`SELECT value FROM "${TABLE}" WHERE logical_key = 'isolation-rc'`, { transaction: readCommitted });
    await sequelize.query(`UPDATE "${TABLE}" SET value = 2 WHERE logical_key IN ('isolation-rr', 'isolation-rc')`);
    const [laterRR] = await sequelize.query(`SELECT value FROM "${TABLE}" WHERE logical_key = 'isolation-rr'`, { transaction: repeatable });
    const [laterRC] = await sequelize.query(`SELECT value FROM "${TABLE}" WHERE logical_key = 'isolation-rc'`, { transaction: readCommitted });
    await repeatable.commit();
    await readCommitted.commit();

    assert.equal(initialRR[0].value, 1);
    assert.equal(laterRR[0].value, 1);
    assert.equal(initialRC[0].value, 1);
    assert.equal(laterRC[0].value, 2);
  });

  it('blocks a competing update behind SELECT FOR UPDATE until the lock holder commits', async () => {
    await sequelize.query(`INSERT INTO "${TABLE}" (logical_key, value) VALUES ('row-lock', 1)`);
    const holder = await sequelize.transaction();
    const [pidRows] = await sequelize.query('SELECT pg_backend_pid() AS pid', { transaction: holder });
    await sequelize.query(`SELECT id FROM "${TABLE}" WHERE logical_key = 'row-lock' FOR UPDATE`, { transaction: holder });

    let competingPid;
    let competingStarted;
    const started = new Promise((resolve) => { competingStarted = resolve; });
    const contender = withTransaction(async (transaction) => {
      const [rows] = await sequelize.query('SELECT pg_backend_pid() AS pid', { transaction });
      competingPid = rows[0].pid;
      competingStarted();
      await sequelize.query(`UPDATE "${TABLE}" SET value = 2 WHERE logical_key = 'row-lock'`, { transaction });
    });
    await started;

    // Observe PostgreSQL's lock wait directly; no sleep-based race assumption.
    const deadline = Date.now() + 5000;
    let isWaiting = false;
    while (!isWaiting && Date.now() < deadline) {
      const [waiters] = await sequelize.query(`SELECT 1 FROM pg_stat_activity
        WHERE pid = :competingPid AND wait_event_type = 'Lock'
          AND pg_blocking_pids(pid) @> ARRAY[:holderPid]::integer[] LIMIT 1`, {
        replacements: { competingPid, holderPid: pidRows[0].pid },
      });
      isWaiting = waiters.length > 0;
      if (!isWaiting) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    try {
      assert.ok(isWaiting, 'The competing statement should be waiting on a PostgreSQL row lock.');
      await holder.commit();
    } finally {
      if (holder.finished !== 'commit') await holder.rollback();
    }
    await contender;
    const [rows] = await sequelize.query(`SELECT value FROM "${TABLE}" WHERE logical_key = 'row-lock'`);
    assert.equal(rows[0].value, 2);
  });
});
