/**
 * Add the current Node/Sequelize runtime schema alongside the retained legacy
 * schema. The snapshot is intentionally checked in so this migration remains
 * stable if models change in a later release.
 *
 * Existing runtime tables are validated before any DDL runs. An incompatible
 * object is a hard error: this migration never renames, alters, or copies data.
 */
import { DataTypes } from 'sequelize';
import sequelize from '../src/config/database.js';
import { runtimeSchemaSnapshot } from '../db/runtimeSchemaSnapshot.js';
import { migrationQueryInterface } from '../db/migrationQueryInterface.js';

const qi = () => sequelize.getQueryInterface();
const runtimeQueryIndexes = [
  { table: 'internships_internship', fields: ['status', 'posted_at'], name: 'runtime_internships_status_posted_at_idx' },
  { table: 'internships_internship', fields: ['internship_type'], name: 'runtime_internships_type_idx' },
  { table: 'internships_internship', fields: ['work_type'], name: 'runtime_internships_work_type_idx' },
  { table: 'internships_internship', fields: ['compensation_type'], name: 'runtime_internships_compensation_type_idx' },
  { table: 'internships_internshipapplication', fields: ['internship_id'], name: 'runtime_applications_internship_idx' },
  { table: 'internships_savedinternship', fields: ['internship_id'], name: 'runtime_saved_internships_internship_idx' },
  { table: 'recommendations_recommendation', fields: ['internship_id'], name: 'runtime_recommendations_internship_idx' },
  { table: 'projects_teammember', fields: ['team_id'], name: 'runtime_team_members_team_idx' },
  { table: 'projects_projectteam', fields: ['assigned_advisor_id'], name: 'runtime_project_teams_advisor_idx' },
  { table: 'projects_projectteammessage', fields: ['team_id', 'created_at'], name: 'runtime_project_messages_team_created_idx' },
  { table: 'projects_weeklylogbook', fields: ['project_team_id', 'week_number'], name: 'runtime_logbooks_team_week_idx' },
  { table: 'student_profiles_cv', fields: ['student_id'], name: 'runtime_cvs_student_idx' },
  { table: 'administration_studentactivitylog', fields: ['student_id', 'created_at'], name: 'runtime_activity_student_created_idx' },
  { table: 'notifications_notification', fields: ['recipient_id', 'is_read'], name: 'runtime_notifications_recipient_read_idx' },
];
const runtimeTrigramIndexes = [
  { table: 'internships_internship', column: 'title', name: 'runtime_internships_title_trgm_idx' },
  { table: 'internships_internship', column: 'organization_name', name: 'runtime_internships_org_trgm_idx' },
  { table: 'internships_internship', column: 'description', name: 'runtime_internships_description_trgm_idx' },
  { table: 'internships_internship', column: 'category', name: 'runtime_internships_category_trgm_idx' },
  { table: 'internships_internship', column: 'city', name: 'runtime_internships_city_trgm_idx' },
  { table: 'internships_internship', column: 'country', name: 'runtime_internships_country_trgm_idx' },
];

function resolveType(column) {
  const args = [];
  if (column.type === 'STRING') args.push(column.length || 255);
  if (column.type === 'DECIMAL') args.push(column.precision, column.scale);
  const type = DataTypes[column.type];
  if (!type) throw new Error(`Unsupported runtime schema type ${column.type}.`);
  return args.length ? type(...args) : type;
}

function resolveDefault(value) {
  if (value === 'NOW') return DataTypes.NOW;
  if (value === 'UUIDV4') return DataTypes.UUIDV4;
  return value;
}

function expectedColumns(table) {
  return Object.fromEntries(table.columns.map((column) => {
    const definition = {
      type: resolveType(column),
      allowNull: column.allowNull,
    };
    if (column.primaryKey) definition.primaryKey = true;
    if (column.autoIncrement) definition.autoIncrement = true;
    if (column.defaultValue !== undefined) definition.defaultValue = resolveDefault(column.defaultValue);
    if (column.unique === true) definition.unique = true;
    return [column.name, definition];
  }));
}

function expectedUniqueGroups(table) {
  const groups = new Map();
  for (const column of table.columns) {
    if (typeof column.unique === 'string') {
      if (!groups.has(column.unique)) groups.set(column.unique, []);
      groups.get(column.unique).push(column.name);
    }
  }
  return [...groups].map(([name, fields]) => ({ name, fields, unique: true }));
}

function expectedIndexes(table) {
  const runtime = runtimeQueryIndexes.filter((index) => index.table === table.table);
  return [
    ...expectedUniqueGroups(table),
    ...table.indexes.map((index) => ({ ...index, unique: !!index.unique })),
    ...runtime.map((index) => ({ ...index, unique: !!index.unique })),
  ];
}

