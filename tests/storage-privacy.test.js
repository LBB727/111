const test = require('node:test');
const assert = require('node:assert/strict');
const { createStorage } = require('../apps/miniprogram/services/storage');
const { createPrivacyService } = require('../apps/miniprogram/services/privacy');
const { STORAGE_KEYS } = require('../apps/miniprogram/config/storage-keys');
const {
  removeExpiredReport
} = require('../apps/miniprogram/services/report-state');

const createMemoryWxApi = (values = new Map()) => ({
  getStorageSync: (key) => values.get(key),
  setStorageSync: (key, value) => values.set(key, value),
  removeStorageSync: (key) => values.delete(key)
});

test('clearAll removes only application-owned keys', () => {
  const values = new Map(Object.values(STORAGE_KEYS).map((key) => [key, { saved: true }]));
  values.set('another-app', 'keep');
  const privacy = createPrivacyService(
    createStorage(createMemoryWxApi(values)),
    () => new Date('2026-07-28T00:00:00Z')
  );

  const result = privacy.clearAll();

  assert.deepEqual(result, { ok: true, failedKeys: [] });
  assert.equal(values.get('another-app'), 'keep');
  assert.ok(Object.values(STORAGE_KEYS).every((key) => !values.has(key)));
});

test('recordConsent stores the exact consent record without a photo path', () => {
  const values = new Map();
  const privacy = createPrivacyService(
    createStorage(createMemoryWxApi(values)),
    () => new Date('2026-07-28T00:00:00Z')
  );

  const result = privacy.recordConsent();

  assert.deepEqual(result, {
    ok: true,
    value: {
      version: 'demo-1.0',
      acceptedAt: '2026-07-28T00:00:00.000Z',
      adult: true,
      ownPhoto: true,
      photoProcessing: true
    }
  });
  assert.deepEqual(values.get(STORAGE_KEYS.CONSENT), result.value);
  assert.equal(Object.hasOwn(result.value, 'photoPath'), false);
});

test('get returns fallback for missing or empty storage values', () => {
  const values = new Map([
    ['missing-as-empty', ''],
    ['present', 0]
  ]);
  const storage = createStorage(createMemoryWxApi(values));

  assert.deepEqual(storage.get('not-stored', 'fallback'), { ok: true, value: 'fallback' });
  assert.deepEqual(storage.get('missing-as-empty', 'fallback'), { ok: true, value: 'fallback' });
  assert.deepEqual(storage.get('present', 'fallback'), { ok: true, value: 0 });
});

test('set reports storage write failures honestly', () => {
  const error = new Error('quota exceeded');
  const storage = createStorage({
    getStorageSync: () => undefined,
    setStorageSync: () => { throw error; },
    removeStorageSync: () => undefined
  });

  const result = storage.set(STORAGE_KEYS.REPORT, { id: 'report-1' });

  assert.equal(result.ok, false);
  assert.strictEqual(result.error, error);
});

test('clearAll reports every failed application-owned deletion', () => {
  const values = new Map(Object.values(STORAGE_KEYS).map((key) => [key, { saved: true }]));
  const failures = new Set([STORAGE_KEYS.REPORT, STORAGE_KEYS.FEEDBACK]);
  const privacy = createPrivacyService(createStorage({
    getStorageSync: (key) => values.get(key),
    setStorageSync: (key, value) => values.set(key, value),
    removeStorageSync: (key) => {
      if (failures.has(key)) throw new Error(`cannot remove ${key}`);
      values.delete(key);
    }
  }), () => new Date('2026-07-28T00:00:00Z'));

  const result = privacy.clearAll();

  assert.deepEqual(result, {
    ok: false,
    failedKeys: [STORAGE_KEYS.REPORT, STORAGE_KEYS.FEEDBACK]
  });
  assert.equal(values.has(STORAGE_KEYS.CONSENT), false);
  assert.equal(values.has(STORAGE_KEYS.FAVORITES), false);
  assert.equal(values.has(STORAGE_KEYS.REPORT), true);
  assert.equal(values.has(STORAGE_KEYS.FEEDBACK), true);
});

