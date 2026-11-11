import { Sequelize } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';
import { DATABASE_URL } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sequelize;

const task118TestSchema = process.env.TASK_1_18_TEST_SCHEMA || '';
if (task118TestSchema) {
  if (!/^task_1_18_test_[a-f0-9]{32}$/.test(task118TestSchema)) {
    throw new Error('Invalid Task 1.18 test schema identifier.');
  }
  const databaseUrl = new URL(DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)
      || decodeURIComponent(databaseUrl.pathname.slice(1)) !== 'ai_internship') {
    throw new Error('Task 1.18 schema tests require the configured database ai_internship.');
  }
}

if (DATABASE_URL && (DATABASE_URL.startsWith('postgres://') || DATABASE_URL.startsWith('postgresql://'))) {
  sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    ...(task118TestSchema ? {
      define: { schema: task118TestSchema },
      hooks: {
        afterConnect: async (connection) => {
          const databaseResult = await connection.query('SELECT current_database() AS name');
          if (databaseResult.rows[0].name !== 'ai_internship') {
            throw new Error('Task 1.18 test connection is not using ai_internship.');
          }
          await connection.query(`SET search_path TO "${task118TestSchema}"`);
          const schemaResult = await connection.query('SELECT current_schema() AS name');
          if (schemaResult.rows[0].name !== task118TestSchema) {
            throw new Error('Task 1.18 test connection did not enter its isolated schema.');
          }
        },
      },
    } : {}),
    dialectOptions: {
      ssl: process.env.DB_SSL === 'true' ? { require: true, rejectUnauthorized: false } : false
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });
} else {
  const sqlitePath = path.resolve(__dirname, '../../db.sqlite3');
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: sqlitePath,
    logging: false,
  });
}

export const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log(`[Database] Connected successfully (${sequelize.getDialect()}).`);
  } catch (error) {
    console.error('[Database] Connection failed:', error);
    throw error;
  }
};

export default sequelize;