function matchesPostgresType(actual, expected) {
  const type = expected.type;
  if (type === 'STRING') return actual.udt_name === 'varchar'
    && actual.character_maximum_length === (expected.length || 255);
  if (type === 'DECIMAL') return actual.udt_name === 'numeric'
    && actual.numeric_precision === expected.precision
    && actual.numeric_scale === expected.scale;
  const postgresTypes = {
    BIGINT: 'int8', BOOLEAN: 'bool', DATE: 'timestamptz', DATEONLY: 'date',
    FLOAT: 'float8', INTEGER: 'int4', JSONB: 'jsonb', TEXT: 'text', UUID: 'uuid',
  };
  return actual.udt_name === postgresTypes[type];
}

function sameFields(actual, expected) {
  return actual.length === expected.length && actual.every((field, index) => field === expected[index]);
}

async function assertCompatibleTable(table, transaction) {
  const queryInterface = qi();
  const described = await queryInterface.describeTable(table.table, { transaction });
  const [postgresColumns] = await sequelize.query(`
    SELECT column_name, data_type, udt_name, character_maximum_length,
      numeric_precision, numeric_scale, is_nullable
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = :tableName`,
  { replacements: { tableName: table.table }, transaction });
  const postgresColumnMap = new Map(postgresColumns.map((column) => [column.column_name, column]));
  const expectedNames = new Set(table.columns.map((column) => column.name));
  const actualNames = new Set(Object.keys(described));
  const missing = [...expectedNames].filter((name) => !actualNames.has(name));
  const extra = [...actualNames].filter((name) => !expectedNames.has(name));
  if (missing.length || extra.length) {
    throw new Error(`Runtime table ${table.table} has incompatible columns (missing: ${missing.join(',') || 'none'}; extra: ${extra.join(',') || 'none'}).`);
  }

  for (const column of table.columns) {
    const actual = described[column.name];
    const postgresColumn = postgresColumnMap.get(column.name);
    if (!postgresColumn || !matchesPostgresType(postgresColumn, column)
        || Boolean(actual.allowNull) !== Boolean(column.allowNull)
        || Boolean(actual.primaryKey) !== Boolean(column.primaryKey)) {
      throw new Error(`Runtime column ${table.table}.${column.name} is incompatible (expected ${JSON.stringify(column)}, nullable=${column.allowNull}, primaryKey=${!!column.primaryKey}; found ${JSON.stringify(postgresColumn || actual)}).`);
    }
  }

  const actualIndexes = await queryInterface.showIndex(table.table, { transaction });
  const actualSignatures = actualIndexes.map((index) => ({
    fields: index.fields.map((field) => field.attribute || field.name),
    unique: !!index.unique,
  }));
  const missingIndexes = expectedIndexes(table).filter((expected) => !actualSignatures.some((actual) =>
    actual.unique === expected.unique && sameFields(actual.fields, expected.fields)));
  const [databaseIndexes] = await sequelize.query(`SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = current_schema() AND tablename = :tableName`, {
    replacements: { tableName: table.table }, transaction,
  });
  const tableTrigramIndexes = runtimeTrigramIndexes.filter((index) => index.table === table.table);
  const missingTrigramIndexes = tableTrigramIndexes.filter((expected) => {
    const found = databaseIndexes.find((index) => index.indexname === expected.name);
    if (found && (!found.indexdef.includes('USING gin') || !found.indexdef.includes('gin_trgm_ops'))) {
      throw new Error(`Runtime index ${expected.name} exists with an incompatible definition.`);
    }
    return !found;
  });

  const expectedForeignKeys = table.columns.filter((column) => column.references);
  if (expectedForeignKeys.length) {
    const [actualForeignKeys] = await sequelize.query(`
      SELECT local_attribute.attname AS column_name,
        referenced_table.relname AS referenced_table,
        referenced_attribute.attname AS referenced_column,
        constraint_row.confdeltype AS delete_action,
        constraint_row.confupdtype AS update_action
      FROM pg_constraint AS constraint_row
      JOIN pg_class AS local_table ON local_table.oid = constraint_row.conrelid
      JOIN pg_namespace AS local_schema ON local_schema.oid = local_table.relnamespace
      JOIN pg_class AS referenced_table ON referenced_table.oid = constraint_row.confrelid
      JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY AS local_key(attnum, position) ON true
      JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY AS referenced_key(attnum, position)
        ON referenced_key.position = local_key.position
      JOIN pg_attribute AS local_attribute ON local_attribute.attrelid = local_table.oid AND local_attribute.attnum = local_key.attnum
      JOIN pg_attribute AS referenced_attribute ON referenced_attribute.attrelid = referenced_table.oid AND referenced_attribute.attnum = referenced_key.attnum
      WHERE constraint_row.contype = 'f' AND local_schema.nspname = current_schema()
        AND local_table.relname = :tableName`, { replacements: { tableName: table.table }, transaction });
    const actions = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
    const missingForeignKeys = expectedForeignKeys.filter((expected) => !actualForeignKeys.some((actual) =>
      actual.column_name === expected.name
      && actual.referenced_table === expected.references.model
      && actual.referenced_column === expected.references.key
      && actions[actual.delete_action] === (expected.onDelete || 'NO ACTION')
      && actions[actual.update_action] === (expected.onUpdate || 'NO ACTION')));
    if (missingForeignKeys.length) {
      throw new Error(`Runtime table ${table.table} is missing compatible foreign keys: ${missingForeignKeys.map((column) => column.name).join(', ')}.`);
    }
  }
  return { missingIndexes, missingTrigramIndexes };
}

