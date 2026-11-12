import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import sequelize from '../src/config/database.js';
import * as models from '../src/models/index.js';
import { runtimeSchemaSnapshot } from '../db/runtimeSchemaSnapshot.js';
import { Internship, ProjectTeam, Skill, StudentProfile, User } from '../src/models/index.js';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = process.env.TASK_1_18_TEST_SCHEMA || '';
const runId = process.env.TASK_1_18_TEST_RUN_ID || '';
let protectedUserSnapshot;
const matchesType = (actual, expected) => {
  if (expected.type === 'STRING') return actual.udt_name === 'varchar'
    && actual.character_maximum_length === (expected.typeOptions?.length || 255);
  if (expected.type === 'DECIMAL') return actual.udt_name === 'numeric'
    && actual.numeric_precision === expected.typeOptions.precision
    && actual.numeric_scale === expected.typeOptions.scale;
  const postgresTypes = {
    BIGINT: 'int8', BOOLEAN: 'bool', DATE: 'timestamptz', DATEONLY: 'date',
    FLOAT: 'float8', INTEGER: 'int4', JSONB: 'jsonb', TEXT: 'text', UUID: 'uuid',
  };
  return actual.udt_name === postgresTypes[expected.type];
};

function modelTable(model) {
  const table = model.getTableName();
  return typeof table === 'string' ? table : table.tableName;
}

function runMigrations() {
  return spawnSync(process.execPath, ['db/migrate.js', 'up'], {
    cwd: backendDir,
    encoding: 'utf8',
    env: process.env,
  });
}

function runMigration(command) {
  return spawnSync(process.execPath, ['db/migrate.js', command], {
    cwd: backendDir,
    encoding: 'utf8',
    env: process.env,
  });
}

function quote(identifier) {
  return sequelize.getQueryInterface().quoteIdentifier(identifier);
}

async function migrationRecorded() {
  const [rows] = await sequelize.query(`SELECT EXISTS (SELECT 1 FROM "_migrations"
    WHERE version = '20261111_add_runtime_model_schema') AS applied`);
  return rows[0].applied;
}

async function schemaDigest() {
  const [tables] = await sequelize.query(`SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() ORDER BY tablename`);
  const [columns] = await sequelize.query(`SELECT table_name, column_name, data_type, is_nullable,
      column_default, is_identity FROM information_schema.columns
    WHERE table_schema = current_schema() ORDER BY table_name, ordinal_position`);
  const [relations] = await sequelize.query(`SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname = current_schema() ORDER BY tablename, indexname`);
  const [constraints] = await sequelize.query(`SELECT table_row.relname AS table_name,
      constraint_row.conname, constraint_row.contype, pg_get_constraintdef(constraint_row.oid) AS definition
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS table_row ON table_row.oid = constraint_row.conrelid
    JOIN pg_namespace AS table_schema ON table_schema.oid = table_row.relnamespace
    WHERE table_schema.nspname = current_schema() ORDER BY table_row.relname, constraint_row.conname`);
  const [extensions] = await sequelize.query(`SELECT extension_row.extname, extension_namespace.nspname AS schema_name
    FROM pg_extension AS extension_row
    JOIN pg_namespace AS extension_namespace ON extension_namespace.oid = extension_row.extnamespace
    WHERE extension_row.extname = 'pg_trgm'`);
  return { tables, columns, relations, constraints, extensions };
}

