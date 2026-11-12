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

function expectedColumnUniqueIndexes(table) {
  return table.columns
    .filter((column) => column.unique === true)
    .map((column) => ({ fields: [column.name], unique: true, attributeUnique: true }));
}

function expectedModelIndex(index) {
  return {
    ...index,
    unique: !!index.unique,
    method: String(index.method || index.using || 'btree').toLowerCase(),
    predicate: index.where || null,
    include: index.include || [],
    operatorClasses: index.operatorClasses || null,
  };
}

function expectedIndexes(table) {
  const runtime = runtimeQueryIndexes.filter((index) => index.table === table.table);
  const indexes = [
    { fields: table.columns.filter((column) => column.primaryKey).map((column) => column.name), unique: true, method: 'btree', primaryKey: true },
    ...expectedColumnUniqueIndexes(table),
    ...expectedUniqueGroups(table),
    ...table.indexes.map(expectedModelIndex),
    ...runtime.map((index) => expectedModelIndex(index)),
    ...runtimeTrigramIndexes.filter((index) => index.table === table.table).map((index) => ({
      name: index.name,
      fields: [index.column],
      unique: false,
      method: 'gin',
      predicate: null,
      include: [],
      operatorClasses: ['gin_trgm_ops'],
    })),
  ];
  const seen = new Set();
  return indexes.filter((index) => {
    const signature = JSON.stringify({
      fields: (index.fields || []).map((field) => typeof field === 'string' ? field : field.attribute || field.name),
      unique: !!index.unique,
      method: index.method || 'btree',
      predicate: index.predicate || index.where || null,
      include: index.include || [],
      operatorClasses: index.operatorClasses || [],
    });
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
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

function unwrapSqlParentheses(expression) {
  let value = String(expression || '').trim();
  while (value.startsWith('(') && value.endsWith(')')) {
    let depth = 0;
    let wrapsWholeValue = true;
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] === '(') depth += 1;
      if (value[index] === ')') depth -= 1;
      if (depth === 0 && index < value.length - 1) {
        wrapsWholeValue = false;
        break;
      }
    }
    if (!wrapsWholeValue || depth !== 0) break;
    value = value.slice(1, -1).trim();
  }
  return value;
}

function parseDefaultLiteral(expression) {
  let value = unwrapSqlParentheses(expression);
  value = value.replace(/::(?:character varying|varchar|text|jsonb|boolean|bool|smallint|integer|bigint|int2|int4|int8|numeric|real|double precision)(?:\(\d+(?:,\s*\d+)?\))?\s*$/i, '').trim();
  value = unwrapSqlParentheses(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return Number(value);
  const stringLiteral = value.match(/^'((?:''|[^'])*)'$/s);
  return stringLiteral ? stringLiteral[1].replaceAll("''", "'") : undefined;
}

function hasDatabaseDefault(value) {
  return value !== undefined && value !== 'NOW' && value !== 'UUIDV4';
}

function matchesDefault(actual, expected, column) {
  if (column.autoIncrement) return String(actual || '').toLowerCase().includes('nextval(');
  if (!hasDatabaseDefault(expected)) return actual == null;
  if (actual == null) return false;

  const parsed = parseDefaultLiteral(actual);
  if (column.type === 'JSONB') {
    try {
      const actualJson = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
      return JSON.stringify(actualJson) === JSON.stringify(expected);
    } catch {
      return false;
    }
  }
  if (typeof expected === 'number') return parsed !== undefined && Number(parsed) === expected;
  if (typeof expected === 'boolean') return parsed === expected || parsed === String(expected);
  return parsed === expected;
}

function expectedForeignKeys(table, schemaName) {
  return table.columns.filter((column) => column.references).map((column) => ({
    columns: [column.name],
    referencedSchema: schemaName,
    referencedTable: column.references.model,
    referencedColumns: [column.references.key],
    onDelete: column.onDelete || 'NO ACTION',
    onUpdate: column.onUpdate || 'NO ACTION',
    validated: true,
    deferrable: false,
    initiallyDeferred: false,
  }));
}

