import { Transaction } from 'sequelize';
import sequelize from '../config/database.js';

const RETRYABLE_SQLSTATES = new Set(['40P01', '40001', '55P03']);
const MAX_TRANSACTION_ATTEMPTS = 3;

export const isRetryableTransactionError = (error) => {
  const code = error?.original?.code || error?.parent?.code || error?.code;
  return RETRYABLE_SQLSTATES.has(code);
};

/**
 * Run only database-only, repeatable work in a managed transaction. Retries
 * deadlocks, serialization failures, and lock-not-available errors at most
 * twice after the first attempt. External effects must happen after commit.
 */
export async function withTransaction(work, { isolationLevel } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await sequelize.transaction({
        ...(isolationLevel ? { isolationLevel } : {}),
      }, (transaction) => work(transaction));
    } catch (error) {
      if (attempt >= MAX_TRANSACTION_ATTEMPTS || !isRetryableTransactionError(error)) {
        throw error;
      }

      const delayMs = (25 * (2 ** (attempt - 1))) + Math.floor(Math.random() * 25);
      console.warn('[Database] Retrying transient transaction failure', {
        code: error?.original?.code || error?.parent?.code || error?.code,
        attempt,
        delayMs,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export const TRANSACTION_ISOLATION = Transaction.ISOLATION_LEVELS;

/** Map known persistence errors to safe, stable HTTP responses. */
export function databaseErrorResponse(error) {
  const code = error?.original?.code || error?.parent?.code;

  if (error?.name === 'SequelizeUniqueConstraintError' || code === '23505') {
    return { status: 409, detail: 'A record with these details already exists.' };
  }
  if (error?.name === 'SequelizeForeignKeyConstraintError' || code === '23503') {
    return { status: 409, detail: 'This operation conflicts with related records.' };
  }
  if (error?.name === 'SequelizeValidationError' || code === '23502' || code === '22P02') {
    return { status: 400, detail: 'The submitted data is invalid.' };
  }
  if (isRetryableTransactionError(error)) {
    return { status: 409, detail: 'The record changed concurrently. Please retry the request.' };
  }
  return { status: 500, detail: 'A database operation could not be completed.' };
}