async function expectCompatibilityFailure(label, mutate, restore, diagnostic) {
  const down = runMigration('down');
  assert.equal(down.status, 0, `${label}: ${down.stdout}\n${down.stderr}`);
  let mutationStarted = false;
  try {
    await mutate();
    mutationStarted = true;
    const beforeDigest = await schemaDigest();
    const userCount = await User.count();
    const failed = runMigration('up');
    const output = `${failed.stdout}\n${failed.stderr}`;
    assert.equal(failed.status, 1, `${label}: expected migration failure\n${output}`);
    assert.match(output, diagnostic, `${label}: useful incompatibility diagnostic`);
    assert.equal(await migrationRecorded(), false, `${label}: migration record must not be written`);
    assert.deepEqual(await schemaDigest(), beforeDigest, `${label}: no partial migration DDL may remain`);
    assert.equal(await User.count(), userCount, `${label}: existing test data must remain unchanged`);
    if (protectedUserSnapshot) {
      const protectedUser = await User.findByPk(protectedUserSnapshot.id);
      assert.ok(protectedUser, `${label}: protected user row must remain`);
      assert.deepEqual({
        id: protectedUser.id,
        email: protectedUser.email,
        username: protectedUser.username,
        role: protectedUser.role,
        is_active: protectedUser.is_active,
      }, protectedUserSnapshot, `${label}: protected user data must remain unchanged`);
    }
  } finally {
    if (mutationStarted) await restore();
    if (!await migrationRecorded()) {
      const recovered = runMigration('up');
      assert.equal(recovered.status, 0, `${label}: restore/reapply failed\n${recovered.stdout}\n${recovered.stderr}`);
    }
  }
}

