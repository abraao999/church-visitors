import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REQUEST_ID_UNIQUE_INDEX,
  requestIdIndexNeedsReplacement,
} from './requestIdIndex.js';

test('índice de requestId usa filtro parcial em string, não sparse', () => {
  assert.equal(REQUEST_ID_UNIQUE_INDEX.unique, true);
  assert.equal(REQUEST_ID_UNIQUE_INDEX.partialFilterExpression.requestId.$type, 'string');
  assert.equal(requestIdIndexNeedsReplacement({ unique: true, sparse: true }), true);
  assert.equal(
    requestIdIndexNeedsReplacement({
      unique: true,
      partialFilterExpression: { requestId: { $type: 'string' } },
    }),
    false
  );
  assert.equal(requestIdIndexNeedsReplacement(undefined), false);
});