function sameForeignKey(actual, expected) {
  return sameFields(actual.columns, expected.columns)
    && actual.referencedSchema === expected.referencedSchema
    && actual.referencedTable === expected.referencedTable
    && sameFields(actual.referencedColumns, expected.referencedColumns)
    && actual.onDelete === expected.onDelete
    && actual.onUpdate === expected.onUpdate
    && actual.validated === expected.validated
    && actual.deferrable === expected.deferrable
    && actual.initiallyDeferred === expected.initiallyDeferred;
}

function indexMatches(actual, expected, extensionSchema) {
  const fields = (expected.fields || []).map((field) => typeof field === 'string' ? field : field.attribute || field.name);
  const include = (expected.include || []).map((field) => typeof field === 'string' ? field : field.attribute || field.name);
  const expectedOperatorClasses = expected.operatorClasses || [];
  return actual.method === (expected.method || 'btree')
    && actual.unique === !!expected.unique
    && actual.immediate
    && actual.valid
    && actual.ready
    && actual.live
    && actual.predicate === (expected.predicate || null)
    && actual.key_fields.length === fields.length
    && sameFields(actual.key_fields, fields)
    && sameFields(actual.included_fields, include)
    && actual.indoption.every((option) => option === 0)
    && (expectedOperatorClasses.length
      ? sameFields(actual.operator_classes, expectedOperatorClasses)
        && actual.operator_schemas.every((schema) => schema === extensionSchema)
      : actual.operator_defaults.every(Boolean));
}

function normalizePgArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '{}') return [];
  const encoded = String(value);
  if (!encoded.startsWith('{') || !encoded.endsWith('}')) return [value];
  return encoded.slice(1, -1).split(',').map((item) => item.replace(/^"|"$/g, ''));
}

async function loadTableIndexes(tableName, transaction) {
  const [indexes] = await sequelize.query(`
    SELECT index_row.relname AS index_name,
      access_method.amname AS method,
      index_definition.indisunique AS unique,
      index_definition.indimmediate AS immediate,
      index_definition.indisvalid AS valid,
      index_definition.indisready AS ready,
      index_definition.indislive AS live,
      index_definition.indnkeyatts AS key_count,
      pg_get_expr(index_definition.indpred, index_definition.indrelid) AS predicate,
      ARRAY(SELECT pg_get_indexdef(index_definition.indexrelid, position, true)
        FROM generate_series(1, index_definition.indnkeyatts) AS position
        ORDER BY position) AS key_fields,
      ARRAY(SELECT pg_get_indexdef(index_definition.indexrelid, position, true)
        FROM generate_series(index_definition.indnkeyatts + 1, index_definition.indnatts) AS position
        ORDER BY position) AS included_fields,
      ARRAY(SELECT option_value::int
        FROM unnest(index_definition.indoption) WITH ORDINALITY AS option_row(option_value, position)
        WHERE position <= index_definition.indnkeyatts ORDER BY position) AS indoption,
      ARRAY(SELECT operator_class.opcname
        FROM unnest(index_definition.indclass) WITH ORDINALITY AS class_row(class_oid, position)
        JOIN pg_opclass AS operator_class ON operator_class.oid = class_row.class_oid
        ORDER BY position) AS operator_classes,
      ARRAY(SELECT operator_namespace.nspname
        FROM unnest(index_definition.indclass) WITH ORDINALITY AS class_row(class_oid, position)
        JOIN pg_opclass AS operator_class ON operator_class.oid = class_row.class_oid
        JOIN pg_namespace AS operator_namespace ON operator_namespace.oid = operator_class.opcnamespace
        ORDER BY position) AS operator_schemas,
      ARRAY(SELECT operator_class.opcdefault
        FROM unnest(index_definition.indclass) WITH ORDINALITY AS class_row(class_oid, position)
        JOIN pg_opclass AS operator_class ON operator_class.oid = class_row.class_oid
        ORDER BY position) AS operator_defaults
    FROM pg_index AS index_definition
    JOIN pg_class AS table_row ON table_row.oid = index_definition.indrelid
    JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_row.relnamespace
    JOIN pg_class AS index_row ON index_row.oid = index_definition.indexrelid
    JOIN pg_am AS access_method ON access_method.oid = index_row.relam
    WHERE table_namespace.nspname = current_schema() AND table_row.relname = :tableName
    ORDER BY index_row.relname`, { replacements: { tableName }, transaction });
  return indexes.map((index) => ({
    ...index,
    unique: Boolean(index.unique),
    immediate: Boolean(index.immediate),
    valid: Boolean(index.valid),
    ready: Boolean(index.ready),
    live: Boolean(index.live),
    key_fields: normalizePgArray(index.key_fields),
    included_fields: normalizePgArray(index.included_fields),
    indoption: normalizePgArray(index.indoption).map(Number),
    operator_classes: normalizePgArray(index.operator_classes),
    operator_schemas: normalizePgArray(index.operator_schemas),
    operator_defaults: normalizePgArray(index.operator_defaults).map((value) => value === true || value === 't' || value === 'true'),
  }));
}