describe('Task 1.18 PostgreSQL migration-to-runtime-model compatibility', () => {
  before(async () => {
    assert.equal(sequelize.getDialect(), 'postgres');
    assert.match(schema, /^task_1_18_test_[a-f0-9]{32}$/);
    assert.match(runId, /^[0-9a-f-]{36}$/i);
    await sequelize.authenticate();
    const [identity] = await sequelize.query(`SELECT current_database() AS database_name,
      current_schema() AS schema_name,
      (SELECT run_id FROM _task_1_18_run_marker LIMIT 1) AS run_id`);
    assert.equal(identity[0].database_name, 'ai_internship');
    assert.equal(identity[0].schema_name, schema);
    assert.equal(identity[0].run_id, runId);

    const applied = runMigrations();
    assert.equal(applied.status, 0, `${applied.stdout}\n${applied.stderr}`);
  });

  after(async () => { await sequelize.close(); });

  it('matches the checked-in schema snapshot to every runtime model', () => {
    const runtimeModels = Object.entries(models).filter(([, model]) => model?.rawAttributes);
    assert.equal(runtimeModels.length, runtimeSchemaSnapshot.length);
    for (const [name, model] of runtimeModels) {
      const snapshot = runtimeSchemaSnapshot.find((entry) => entry.model === name);
      assert.ok(snapshot, `Missing schema snapshot for ${name}`);
      assert.equal(snapshot.table, modelTable(model));
      const persistedAttributes = Object.entries(model.rawAttributes)
        .filter(([, attr]) => attr.type?.key !== 'VIRTUAL');
      assert.equal(snapshot.columns.length, persistedAttributes.length, `${name} column count`);
      for (const [columnName, attribute] of persistedAttributes) {
        const column = snapshot.columns.find((entry) => entry.name === columnName);
        assert.ok(column, `${name}.${columnName} missing from migration snapshot`);
        assert.equal(column.type, attribute.type.key, `${name}.${columnName} type`);
        assert.equal(column.allowNull, attribute.allowNull ?? !attribute.primaryKey, `${name}.${columnName} nullability`);
      }
    }
  });

  it('creates every model table and compatible column in the migrated isolated schema', async () => {
    const [postgresColumns] = await sequelize.query(`SELECT table_name, column_name, data_type, udt_name,
      character_maximum_length, numeric_precision, numeric_scale FROM information_schema.columns
      WHERE table_schema = current_schema()`);
    const postgresColumnMap = new Map(postgresColumns.map((column) => [`${column.table_name}.${column.column_name}`, column]));
    for (const [, model] of Object.entries(models).filter(([, value]) => value?.rawAttributes)) {
      const table = modelTable(model);
      const actualColumns = await sequelize.getQueryInterface().describeTable(model.getTableName());
      const expectedColumns = Object.entries(model.rawAttributes).filter(([, attr]) => attr.type?.key !== 'VIRTUAL');
      assert.deepEqual(Object.keys(actualColumns).sort(), expectedColumns.map(([name]) => name).sort(), `${model.name} columns`);
      for (const [name, attr] of expectedColumns) {
        const postgresColumn = postgresColumnMap.get(`${table}.${name}`);
        assert.ok(postgresColumn && matchesType(postgresColumn, {
          type: attr.type.key,
          typeOptions: attr.type.options || {},
        }), `${table}.${name} SQL type expected ${attr.type.toString()}, found ${postgresColumn?.data_type}/${postgresColumn?.udt_name}(${postgresColumn?.numeric_precision},${postgresColumn?.numeric_scale})`);
        assert.equal(Boolean(actualColumns[name].allowNull), Boolean(attr.allowNull ?? !attr.primaryKey), `${table}.${name} nullability`);
        assert.equal(Boolean(actualColumns[name].primaryKey), Boolean(attr.primaryKey), `${table}.${name} primary key`);
      }
    }
  });

  it('creates the model-declared foreign keys, unique constraints, and indexes', async () => {
    const [foreignKeys] = await sequelize.query(`
      SELECT local_table.relname AS table_name, local_attribute.attname AS column_name,
        referenced_table.relname AS referenced_table, referenced_attribute.attname AS referenced_column,
        constraint_row.confdeltype AS delete_action, constraint_row.confupdtype AS update_action
      FROM pg_constraint AS constraint_row
      JOIN pg_class AS local_table ON local_table.oid = constraint_row.conrelid
      JOIN pg_namespace AS local_schema ON local_schema.oid = local_table.relnamespace
      JOIN pg_class AS referenced_table ON referenced_table.oid = constraint_row.confrelid
      JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY AS local_key(attnum, position) ON true
      JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY AS referenced_key(attnum, position)
        ON referenced_key.position = local_key.position
      JOIN pg_attribute AS local_attribute ON local_attribute.attrelid = local_table.oid AND local_attribute.attnum = local_key.attnum
      JOIN pg_attribute AS referenced_attribute ON referenced_attribute.attrelid = referenced_table.oid AND referenced_attribute.attnum = referenced_key.attnum
      WHERE constraint_row.contype = 'f' AND local_schema.nspname = current_schema()`);

    const deleteActions = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
    for (const [, model] of Object.entries(models).filter(([, value]) => value?.rawAttributes)) {
      const table = modelTable(model);
      for (const [columnName, attr] of Object.entries(model.rawAttributes).filter(([, value]) => value.references)) {
        const referenceTable = typeof attr.references.model === 'string'
          ? attr.references.model : attr.references.model.tableName;
        assert.ok(foreignKeys.some((foreignKey) => foreignKey.table_name === table
          && foreignKey.column_name === columnName
          && foreignKey.referenced_table === referenceTable
          && foreignKey.referenced_column === attr.references.key
          && deleteActions[foreignKey.delete_action] === (attr.onDelete || 'NO ACTION')
          && deleteActions[foreignKey.update_action] === (attr.onUpdate || 'NO ACTION')),
        `Missing/incompatible FK ${table}.${columnName} -> ${referenceTable}.${attr.references.key}`);
      }

      const indexes = await sequelize.getQueryInterface().showIndex(model.getTableName());
      const signatures = indexes.map((index) => ({
        fields: index.fields.map((field) => field.attribute || field.name),
        unique: !!index.unique,
      }));
      const expectedIndexes = [...(model.options.indexes || [])];
      const uniqueGroups = new Map();
      for (const [columnName, attr] of Object.entries(model.rawAttributes)) {
        if (attr.unique === true) expectedIndexes.push({ fields: [columnName], unique: true });
        if (typeof attr.unique === 'string') {
          if (!uniqueGroups.has(attr.unique)) uniqueGroups.set(attr.unique, []);
          uniqueGroups.get(attr.unique).push(columnName);
        }
      }
      for (const fields of uniqueGroups.values()) expectedIndexes.push({ fields, unique: true });
      for (const expected of expectedIndexes) {
        assert.ok(signatures.some((actual) => actual.unique === !!expected.unique
          && actual.fields.length === expected.fields.length
          && actual.fields.every((field, index) => field === expected.fields[index])),
        `Missing model index on ${table} (${expected.fields.join(', ')})`);
      }
    }
  });

  it('revalidates a correct pre-existing runtime schema on repeated up', async () => {
    const record = await User.create({
      email: `runtime-schema-protected-${runId}@example.test`,
      username: `runtime-schema-protected-${runId}`,
      password: 'test-only-hash',
      role: 'student',
      is_active: true,
    });
    protectedUserSnapshot = {
      id: record.id,
      email: record.email,
      username: record.username,
      role: record.role,
      is_active: record.is_active,
    };
    const down = runMigration('down');
    assert.equal(down.status, 0, `${down.stdout}\n${down.stderr}`);
    const up = runMigration('up');
    assert.equal(up.status, 0, `${up.stdout}\n${up.stderr}`);
    assert.match(up.stdout, /Completed: 20261111_add_runtime_model_schema/);
  });

  it('rejects an existing runtime column with a missing database default before DDL', async () => {
    await expectCompatibilityFailure(
      'missing role default',
      () => sequelize.query('ALTER TABLE "accounts_user" ALTER COLUMN "role" DROP DEFAULT'),
      () => sequelize.query(`ALTER TABLE "accounts_user" ALTER COLUMN "role" SET DEFAULT 'student'`),
      /accounts_user\.role has an incompatible database default/,
    );
  });

  it('rejects incorrect owned auto-increment sequence behavior before DDL', async () => {
    const [rows] = await sequelize.query(`SELECT pg_get_serial_sequence(
      format('%I.%I', current_schema(), 'administration_studentactivitylog'), 'id') AS sequence_name`);
    const sequenceName = rows[0].sequence_name;
    assert.ok(sequenceName);
    await expectCompatibilityFailure(
      'unowned auto-increment sequence',
      () => sequelize.query(`ALTER SEQUENCE ${sequenceName} OWNED BY NONE`),
      () => sequelize.query(`ALTER SEQUENCE ${sequenceName} OWNED BY ${quote(schema)}.${quote('administration_studentactivitylog')}.${quote('id')}`),
      /administration_studentactivitylog\.id is incompatible: expected an owned PostgreSQL auto-increment sequence/,
    );
  });

  it('rejects a missing per-column unique constraint before DDL', async () => {
    const [rows] = await sequelize.query(`SELECT constraint_row.conname
      FROM pg_constraint AS constraint_row
      JOIN pg_class AS table_row ON table_row.oid = constraint_row.conrelid
      JOIN pg_namespace AS table_schema ON table_schema.oid = table_row.relnamespace
      JOIN LATERAL unnest(constraint_row.conkey) AS key_row(attnum) ON true
      JOIN pg_attribute AS attribute_row ON attribute_row.attrelid = table_row.oid AND attribute_row.attnum = key_row.attnum
      WHERE constraint_row.contype = 'u' AND table_schema.nspname = current_schema()
        AND table_row.relname = 'accounts_user' AND attribute_row.attname = 'email'
        AND cardinality(constraint_row.conkey) = 1 LIMIT 1`);
    const constraintName = rows[0]?.conname;
    assert.ok(constraintName);
    await expectCompatibilityFailure(
      'missing accounts_user.email uniqueness',
      () => sequelize.query(`ALTER TABLE ${quote('accounts_user')} DROP CONSTRAINT ${quote(constraintName)}`),
      () => sequelize.query(`ALTER TABLE ${quote('accounts_user')} ADD CONSTRAINT ${quote('task_1_18_restore_email_unique')} UNIQUE (${quote('email')})`),
      /accounts_user.*missing or has an incompatible index/,
    );
  });

  it('rejects an unexpected foreign key before DDL', async () => {
    const table = 'student_profiles_studentprofile';
    const constraint = 'task_1_18_unexpected_user_fk';
    await expectCompatibilityFailure(
      'unexpected user_id foreign key',
      () => sequelize.query(`ALTER TABLE ${quote(table)} ADD CONSTRAINT ${quote(constraint)}
        FOREIGN KEY (${quote('user_id')}) REFERENCES ${quote('accounts_user')} (${quote('id')})
        ON DELETE RESTRICT ON UPDATE CASCADE`),
      () => sequelize.query(`ALTER TABLE ${quote(table)} DROP CONSTRAINT ${quote(constraint)}`),
      /student_profiles_studentprofile has unexpected or incompatible foreign keys/,
    );
  });

  it('rejects a foreign key that targets the wrong runtime table', async () => {
    const table = 'student_profiles_studentprofile';
    const [rows] = await sequelize.query(`SELECT constraint_row.conname
      FROM pg_constraint AS constraint_row
      JOIN pg_class AS local_table ON local_table.oid = constraint_row.conrelid
      JOIN pg_namespace AS local_schema ON local_schema.oid = local_table.relnamespace
      JOIN pg_class AS referenced_table ON referenced_table.oid = constraint_row.confrelid
      JOIN LATERAL unnest(constraint_row.conkey) AS key_row(attnum) ON true
      JOIN pg_attribute AS local_attribute ON local_attribute.attrelid = local_table.oid AND local_attribute.attnum = key_row.attnum
      WHERE constraint_row.contype = 'f' AND local_schema.nspname = current_schema()
        AND local_table.relname = :tableName AND local_attribute.attname = 'user_id'
        AND referenced_table.relname = 'accounts_user' LIMIT 1`, { replacements: { tableName: table } });
    const constraintName = rows[0]?.conname;
    assert.ok(constraintName);
    await expectCompatibilityFailure(
      'wrong user_id foreign key target',
      async () => {
        await sequelize.query(`ALTER TABLE ${quote(table)} DROP CONSTRAINT ${quote(constraintName)}`);
        await sequelize.query(`ALTER TABLE ${quote(table)} ADD CONSTRAINT ${quote('task_1_18_wrong_user_fk')}
          FOREIGN KEY (${quote('user_id')}) REFERENCES ${quote('projects_projectteam')} (${quote('id')})
          ON DELETE CASCADE ON UPDATE CASCADE`);
      },
      async () => {
        await sequelize.query(`ALTER TABLE ${quote(table)} DROP CONSTRAINT ${quote('task_1_18_wrong_user_fk')}`);
        await sequelize.query(`ALTER TABLE ${quote(table)} ADD CONSTRAINT ${quote('task_1_18_restore_user_fk')}
          FOREIGN KEY (${quote('user_id')}) REFERENCES ${quote('accounts_user')} (${quote('id')})
          ON DELETE CASCADE ON UPDATE CASCADE`);
      },
      /student_profiles_studentprofile is missing an expected foreign key with exact target\/actions/,
    );
  });

  it('rejects an index with the wrong access method before DDL', async () => {
    const table = 'internships_internship';
    const index = 'runtime_internships_type_idx';
    await expectCompatibilityFailure(
      'hash index where btree is required',
      async () => {
        await sequelize.query(`DROP INDEX ${quote(index)}`);
        await sequelize.query(`CREATE INDEX ${quote(index)} ON ${quote(table)} USING HASH (${quote('internship_type')})`);
      },
      async () => {
        await sequelize.query(`DROP INDEX ${quote(index)}`);
        await sequelize.query(`CREATE INDEX ${quote(index)} ON ${quote(table)} USING BTREE (${quote('internship_type')})`);
      },
      /internships_internship.*missing or has an incompatible index/,
    );
  });

  it('rejects a trigram index on the wrong column before DDL', async () => {
    const [rows] = await sequelize.query(`SELECT extension_namespace.nspname AS schema_name
      FROM pg_extension AS extension_row
      JOIN pg_namespace AS extension_namespace ON extension_namespace.oid = extension_row.extnamespace
      WHERE extension_row.extname = 'pg_trgm'`);
    const extensionSchema = rows[0]?.schema_name;
    assert.ok(extensionSchema);
    const table = 'internships_internship';
    const index = 'runtime_internships_title_trgm_idx';
    await expectCompatibilityFailure(
      'title trigram index on organization_name',
      async () => {
        await sequelize.query(`DROP INDEX ${quote(index)}`);
        await sequelize.query(`CREATE INDEX ${quote(index)} ON ${quote(table)} USING GIN
          (${quote('organization_name')} ${quote(extensionSchema)}.gin_trgm_ops)`);
      },
      async () => {
        await sequelize.query(`DROP INDEX ${quote(index)}`);
        await sequelize.query(`CREATE INDEX ${quote(index)} ON ${quote(table)} USING GIN
          (${quote('title')} ${quote(extensionSchema)}.gin_trgm_ops)`);
      },
      /internships_internship.*missing or has an incompatible index/,
    );
  });

  it('rejects a missing required composite unique index before DDL', async () => {
    const table = 'internships_internshipapplication';
    const index = 'internship_application_unique';
    await expectCompatibilityFailure(
      'missing application student/internship composite uniqueness',
      () => sequelize.query(`DROP INDEX ${quote(index)}`),
      () => sequelize.getQueryInterface().addIndex(table, ['student_id', 'internship_id'], {
        name: index, unique: true, transaction: undefined,
      }),
      /internships_internshipapplication.*missing or has an incompatible index/,
    );
  });

  it('runs representative listing queries through Sequelize without schema synchronization', async () => {
    const listing = await Internship.findAndCountAll({
      where: { status: 'active' },
      limit: 5,
      offset: 0,
      include: [{ model: Skill, as: 'skills' }],
      order: [['posted_at', 'DESC']],
    });
    assert.equal(listing.count, 0);
    assert.deepEqual(listing.rows, []);
  });

  it('uses the trigram index for a selective leading-wildcard category query on representative data', async () => {
    const sample = Array.from({ length: 6000 }, (_, index) => ({
      title: `Internship ${index}`,
      organization_name: `Organization ${index % 30}`,
      description: `Representative posting ${index}`,
      category: index === 5999 ? 'RareCategorySentinel' : `Category ${index % 25}`,
      status: index % 2 ? 'active' : 'closed',
      posted_at: new Date(Date.UTC(2026, 0, 1) + index * 1000),
    }));
    await Internship.bulkCreate(sample, { validate: true });
    await sequelize.query('ANALYZE "internships_internship"');

    const [defaultPlans] = await sequelize.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id FROM "internships_internship" WHERE category ILIKE '%RareCategorySentinel%'`);
    const defaultPlan = JSON.stringify(defaultPlans[0]['QUERY PLAN']);
    assert.ok(defaultPlan.includes('Seq Scan') || defaultPlan.includes('runtime_internships_category_trgm_idx'));

    const forcedPlan = await sequelize.transaction(async (transaction) => {
      await sequelize.query('SET LOCAL enable_seqscan = off', { transaction });
      const [plans] = await sequelize.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT id FROM "internships_internship" WHERE category ILIKE '%RareCategorySentinel%'`, { transaction });
      return JSON.stringify(plans[0]['QUERY PLAN']);
    });
    assert.ok(forcedPlan.includes('runtime_internships_category_trgm_idx'),
      `Expected the trigram index to support the leading-wildcard search. Plan: ${forcedPlan}`);
    const [matches] = await sequelize.query(`SELECT count(*)::int AS count FROM "internships_internship"
      WHERE category ILIKE '%RareCategorySentinel%'`);
    assert.equal(matches[0].count, 1);
  });
});
