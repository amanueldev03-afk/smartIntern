import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { migrationQueryInterface } from '../db/migrationQueryInterface.js';
import { databaseErrorResponse, isRetryableTransactionError } from '../src/utils/transactions.js';

describe('Task 1.18 transaction utilities', () => {
  it('attaches the owning transaction to migration DDL options', async () => {
    const calls = [];
    const transaction = { id: 'test-transaction' };
    const queryInterface = new Proxy({}, {
      get: (_target, method) => (...args) => calls.push({ method, args }),
    });
    const bound = migrationQueryInterface({ getQueryInterface: () => queryInterface }, transaction);

    await bound.createTable('items', { id: {} });
    await bound.addConstraint('items', { type: 'unique', fields: ['id'] });
    await bound.addIndex('items', ['id'], { name: 'items_id_idx' });
    await bound.removeIndex('items', 'items_id_idx');
    await bound.dropTable('items');

    assert.equal(calls.length, 5);
    assert.deepEqual(calls.map(({ args }) => args.at(-1).transaction), Array(5).fill(transaction));
    assert.deepEqual(calls[1].args[1].fields, ['id']);
    assert.equal(calls[2].args[2].name, 'items_id_idx');
  });

  it('retries only recognized PostgreSQL transaction errors', () => {
    assert.equal(isRetryableTransactionError({ original: { code: '40P01' } }), true);
    assert.equal(isRetryableTransactionError({ parent: { code: '40001' } }), true);
    assert.equal(isRetryableTransactionError({ original: { code: '23505' } }), false);
    assert.equal(isRetryableTransactionError(new Error('connection lost')), false);
  });

  it('maps database constraint errors to safe client responses', () => {
    assert.deepEqual(databaseErrorResponse({ original: { code: '23505' } }), {
      status: 409,
      detail: 'A record with these details already exists.',
    });
    assert.equal(databaseErrorResponse({ original: { code: '08006' }, message: 'secret detail' }).detail,
      'A database operation could not be completed.');
  });
});