async function loadTableForeignKeys(tableName, transaction) {
  const [rows] = await sequelize.query(`
    SELECT constraint_row.conname AS constraint_name,
      constraint_row.confdeltype AS delete_action,
      constraint_row.confupdtype AS update_action,
      constraint_row.convalidated AS validated,
      constraint_row.condeferrable AS deferrable,
      constraint_row.condeferred AS initially_deferred,
      local_schema.nspname AS local_schema,
      local_table.relname AS local_table,
      referenced_schema.nspname AS referenced_schema,
      referenced_table.relname AS referenced_table,
      local_attribute.attname AS local_column,
      referenced_attribute.attname AS referenced_column,
      local_key.position
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS local_table ON local_table.oid = constraint_row.conrelid
    JOIN pg_namespace AS local_schema ON local_schema.oid = local_table.relnamespace
    JOIN pg_class AS referenced_table ON referenced_table.oid = constraint_row.confrelid
    JOIN pg_namespace AS referenced_schema ON referenced_schema.oid = referenced_table.relnamespace
    JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY AS local_key(attnum, position) ON true
    JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY AS referenced_key(attnum, position)
      ON referenced_key.position = local_key.position
    JOIN pg_attribute AS local_attribute ON local_attribute.attrelid = local_table.oid AND local_attribute.attnum = local_key.attnum
    JOIN pg_attribute AS referenced_attribute ON referenced_attribute.attrelid = referenced_table.oid AND referenced_attribute.attnum = referenced_key.attnum
    WHERE constraint_row.contype = 'f' AND local_schema.nspname = current_schema()
      AND local_table.relname = :tableName
    ORDER BY constraint_row.conname, local_key.position`, { replacements: { tableName }, transaction });
  const actions = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.constraint_name)) {
      grouped.set(row.constraint_name, {
        constraint_name: row.constraint_name,
        localSchema: row.local_schema,
        localTable: row.local_table,
        referencedSchema: row.referenced_schema,
        referencedTable: row.referenced_table,
        columns: [],
        referencedColumns: [],
        onDelete: actions[row.delete_action],
        onUpdate: actions[row.update_action],
        validated: Boolean(row.validated),
        deferrable: Boolean(row.deferrable),
        initiallyDeferred: Boolean(row.initially_deferred),
      });
    }
    grouped.get(row.constraint_name).columns.push(row.local_column);
    grouped.get(row.constraint_name).referencedColumns.push(row.referenced_column);
  }
  return [...grouped.values()];
}

