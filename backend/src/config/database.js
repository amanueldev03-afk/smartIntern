import { Sequelize } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';
import { DATABASE_URL } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sequelize;

if (DATABASE_URL && (DATABASE_URL.startsWith('postgres://') || DATABASE_URL.startsWith('postgresql://'))) {
  sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
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
