import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldOverrideAtlasDns } from './db.js';

test('o DNS do Atlas não muda sozinho, mesmo com mongodb+srv', () => {
  assert.equal(shouldOverrideAtlasDns('mongodb+srv://u:p@cluster.mongodb.net/db', {}), false);
});

test('override só liga com MONGODB_DNS_OVERRIDE=1 e URI srv', () => {
  assert.equal(
    shouldOverrideAtlasDns('mongodb+srv://u:p@cluster.mongodb.net/db', {
      MONGODB_DNS_OVERRIDE: '1',
    }),
    true
  );
  assert.equal(
    shouldOverrideAtlasDns('mongodb://localhost:27017/church-visitors', {
      MONGODB_DNS_OVERRIDE: '1',
    }),
    false
  );
});