async function assertCompatibleTable(table, transaction) {
  const queryInterface = qi();
  const described = await queryInterface.describeTable(table.table, { transaction });
  const [postgresColumns] = await sequelize.query(`
    SELECT column_name, data_type, udt_name, character_maximum_length,
      numeric_precision, numeric_scale, is_nullable, column_default,
      is_identity, identity_generation
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
    if (!matchesDefault(postgresColumn.column_default, column.defaultValue, column)) {
      throw new Error(`Runtime column ${table.table}.${column.name} has an incompatible database default (expected ${hasDatabaseDefault(column.defaultValue) ? JSON.stringify(column.defaultValue) : 'none; Sequelize supplies this default'}, found ${postgresColumn.column_default ?? 'none'}).`);
    }

    const isIdentity = postgresColumn.is_identity === 'YES';
    const sequenceResult = await sequelize.query(`
      SELECT pg_get_serial_sequence(format('%I.%I', current_schema(), :tableName), :columnName) AS sequence_name
    `, { replacements: { tableName: table.table, columnName: column.name }, transaction });
    const sequenceName = sequenceResult[0][0].sequence_name;
    if (column.autoIncrement) {
      const sequenceDefault = String(postgresColumn.column_default || '').match(/nextval\('((?:''|[^'])+)'::regclass\)/i)?.[1]
        ?.replaceAll("''", "'");
      const expectedSequenceName = String(sequenceName || '').replaceAll('"', '').split('.').at(-1).toLowerCase();
      const actualSequenceName = String(sequenceDefault || '').replaceAll('"', '').split('.').at(-1).toLowerCase();
      if (isIdentity || !sequenceName || !sequenceDefault || actualSequenceName !== expectedSequenceName) {
        throw new Error(`Runtime column ${table.table}.${column.name} is incompatible: expected an owned PostgreSQL auto-increment sequence (SERIAL behavior), found identity=${isIdentity}, sequence=${sequenceName || 'none'}, default=${postgresColumn.column_default || 'none'}.`);
      }
    } else if (isIdentity || sequenceName) {
      throw new Error(`Runtime column ${table.table}.${column.name} is incompatible: expected no identity/owned sequence, found identity=${isIdentity}, sequence=${sequenceName || 'none'}.`);
    }
  }

  const actualIndexes = await loadTableIndexes(table.table, transaction);
  const extensionSchemaRows = await sequelize.query(`SELECT extension_namespace.nspname AS schema_name
    FROM pg_extension AS extension_row
    JOIN pg_namespace AS extension_namespace ON extension_namespace.oid = extension_row.extnamespace
    WHERE extension_row.extname = 'pg_trgm'`, { transaction });
  const extensionSchema = extensionSchemaRows[0][0]?.schema_name;
  const expected = expectedIndexes(table);
  const unmatchedActualIndexes = [...actualIndexes];
  for (const expectedIndex of expected) {
    const matchIndex = unmatchedActualIndexes.findIndex((actual) => indexMatches(actual, expectedIndex, extensionSchema));
    if (matchIndex < 0) {
      throw new Error(`Runtime table ${table.table} is missing or has an incompatible index (expected ${JSON.stringify(expectedIndex)}; found ${JSON.stringify(unmatchedActualIndexes)}).`);
    }
    unmatchedActualIndexes.splice(matchIndex, 1);
  }
  if (unmatchedActualIndexes.length) {
    throw new Error(`Runtime table ${table.table} has unexpected indexes: ${unmatchedActualIndexes.map((index) => index.index_name).join(', ')}.`);
  }

  const actualForeignKeys = await loadTableForeignKeys(table.table, transaction);
  const [schemaRows] = await sequelize.query('SELECT current_schema() AS schema_name', { transaction });
  const expectedKeys = expectedForeignKeys(table, schemaRows[0].schema_name);
  const unmatchedActualForeignKeys = [...actualForeignKeys];
  for (const expectedKey of expectedKeys) {
    const matchIndex = unmatchedActualForeignKeys.findIndex((actual) => sameForeignKey(actual, expectedKey));
    if (matchIndex < 0) {
      throw new Error(`Runtime table ${table.table} is missing an expected foreign key with exact target/actions: ${JSON.stringify(expectedKey)}.`);
    }
    unmatchedActualForeignKeys.splice(matchIndex, 1);
  }
  if (unmatchedActualForeignKeys.length) {
    throw new Error(`Runtime table ${table.table} has unexpected or incompatible foreign keys: ${unmatchedActualForeignKeys.map((key) => key.constraint_name).join(', ')}.`);
  }

  const [checkConstraints] = await sequelize.query(`SELECT constraint_row.conname AS name
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS table_row ON table_row.oid = constraint_row.conrelid
    JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_row.relnamespace
    WHERE constraint_row.contype = 'c' AND table_namespace.nspname = current_schema()
      AND table_row.relname = :tableName`, { replacements: { tableName: table.table }, transaction });
  if (checkConstraints.length) {
    throw new Error(`Runtime table ${table.table} has unexpected check constraints: ${checkConstraints.map((constraint) => constraint.name).join(', ')}.`);
  }

  return { missingIndexes: [], missingTrigramIndexes: [] };
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
    for (const index of expectedIndexes(table).filter((item) =>
      !item.primaryKey && !item.attributeUnique && !item.operatorClasses?.includes('gin_trgm_ops'))) {
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
 * written after deployment; the runner removes only the migration record.
 * A subsequent up revalidates the retained schema before marking it applied.
 */
export const down = async () => {};
export const version = '20261111_add_runtime_model_schema';