test('granular privacy clears remove only profile or feedback', () => {
  const values = new Map(Object.values(STORAGE_KEYS).map((key) => [
    key,
    { saved: true }
  ]));
  const privacy = createPrivacyService(
    createStorage(createMemoryWxApi(values)),
    () => new Date('2026-07-29T00:00:00Z')
  );

  assert.deepEqual(privacy.clearProfile(), { ok: true });
  assert.equal(values.has(STORAGE_KEYS.PROFILE), false);
  assert.equal(values.has(STORAGE_KEYS.REPORT), true);
  assert.equal(values.has(STORAGE_KEYS.FEEDBACK), true);

  assert.deepEqual(privacy.clearFeedback(), { ok: true, failedKeys: [] });
  assert.equal(values.has(STORAGE_KEYS.FEEDBACK), false);
  assert.equal(values.has(STORAGE_KEYS.REPORT), false);
});

test('clearFeedback removes feedback records and their old report while zeroing the persisted profile summary', () => {
  const profile = {
    schemaVersion: 2,
    id: 'profile-1',
    feedbackSummary: {
      likedRuleIds: ['rule-liked'],
      rejectedRuleIds: ['rule-rejected'],
      ownedRuleIds: ['rule-owned'],
      triedRuleIds: ['rule-tried'],
      suppressedFamilies: ['clothing']
    }
  };
  const report = { id: 'report-1' };
  const values = new Map([
    [STORAGE_KEYS.PROFILE, profile],
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.FEEDBACK, { 'recommendation-1': 'liked' }]
  ]);
  const privacy = createPrivacyService(
    createStorage(createMemoryWxApi(values)),
    () => new Date('2026-07-29T00:00:00Z')
  );

  const result = privacy.clearFeedback();

  assert.deepEqual(result, { ok: true, failedKeys: [] });
  assert.equal(values.has(STORAGE_KEYS.FEEDBACK), false);
  assert.equal(values.has(STORAGE_KEYS.REPORT), false);
  assert.deepEqual(values.get(STORAGE_KEYS.PROFILE), {
    schemaVersion: 2,
    id: 'profile-1',
    feedbackSummary: {
      likedRuleIds: [],
      rejectedRuleIds: [],
      ownedRuleIds: [],
      triedRuleIds: [],
      suppressedFamilies: []
    }
  });
});

test('clearFeedback reports the profile rewrite while still clearing feedback records and their report', () => {
  const writeError = new Error('profile write unavailable');
  const profile = {
    schemaVersion: 2,
    feedbackSummary: {
      likedRuleIds: ['rule-liked']
    }
  };
  const feedback = { 'recommendation-1': 'liked' };
  const values = new Map([
    [STORAGE_KEYS.PROFILE, profile],
    [STORAGE_KEYS.REPORT, { id: 'report-1' }],
    [STORAGE_KEYS.FEEDBACK, feedback]
  ]);
  const privacy = createPrivacyService(createStorage({
    getStorageSync: (key) => values.get(key),
    setStorageSync: () => {
      throw writeError;
    },
    removeStorageSync: (key) => {
      values.delete(key);
    }
  }), () => new Date('2026-07-29T00:00:00Z'));

  const result = privacy.clearFeedback();

  assert.equal(result.ok, false);
  assert.deepEqual(result.failedKeys, [STORAGE_KEYS.PROFILE]);
  assert.strictEqual(values.get(STORAGE_KEYS.PROFILE), profile);
  assert.equal(values.has(STORAGE_KEYS.REPORT), false);
  assert.equal(values.has(STORAGE_KEYS.FEEDBACK), false);
});

test('clearFeedback reports a delete failure after persisting the zeroed profile summary', () => {
  const removeError = new Error('feedback delete unavailable');
  const profile = {
    schemaVersion: 2,
    feedbackSummary: {
      likedRuleIds: ['rule-liked']
    }
  };
  const feedback = { 'recommendation-1': 'liked' };
  const values = new Map([
    [STORAGE_KEYS.PROFILE, profile],
    [STORAGE_KEYS.REPORT, { id: 'report-1' }],
    [STORAGE_KEYS.FEEDBACK, feedback]
  ]);
  const privacy = createPrivacyService(createStorage({
    getStorageSync: (key) => values.get(key),
    setStorageSync: (key, value) => values.set(key, value),
    removeStorageSync: (key) => {
      if (key === STORAGE_KEYS.FEEDBACK) throw removeError;
      values.delete(key);
    }
  }), () => new Date('2026-07-29T00:00:00Z'));

  const result = privacy.clearFeedback();

  assert.equal(result.ok, false);
  assert.deepEqual(result.failedKeys, [STORAGE_KEYS.FEEDBACK]);
  assert.deepEqual(values.get(STORAGE_KEYS.PROFILE).feedbackSummary, {
    likedRuleIds: [],
    rejectedRuleIds: [],
    ownedRuleIds: [],
    triedRuleIds: [],
    suppressedFamilies: []
  });
  assert.equal(values.has(STORAGE_KEYS.REPORT), false);
  assert.strictEqual(values.get(STORAGE_KEYS.FEEDBACK), feedback);
});

