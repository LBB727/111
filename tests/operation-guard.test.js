const test = require('node:test');
const assert = require('node:assert/strict');
const { createOperationGuard } = require('../apps/miniprogram/utils/operation-guard');

test('a begun operation token is current', () => {
  const guard = createOperationGuard();
  const token = guard.begin();

  assert.equal(guard.isCurrent(token), true);
});

test('invalidating the guard makes the active token stale', () => {
  const guard = createOperationGuard();
  const token = guard.begin();

  guard.invalidate();

  assert.equal(guard.isCurrent(token), false);
});

test('starting a newer operation makes the older token stale', () => {
  const guard = createOperationGuard();
  const older = guard.begin();
  const newer = guard.begin();

  assert.equal(guard.isCurrent(older), false);
  assert.equal(guard.isCurrent(newer), true);
});
