import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend directory or project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Server & Core
export const PORT = process.env.PORT || 8000;
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const DEBUG = process.env.DEBUG === 'true' || process.env.DEBUG === 'True' || true;
export const SITE_BASE_URL = process.env.SITE_BASE_URL || 'http://localhost:8000';
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
export const MEDIA_ROOT = path.resolve(__dirname, '../../media');

// Database & Caching
export const DATABASE_URL = process.env.DATABASE_URL || '';
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/0';

// JWT Authentication
export const JWT_SECRET = process.env.JWT_SECRET || process.env.SECRET_KEY || 'smartintern-secret-key-development';
export const JWT_ACCESS_EXPIRATION = process.env.JWT_ACCESS_EXPIRATION || '2h';
export const JWT_REFRESH_EXPIRATION = process.env.JWT_REFRESH_EXPIRATION || '7d';

// Email SMTP Settings
export const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
export const EMAIL_PORT = parseInt(process.env.EMAIL_PORT, 10) || 465;
export const EMAIL_HOST_USER = process.env.EMAIL_HOST_USER || '';
export const EMAIL_HOST_PASSWORD = process.env.EMAIL_HOST_PASSWORD || '';
export const EMAIL_USE_SSL = process.env.EMAIL_USE_SSL === 'true' || process.env.EMAIL_USE_SSL === 'True';
export const DEFAULT_FROM_EMAIL = process.env.DEFAULT_FROM_EMAIL || 'noreply@smartintern.edu.et';

// Google OAuth
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
export const FRONTEND_OAUTH_CALLBACK_URL = process.env.FRONTEND_OAUTH_CALLBACK_URL || 'http://localhost:5173/auth/callback';

// AI & Machine Learning
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const EMBEDDING_MODEL_NAME = process.env.EMBEDDING_MODEL_NAME || 'all-MiniLM-L6-v2';

// Object Storage / S3 / Backblaze
export const STORAGE_BACKEND = process.env.STORAGE_BACKEND || 'filesystem';
export const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
export const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
export const AWS_STORAGE_BUCKET_NAME = process.env.AWS_STORAGE_BUCKET_NAME || '';
export const AWS_S3_REGION_NAME = process.env.AWS_S3_REGION_NAME || 'us-west-005';
export const AWS_S3_ENDPOINT_URL = process.env.AWS_S3_ENDPOINT_URL || '';

// Low-Bandwidth Notifications (SMS & Telegram)
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
export const ETHIO_SMS_API_KEY = process.env.ETHIO_SMS_API_KEY || '';

export default {
  PORT,
  NODE_ENV,
  DEBUG,
  SITE_BASE_URL,
  FRONTEND_URL,
  MEDIA_ROOT,
  DATABASE_URL,
  REDIS_URL,
  JWT_SECRET,
  JWT_ACCESS_EXPIRATION,
  JWT_REFRESH_EXPIRATION,
  EMAIL_HOST,
  EMAIL_PORT,
  EMAIL_HOST_USER,
  EMAIL_HOST_PASSWORD,
  EMAIL_USE_SSL,
  DEFAULT_FROM_EMAIL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  FRONTEND_OAUTH_CALLBACK_URL,
  OPENAI_API_KEY,
  EMBEDDING_MODEL_NAME,
  STORAGE_BACKEND,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_STORAGE_BUCKET_NAME,
  AWS_S3_REGION_NAME,
  AWS_S3_ENDPOINT_URL,
  TELEGRAM_BOT_TOKEN,
  ETHIO_SMS_API_KEY,
};