test('clearFeedback reports an old-report deletion failure while clearing the other feedback layers', () => {
  const reportError = new Error('report delete unavailable');
  const profile = {
    schemaVersion: 2,
    feedbackSummary: {
      likedRuleIds: ['rule-liked']
    }
  };
  const report = { id: 'report-1' };
  const values = new Map([
    [STORAGE_KEYS.PROFILE, profile],
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.FEEDBACK, { 'recommendation-1': 'liked' }]
  ]);
  const privacy = createPrivacyService(createStorage({
    getStorageSync: (key) => values.get(key),
    setStorageSync: (key, value) => values.set(key, value),
    removeStorageSync: (key) => {
      if (key === STORAGE_KEYS.REPORT) throw reportError;
      values.delete(key);
    }
  }), () => new Date('2026-07-29T00:00:00Z'));

  const result = privacy.clearFeedback();

  assert.equal(result.ok, false);
  assert.deepEqual(result.failedKeys, [STORAGE_KEYS.REPORT]);
  assert.deepEqual(values.get(STORAGE_KEYS.PROFILE).feedbackSummary, {
    likedRuleIds: [],
    rejectedRuleIds: [],
    ownedRuleIds: [],
    triedRuleIds: [],
    suppressedFamilies: []
  });
  assert.strictEqual(values.get(STORAGE_KEYS.REPORT), report);
  assert.equal(values.has(STORAGE_KEYS.FEEDBACK), false);
});

test('removeExpiredReport removes a report only after every applied trend is stale', () => {
  const expired = {
    id: 'report-expired',
    trendMeta: {
      enabled: true,
      appliedRuleIds: ['trend-a', 'trend-b'],
      validUntil: '2026-07-28'
    }
  };
  const stable = {
    id: 'report-stable',
    trendMeta: {
      enabled: false,
      appliedRuleIds: [],
      validUntil: null
    }
  };
  const values = new Map([[STORAGE_KEYS.REPORT, expired]]);
  const storage = createStorage(createMemoryWxApi(values));

  assert.deepEqual(
    removeExpiredReport(storage, '2026-07-29T00:00:00.000Z'),
    { expired: true, removed: true }
  );
  assert.equal(values.has(STORAGE_KEYS.REPORT), false);

  values.set(STORAGE_KEYS.REPORT, stable);
  assert.deepEqual(
    removeExpiredReport(storage, '2030-01-01T00:00:00.000Z'),
    { expired: false, removed: false }
  );
  assert.strictEqual(values.get(STORAGE_KEYS.REPORT), stable);
});

test('removeExpiredReport preserves active trends and reports failed deletion honestly', () => {
  const active = {
    trendMeta: {
      enabled: true,
      appliedRuleIds: ['trend-a'],
      validUntil: '2027-02-08'
    }
  };
  const values = new Map([[STORAGE_KEYS.REPORT, active]]);
  const storage = createStorage(createMemoryWxApi(values));

  assert.deepEqual(
    removeExpiredReport(storage, '2027-02-08T00:00:00.000Z'),
    { expired: false, removed: false }
  );
  assert.strictEqual(values.get(STORAGE_KEYS.REPORT), active);

  const failingStorage = {
    get() {
      return {
        ok: true,
        value: {
          trendMeta: {
            enabled: true,
            appliedRuleIds: ['trend-a'],
            validUntil: '2026-01-01'
          }
        }
      };
    },
    remove() {
      return { ok: false, error: new Error('unavailable') };
    }
  };
  assert.deepEqual(
    removeExpiredReport(failingStorage, '2026-07-29T00:00:00.000Z'),
    { expired: true, removed: false }
  );
});