async function ensureTrigramExtension(transaction) {
  const [installed] = await sequelize.query(`SELECT extension_namespace.nspname AS schema_name
    FROM pg_extension AS extension_row
    JOIN pg_namespace AS extension_namespace ON extension_namespace.oid = extension_row.extnamespace
    WHERE extension_row.extname = 'pg_trgm'`, { transaction });
  if (installed.length) return installed[0].schema_name;

  const [availability] = await sequelize.query(`SELECT trusted FROM pg_available_extension_versions
    WHERE name = 'pg_trgm' ORDER BY version DESC LIMIT 1`, { transaction });
  const [privileges] = await sequelize.query(`SELECT has_database_privilege(current_user, current_database(), 'CREATE') AS can_create`, { transaction });
  if (!availability.length || !availability[0].trusted || !privileges[0].can_create) {
    throw new Error('pg_trgm is unavailable or the migration role cannot install the trusted extension.');
  }

  const [schemas] = await sequelize.query('SELECT current_schema() AS schema_name', { transaction });
  const schemaName = schemas[0].schema_name;
  await sequelize.query(`CREATE EXTENSION pg_trgm WITH SCHEMA ${qi().quoteIdentifier(schemaName)}`, { transaction });
  return schemaName;
}

async function createTrigramIndex(index, extensionSchema, transaction) {
  const queryInterface = qi();
  const quote = (identifier) => queryInterface.quoteIdentifier(identifier);
  await sequelize.query(`CREATE INDEX ${quote(index.name)} ON ${quote(index.table)} USING GIN
    (${quote(index.column)} ${quote(extensionSchema)}.gin_trgm_ops)`, { transaction });
}

async function tableExists(tableName, transaction) {
  const [rows] = await sequelize.query(`
    SELECT to_regclass(format('%I.%I', current_schema(), :tableName)) IS NOT NULL AS exists
  `, { replacements: { tableName }, transaction });
  return rows[0].exists;
}

export const up = async ({ transaction } = {}) => {
  if (!transaction) throw new Error('Runtime schema migration requires the migration transaction.');
  const queryInterface = migrationQueryInterface(sequelize, transaction);
  const existing = new Set();
  const missingIndexesByTable = new Map();
  const missingTrigramIndexesByTable = new Map();

  // Validate every pre-existing target table before making any changes.
  for (const table of runtimeSchemaSnapshot) {
    if (await tableExists(table.table, transaction)) {
      const missing = await assertCompatibleTable(table, transaction);
      missingIndexesByTable.set(table.table, missing.missingIndexes);
      missingTrigramIndexesByTable.set(table.table, missing.missingTrigramIndexes);
      existing.add(table.table);
    }
  }

  const extensionSchema = await ensureTrigramExtension(transaction);

  for (const table of runtimeSchemaSnapshot) {
    if (!existing.has(table.table)) {
      await queryInterface.createTable(table.table, expectedColumns(table));
    }
  }

  // Add foreign keys only to tables created by this migration. Existing
  // tables were checked above and remain untouched.
  for (const table of runtimeSchemaSnapshot) {
    if (existing.has(table.table)) continue;
    for (const column of table.columns.filter((item) => item.references)) {
      await queryInterface.addConstraint(table.table, {
        type: 'foreign key',
        fields: [column.name],
        references: { table: column.references.model, field: column.references.key },
        onDelete: column.onDelete || 'NO ACTION',
        onUpdate: column.onUpdate || 'NO ACTION',
        name: `runtime_${table.table}_${column.name}_fkey`,
      });
    }
    for (const index of expectedIndexes(table)) {
      await queryInterface.addIndex(table.table, index.fields, {
        name: index.name,
        unique: index.unique,
      });
    }
    for (const index of runtimeTrigramIndexes.filter((item) => item.table === table.table)) {
      await createTrigramIndex(index, extensionSchema, transaction);
    }
  }

  // Add indexes missing from otherwise compatible pre-existing runtime
  // tables only after all tables have passed structural validation.
  for (const [tableName, missingIndexes] of missingIndexesByTable) {
    for (const index of missingIndexes) {
      await queryInterface.addIndex(tableName, index.fields, {
        name: index.name,
        unique: index.unique,
      });
    }
  }
  for (const [tableName, missingIndexes] of missingTrigramIndexesByTable) {
    for (const index of missingIndexes) {
      await createTrigramIndex(index, extensionSchema, transaction);
    }
  }
};

/**
 * This additive compatibility migration intentionally leaves runtime tables
 * and their data in place on rollback. Removing them could destroy data
 * written after deployment; rolling back removes only the migration record.
 */
export const down = async () => {};
export const version = '20261111_add_runtime_model_schema';
