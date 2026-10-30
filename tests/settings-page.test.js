const test = require('node:test');
const assert = require('node:assert/strict');
const { STORAGE_KEYS } = require('../apps/miniprogram/config/storage-keys');
const {
  getDemoReport,
  DEMO_PROFILE
} = require('../apps/miniprogram/data/demo-report');
const { createPageHarness } = require('./helpers/miniprogram-harness');

function createSession() {
  return {
    analysisMode: 'photo',
    profileDraft: { presentationMode: 'neutral', scenes: ['commute'] },
    photoKind: 'portrait',
    photoPath: 'wxfile://local.jpg',
    photoMeta: { width: 1080, height: 1440 },
    qualityResult: { passed: true },
    appearanceCandidates: { line: 'soft' },
    features: { line: 'balanced' },
    preferences: { scene: 'commute' },
    profile: { schemaVersion: 2, id: 'profile-1' },
    report: { id: 'report-1' }
  };
}

function createSettingsHarness(options = {}) {
  const values = options.values || new Map([
    [STORAGE_KEYS.CONSENT, { acceptedAt: '2026-07-28T00:00:00.000Z' }],
    [STORAGE_KEYS.PROFILE, { schemaVersion: 2, id: 'profile-1' }],
    [STORAGE_KEYS.REPORT, { id: 'report-1' }],
    [STORAGE_KEYS.FAVORITES, ['color-1']],
    [STORAGE_KEYS.FEEDBACK, { 'color-1': 'tried' }],
    ['another-app', 'keep']
  ]);
  const failedKeys = options.failedKeys || new Set();
  const failedWriteKeys = options.failedWriteKeys || new Set();
  const removed = [];
  const toasts = [];
  const modals = [];
  const relaunches = [];
  const session = options.session || createSession();
  let resetCount = 0;

  const wxApi = {
    getStorageSync(key) {
      return values.get(key);
    },
    setStorageSync(key, value) {
      if (failedWriteKeys.has(key)) throw new Error(`cannot write ${key}`);
      values.set(key, value);
    },
    removeStorageSync(key) {
      removed.push(key);
      if (failedKeys.has(key)) throw new Error(`cannot remove ${key}`);
      values.delete(key);
    },
    showToast(options) {
      toasts.push(options);
    },
    showModal(modalOptions) {
      modals.push(modalOptions);
      if (options.showModalThrows) throw new Error('showModal unavailable');
    },
    reLaunch(options) {
      relaunches.push(options);
    }
  };
  const app = {
    globalData: { session },
    resetSession() {
      resetCount += 1;
      this.globalData.session = {
        photoPath: '',
        photoMeta: null,
        qualityResult: null,
        features: null,
        preferences: null,
        report: null
      };
    }
  };
  const harness = createPageHarness('settings', { app, wxApi });
  harness.page.onLoad();

  return {
    ...harness,
    values,
    failedKeys,
    failedWriteKeys,
    removed,
    toasts,
    modals,
    relaunches,
    get resetCount() {
      return resetCount;
    }
  };
}

function createResultReconciliationHarness() {
  const report = getDemoReport();
  const favoriteId = report.sections.clothing[0].id;
  const otherFavoriteId = report.sections.hair[0].id;
  const values = new Map([
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.FAVORITES, [favoriteId, otherFavoriteId]],
    [STORAGE_KEYS.FEEDBACK, {
      [favoriteId]: {
        recommendationId: favoriteId,
        family: 'clothing',
        state: 'tried',
        updatedAt: '2026-07-29T00:00:00.000Z'
      }
    }]
  ]);
  const readFailures = new Set();
  const writes = [];
  const toasts = [];
  const app = {
    globalData: { session: { report } },
    resetSession() {}
  };
  const harness = createPageHarness('result', {
    app,
    wxApi: {
      getStorageSync(key) {
        if (readFailures.has(key)) throw new Error(`cannot read ${key}`);
        return values.get(key);
      },
      setStorageSync(key, value) {
        writes.push({ key, value });
        values.set(key, value);
      },
      removeStorageSync(key) {
        values.delete(key);
      },
      navigateTo() {},
      reLaunch() {},
      showToast(options) {
        toasts.push(options);
      }
    }
  });
  harness.page.onLoad();

  return {
    ...harness,
    report,
    favoriteId,
    otherFavoriteId,
    values,
    readFailures,
    writes,
    toasts
  };
}

function returnFromSettings(harness) {
  harness.page.onOpenSettings();
  harness.page.onShow();
}

function confirmLatestModal(harness) {
  const modal = harness.modals.at(-1);
  harness.invoke(() => modal.success({ confirm: true, cancel: false }));
}

test('clearing the current photo preserves confirmed features, preferences, report, and persistent data', () => {
  const harness = createSettingsHarness();
  const before = harness.app.globalData.session;

  harness.page.onClearPhoto();
  confirmLatestModal(harness);

  assert.notStrictEqual(harness.app.globalData.session, before);
  assert.deepEqual(harness.app.globalData.session, {
    analysisMode: 'photo',
    profileDraft: { presentationMode: 'neutral', scenes: ['commute'] },
    photoKind: '',
    photoPath: '',
    photoMeta: null,
    qualityResult: null,
    appearanceCandidates: null,
    features: { line: 'balanced' },
    preferences: { scene: 'commute' },
    profile: { schemaVersion: 2, id: 'profile-1' },
    report: { id: 'report-1' }
  });
  assert.equal(harness.removed.length, 0);
  assert.deepEqual(harness.toasts, [{ title: '当前照片已清除', icon: 'success' }]);
});

test('a valid session report wins over an expired stored fallback', () => {
  const sessionReport = getDemoReport();
  const storedReport = structuredClone(sessionReport);
  storedReport.id = 'expired-stored-report';
  storedReport.trendMeta = {
    enabled: true,
    appliedRuleIds: ['trend-old'],
    validUntil: '2025-12-31'
  };
  const values = new Map([
    [STORAGE_KEYS.REPORT, storedReport],
    [STORAGE_KEYS.FAVORITES, []],
    [STORAGE_KEYS.FEEDBACK, {}]
  ]);
  const removed = [];
  const modals = [];
  const app = {
    globalData: { session: { report: sessionReport } },
    resetSession() {}
  };
  const harness = createPageHarness('result', {
    app,
    wxApi: {
      getStorageSync(key) {
        return values.get(key);
      },
      setStorageSync(key, value) {
        values.set(key, value);
      },
      removeStorageSync(key) {
        removed.push(key);
        values.delete(key);
      },
      showModal(options) {
        modals.push(options);
      },
      reLaunch() {},
      showToast() {}
    }
  });

  harness.page.onLoad();

  assert.strictEqual(harness.page.data.report, sessionReport);
  assert.strictEqual(app.globalData.session.report, sessionReport);
  assert.strictEqual(values.get(STORAGE_KEYS.REPORT), storedReport);
  assert.deepEqual(removed, []);
  assert.deepEqual(modals, []);
});

test('report deletion clears the session report only after persistent deletion succeeds', () => {
  const success = createSettingsHarness();

  success.page.onClearReport();
  confirmLatestModal(success);

  assert.equal(success.values.has(STORAGE_KEYS.REPORT), false);
  assert.equal(success.app.globalData.session.report, null);
  assert.deepEqual(success.toasts, [{ title: '报告已清除', icon: 'success' }]);

  const failure = createSettingsHarness({
    failedKeys: new Set([STORAGE_KEYS.REPORT])
  });
  const reportBefore = failure.app.globalData.session.report;

  failure.page.onClearReport();
  confirmLatestModal(failure);

  assert.equal(failure.values.has(STORAGE_KEYS.REPORT), true);
  assert.strictEqual(failure.app.globalData.session.report, reportBefore);
  assert.deepEqual(failure.toasts, [{ title: '报告删除失败，请重试', icon: 'none' }]);
});

test('favorites deletion reports the actual persistent outcome', () => {
  const success = createSettingsHarness();

  success.page.onClearFavorites();
  confirmLatestModal(success);

  assert.equal(success.values.has(STORAGE_KEYS.FAVORITES), false);
  assert.deepEqual(success.toasts, [{ title: '收藏已清除', icon: 'success' }]);

  const failure = createSettingsHarness({
    failedKeys: new Set([STORAGE_KEYS.FAVORITES])
  });

  failure.page.onClearFavorites();
  confirmLatestModal(failure);

  assert.equal(failure.values.has(STORAGE_KEYS.FAVORITES), true);
  assert.deepEqual(failure.toasts, [{ title: '收藏删除失败，请重试', icon: 'none' }]);
});

test('every granular destructive action can be cancelled without mutation', () => {
  for (const handler of [
    'onClearPhoto',
    'onClearProfile',
    'onClearReport',
    'onClearFavorites',
    'onClearFeedback'
  ]) {
    const harness = createSettingsHarness();
    const sessionBefore = structuredClone(harness.app.globalData.session);
    const valuesBefore = structuredClone([...harness.values.entries()]);

    harness.page[handler]();
    assert.equal(harness.modals.length, 1, handler);
    harness.invoke(() => harness.modals[0].success({
      confirm: false,
      cancel: true
    }));

    assert.deepEqual(harness.app.globalData.session, sessionBefore, handler);
    assert.deepEqual([...harness.values.entries()], valuesBefore, handler);
    assert.equal(harness.removed.length, 0, handler);
    assert.deepEqual(harness.toasts, [], handler);
  }
});

test('profile clearing preserves feedback while feedback clearing removes its derived report', () => {
  const profile = createSettingsHarness({
    session: {
      ...createSession(),
      preferencesDraft: {
        stylingTimeMinutes: 20,
        stylePreferences: ['newChinese']
      },
      preferencesDraftContext: {
        fitPreference: { present: false, value: null },
        manualMeasurements: { present: false, value: null }
      }
    }
  });
  const profileSessionBefore = structuredClone(profile.app.globalData.session);
  profile.page.onClearProfile();
  profile.invoke(() => profile.modals[0].success({
    confirm: true,
    cancel: false
  }));

  assert.equal(profile.values.has(STORAGE_KEYS.PROFILE), false);
  assert.equal(profile.values.has(STORAGE_KEYS.REPORT), true);
  assert.equal(profile.values.has(STORAGE_KEYS.FEEDBACK), true);
  assert.equal(profile.app.globalData.session.profileDraft, null);
  assert.equal(profile.app.globalData.session.features, null);
  assert.equal(profile.app.globalData.session.preferences, null);
  assert.equal(profile.app.globalData.session.profile, null);
  assert.equal(
    Object.hasOwn(profile.app.globalData.session, 'preferencesDraft'),
    false
  );
  assert.equal(
    Object.hasOwn(profile.app.globalData.session, 'preferencesDraftContext'),
    false
  );
  assert.equal(
    profile.app.globalData.session.photoPath,
    profileSessionBefore.photoPath
  );
  assert.deepEqual(
    profile.app.globalData.session.report,
    profileSessionBefore.report
  );

  const feedback = createSettingsHarness();
  const feedbackSessionBefore = feedback.app.globalData.session;
  feedback.page.onClearFeedback();
  feedback.invoke(() => feedback.modals[0].success({
    confirm: true,
    cancel: false
  }));

  assert.equal(feedback.values.has(STORAGE_KEYS.FEEDBACK), false);
  assert.equal(feedback.values.has(STORAGE_KEYS.PROFILE), true);
  assert.equal(feedback.values.has(STORAGE_KEYS.REPORT), false);
  assert.deepEqual(feedback.app.globalData.session, {
    ...feedbackSessionBefore,
    profile: {
      ...feedbackSessionBefore.profile,
      feedbackSummary: {
        likedRuleIds: [],
        rejectedRuleIds: [],
        ownedRuleIds: [],
        triedRuleIds: [],
        suppressedFamilies: []
      }
    },
    report: null
  });
});

test('feedback confirmation zeroes persisted and in-memory derived feedback summaries', () => {
  const staleSummary = {
    likedRuleIds: ['rule-liked'],
    rejectedRuleIds: ['rule-rejected'],
    ownedRuleIds: ['rule-owned'],
    triedRuleIds: ['rule-tried'],
    suppressedFamilies: ['clothing']
  };
  const emptySummary = {
    likedRuleIds: [],
    rejectedRuleIds: [],
    ownedRuleIds: [],
    triedRuleIds: [],
    suppressedFamilies: []
  };
  const storedProfile = {
    schemaVersion: 2,
    id: 'profile-1',
    scenes: ['commute'],
    feedbackSummary: structuredClone(staleSummary)
  };
  const session = {
    ...createSession(),
    profile: structuredClone(storedProfile),
    pendingRegeneration: {
      kind: 'local-feedback-regeneration-v1',
      profile: {
        schemaVersion: 2,
        id: 'pending-profile',
        feedbackSummary: structuredClone(staleSummary)
      }
    }
  };
  const reportBefore = session.report;
  const values = new Map([
    [STORAGE_KEYS.PROFILE, storedProfile],
    [STORAGE_KEYS.REPORT, { id: 'report-1' }],
    [STORAGE_KEYS.FEEDBACK, { 'recommendation-1': 'liked' }]
  ]);
  const harness = createSettingsHarness({ values, session });

  harness.page.onClearFeedback();
  confirmLatestModal(harness);

  assert.equal(values.has(STORAGE_KEYS.FEEDBACK), false);
  assert.equal(values.has(STORAGE_KEYS.REPORT), false);
  assert.deepEqual(
    values.get(STORAGE_KEYS.PROFILE).feedbackSummary,
    emptySummary
  );
  assert.deepEqual(values.get(STORAGE_KEYS.PROFILE).scenes, ['commute']);
  assert.deepEqual(
    harness.app.globalData.session.profile.feedbackSummary,
    emptySummary
  );
  assert.deepEqual(
    harness.app.globalData.session.pendingRegeneration.profile.feedbackSummary,
    emptySummary
  );
  assert.equal(harness.app.globalData.session.report, null);
  assert.notEqual(reportBefore, null);
  assert.deepEqual(harness.toasts, [{
    title: '反馈及旧报告已清除',
    icon: 'success'
  }]);
});

test('feedback confirmation reconciles partial writes and lists every remaining category', () => {
  const staleSummary = {
    likedRuleIds: ['rule-liked'],
    rejectedRuleIds: [],
    ownedRuleIds: [],
    triedRuleIds: [],
    suppressedFamilies: []
  };
  const scenarios = [
    {
      name: 'profile write',
      options: { failedWriteKeys: new Set([STORAGE_KEYS.PROFILE]) },
      profileSummary: staleSummary,
      reportStored: false,
      feedbackStored: false,
      sessionProfileSummary: staleSummary,
      sessionReportStored: false,
      message: '未完全清除：档案中的反馈影响，请重试'
    },
    {
      name: 'report delete',
      options: { failedKeys: new Set([STORAGE_KEYS.REPORT]) },
      profileSummary: {
        likedRuleIds: [],
        rejectedRuleIds: [],
        ownedRuleIds: [],
        triedRuleIds: [],
        suppressedFamilies: []
      },
      reportStored: true,
      feedbackStored: false,
      sessionProfileSummary: {
        likedRuleIds: [],
        rejectedRuleIds: [],
        ownedRuleIds: [],
        triedRuleIds: [],
        suppressedFamilies: []
      },
      sessionReportStored: true,
      message: '未完全清除：旧报告，请重试'
    },
    {
      name: 'feedback delete',
      options: { failedKeys: new Set([STORAGE_KEYS.FEEDBACK]) },
      profileSummary: {
        likedRuleIds: [],
        rejectedRuleIds: [],
        ownedRuleIds: [],
        triedRuleIds: [],
        suppressedFamilies: []
      },
      reportStored: false,
      feedbackStored: true,
      sessionProfileSummary: {
        likedRuleIds: [],
        rejectedRuleIds: [],
        ownedRuleIds: [],
        triedRuleIds: [],
        suppressedFamilies: []
      },
      sessionReportStored: false,
      message: '未完全清除：反馈记录，请重试'
    },
    {
      name: 'all feedback layers',
      options: {
        failedWriteKeys: new Set([STORAGE_KEYS.PROFILE]),
        failedKeys: new Set([
          STORAGE_KEYS.REPORT,
          STORAGE_KEYS.FEEDBACK
        ])
      },
      profileSummary: staleSummary,
      reportStored: true,
      feedbackStored: true,
      sessionProfileSummary: staleSummary,
      sessionReportStored: true,
      message: '未完全清除：档案中的反馈影响、旧报告、反馈记录，请重试'
    }
  ];

  for (const scenario of scenarios) {
    const profile = {
      schemaVersion: 2,
      id: 'profile-1',
      feedbackSummary: structuredClone(staleSummary)
    };
    const session = {
      ...createSession(),
      profile: structuredClone(profile),
      pendingRegeneration: {
        kind: 'local-feedback-regeneration-v1',
        profile: structuredClone(profile)
      }
    };
    const values = new Map([
      [STORAGE_KEYS.PROFILE, profile],
      [STORAGE_KEYS.REPORT, session.report],
      [STORAGE_KEYS.FEEDBACK, { 'recommendation-1': 'liked' }]
    ]);
    const harness = createSettingsHarness({
      ...scenario.options,
      values,
      session
    });

    harness.page.onClearFeedback();
    confirmLatestModal(harness);

    assert.equal(
      values.has(STORAGE_KEYS.FEEDBACK),
      scenario.feedbackStored,
      scenario.name
    );
    assert.equal(
      values.has(STORAGE_KEYS.REPORT),
      scenario.reportStored,
      scenario.name
    );
    assert.deepEqual(
      values.get(STORAGE_KEYS.PROFILE).feedbackSummary,
      scenario.profileSummary,
      scenario.name
    );
    assert.deepEqual(
      harness.app.globalData.session.profile.feedbackSummary,
      scenario.sessionProfileSummary,
      scenario.name
    );
    assert.deepEqual(
      harness.app.globalData.session.pendingRegeneration.profile.feedbackSummary,
      scenario.sessionProfileSummary,
      scenario.name
    );
    assert.equal(
      harness.app.globalData.session.report !== null,
      scenario.sessionReportStored,
      scenario.name
    );
    assert.deepEqual(harness.toasts, [{
      title: scenario.message,
      icon: 'none'
    }], scenario.name);
  }
});

test('granular deletion callbacks become inert after settings unload', () => {
  for (const handler of [
    'onClearPhoto',
    'onClearProfile',
    'onClearReport',
    'onClearFavorites',
    'onClearFeedback'
  ]) {
    const harness = createSettingsHarness();
    const sessionBefore = structuredClone(harness.app.globalData.session);
    const valuesBefore = structuredClone([...harness.values.entries()]);

    harness.page[handler]();
    harness.page.onUnload();
    harness.invoke(() => harness.modals[0].success({
      confirm: true,
      cancel: false
    }));

    assert.deepEqual(harness.app.globalData.session, sessionBefore, handler);
    assert.deepEqual([...harness.values.entries()], valuesBefore, handler);
    assert.equal(harness.removed.length, 0, handler);
    assert.deepEqual(harness.toasts, [], handler);
  }
});

test('full deletion ignores a second tap and cancellation leaves all state untouched', () => {
  const harness = createSettingsHarness();
  const sessionBefore = harness.app.globalData.session;

  harness.page.onClearAll();
  harness.page.onClearAll();

  assert.equal(harness.modals.length, 1);
  assert.equal(harness.page.data.deletingAll, true);
  harness.invoke(() => harness.modals[0].success({ confirm: false, cancel: true }));

  assert.strictEqual(harness.app.globalData.session, sessionBefore);
  assert.equal(harness.resetCount, 0);
  assert.equal(harness.removed.length, 0);
  assert.equal(harness.relaunches.length, 0);
  assert.deepEqual(harness.toasts, []);
  assert.equal(harness.page.data.deletingAll, false);
});

test('modal failure reports the failure and permits a retry without deleting data', () => {
  const harness = createSettingsHarness();

  harness.page.onClearAll();
  harness.invoke(() => harness.modals[0].fail(new Error('modal unavailable')));

  assert.equal(harness.resetCount, 0);
  assert.equal(harness.removed.length, 0);
  assert.equal(harness.relaunches.length, 0);
  assert.deepEqual(harness.toasts, [{
    title: '暂时无法确认，请重试',
    icon: 'none'
  }]);
  assert.equal(harness.page.data.deletingAll, false);

  harness.page.onClearAll();
  assert.equal(harness.modals.length, 2);
});

test('synchronous modal throw unlocks full deletion and permits a retry', () => {
  const harness = createSettingsHarness({ showModalThrows: true });

  assert.doesNotThrow(() => harness.page.onClearAll());

  assert.equal(harness.page.data.deletingAll, false);
  assert.equal(harness.resetCount, 0);
  assert.equal(harness.removed.length, 0);
  assert.equal(harness.relaunches.length, 0);
  assert.deepEqual(harness.toasts, [{
    title: '暂时无法确认，请重试',
    icon: 'none'
  }]);

  assert.doesNotThrow(() => harness.page.onClearAll());
  assert.equal(harness.modals.length, 2);
});

test('partial full-deletion failure revokes the session but still reports the remaining category', () => {
  const harness = createSettingsHarness({
    failedKeys: new Set([STORAGE_KEYS.FEEDBACK])
  });

  harness.page.onClearAll();
  harness.invoke(() => harness.modals[0].success({ confirm: true, cancel: false }));

  assert.equal(harness.values.has(STORAGE_KEYS.FEEDBACK), true);
  assert.equal(harness.values.get('another-app'), 'keep');
  assert.deepEqual(harness.app.globalData.session, {
    photoPath: '',
    photoMeta: null,
    qualityResult: null,
    features: null,
    preferences: null,
    report: null
  });
  assert.equal(harness.resetCount, 1);
  assert.equal(harness.relaunches.length, 1);
  assert.equal(harness.relaunches[0].url, '/pages/consent/index');
  assert.deepEqual(harness.toasts, [{
    title: '删除失败：反馈，请重试',
    icon: 'none'
  }]);
  assert.equal(harness.page.data.deletingAll, false);
});

test('partial full-deletion failure lists every category that remains', () => {
  const harness = createSettingsHarness({
    failedKeys: new Set([
      STORAGE_KEYS.CONSENT,
      STORAGE_KEYS.FAVORITES,
      STORAGE_KEYS.FEEDBACK
    ])
  });

  harness.page.onClearAll();
  harness.invoke(() => harness.modals[0].success({ confirm: true, cancel: false }));

  assert.deepEqual(harness.toasts, [{
    title: '删除失败：同意记录、收藏、反馈，请重试',
    icon: 'none'
  }]);
  assert.equal(harness.resetCount, 0);
  assert.equal(harness.relaunches.length, 0);
  assert.equal(harness.page.data.deletingAll, false);
});

test('partial full-deletion failure preserves the session report when its storage key remains', () => {
  const harness = createSettingsHarness({
    failedKeys: new Set([STORAGE_KEYS.CONSENT, STORAGE_KEYS.REPORT])
  });
  const reportBefore = harness.app.globalData.session.report;

  harness.page.onClearAll();
  harness.invoke(() => harness.modals[0].success({ confirm: true, cancel: false }));

  assert.equal(harness.values.has(STORAGE_KEYS.REPORT), true);
  assert.strictEqual(harness.app.globalData.session.report, reportBefore);
  assert.equal(harness.resetCount, 0);
  assert.equal(harness.relaunches.length, 0);
  assert.deepEqual(harness.toasts, [{
    title: '删除失败：同意记录、报告，请重试',
    icon: 'none'
  }]);
});

test('partial full-deletion clears every in-memory profile slice whose storage was removed', () => {
  const session = {
    ...createSession(),
    pendingRegeneration: {
      kind: 'local-feedback-regeneration-v1',
      profile: { schemaVersion: 2, id: 'pending-profile' }
    }
  };
  const reportBefore = session.report;
  const harness = createSettingsHarness({
    failedKeys: new Set([STORAGE_KEYS.CONSENT, STORAGE_KEYS.REPORT]),
    session
  });

  harness.page.onClearAll();
  harness.invoke(() => harness.modals[0].success({
    confirm: true,
    cancel: false
  }));

  assert.equal(harness.values.has(STORAGE_KEYS.PROFILE), false);
  assert.equal(harness.values.has(STORAGE_KEYS.CONSENT), true);
  assert.equal(harness.values.has(STORAGE_KEYS.REPORT), true);
  assert.equal(harness.app.globalData.session.profileDraft, null);
  assert.equal(harness.app.globalData.session.features, null);
  assert.equal(harness.app.globalData.session.preferences, null);
  assert.equal(harness.app.globalData.session.profile, null);
  assert.equal(
    Object.hasOwn(harness.app.globalData.session, 'pendingRegeneration'),
    false
  );
  assert.strictEqual(harness.app.globalData.session.report, reportBefore);
  assert.equal(harness.resetCount, 0);
});

test('partial deletion revokes the current session when consent was removed', () => {
  const session = {
    consentTicket: {
      adult: true,
      ownPhoto: true,
      photoProcessing: true
    },
    ...createSession()
  };
  const harness = createSettingsHarness({
    failedKeys: new Set([STORAGE_KEYS.FEEDBACK]),
    session
  });

  harness.page.onClearAll();
  harness.invoke(() => harness.modals[0].success({ confirm: true, cancel: false }));

  assert.equal(harness.resetCount, 1);
  assert.deepEqual(harness.app.globalData.session, {
    photoPath: '',
    photoMeta: null,
    qualityResult: null,
    features: null,
    preferences: null,
    report: null
  });
  assert.equal(harness.relaunches.length, 1);
  assert.equal(harness.relaunches[0].url, '/pages/consent/index');
  assert.deepEqual(harness.toasts, [{
    title: '删除失败：反馈，请重试',
    icon: 'none'
  }]);
  assert.equal(harness.page.data.deletingAll, false);

  let chooseCount = 0;
  const captureRedirects = [];
  const capture = createPageHarness('capture', {
    session: harness.app.globalData.session,
    wxApi: {
      redirectTo({ url }) {
        captureRedirects.push(url);
      },
      chooseMedia() {
        chooseCount += 1;
      }
    }
  });
  capture.page.onLoad();
  capture.page.onChoosePhoto({
    currentTarget: { dataset: { source: 'album' } }
  });

  assert.equal(chooseCount, 0);
  assert.deepEqual(captureRedirects, [
    '/pages/home/index',
    '/pages/home/index'
  ]);
});

test('partial deletion preserves the current consent ticket when consent removal failed', () => {
  const consentTicket = {
    adult: true,
    ownPhoto: true,
    photoProcessing: true
  };
  const session = { consentTicket, ...createSession() };
  const harness = createSettingsHarness({
    failedKeys: new Set([STORAGE_KEYS.CONSENT]),
    session
  });

  harness.page.onClearAll();
  harness.invoke(() => harness.modals[0].success({ confirm: true, cancel: false }));

  assert.strictEqual(harness.app.globalData.session.consentTicket, consentTicket);
  assert.equal(harness.app.globalData.session.report, null);
  assert.equal(harness.resetCount, 0);
  assert.equal(harness.relaunches.length, 0);
  assert.deepEqual(harness.toasts, [{
    title: '删除失败：同意记录，请重试',
    icon: 'none'
  }]);
});

test('partial-deletion consent navigation throws without hiding the failure or keeping the lock', () => {
  const harness = createSettingsHarness({
    failedKeys: new Set([STORAGE_KEYS.FEEDBACK]),
    session: {
      consentTicket: {
        adult: true,
        ownPhoto: true,
        photoProcessing: true
      },
      ...createSession()
    }
  });
  harness.wxApi.reLaunch = () => {
    throw new Error('reLaunch unavailable');
  };
  harness.wxApi.redirectTo = () => {
    throw new Error('redirectTo unavailable');
  };

  harness.page.onClearAll();
  assert.doesNotThrow(() => {
    harness.invoke(() => harness.modals[0].success({ confirm: true, cancel: false }));
  });

  assert.equal(harness.resetCount, 1);
  assert.equal(harness.page.data.deletingAll, false);
  assert.deepEqual(harness.toasts, [{
    title: '删除失败：反馈，请重试',
    icon: 'none'
  }]);
});

test('successful full deletion clears only app keys, resets once, and relaunches home once', () => {
  const harness = createSettingsHarness();

  harness.page.onClearAll();
  harness.invoke(() => harness.modals[0].success({ confirm: true, cancel: false }));
  harness.invoke(() => harness.modals[0].success({ confirm: true, cancel: false }));
  harness.page.onClearAll();

  assert.ok(Object.values(STORAGE_KEYS).every((key) => !harness.values.has(key)));
  assert.equal(harness.values.get('another-app'), 'keep');
  assert.equal(harness.resetCount, 1);
  assert.deepEqual(harness.app.globalData.session, {
    photoPath: '',
    photoMeta: null,
    qualityResult: null,
    features: null,
    preferences: null,
    report: null
  });
  assert.equal(harness.relaunches.length, 1);
  assert.equal(harness.relaunches[0].url, '/pages/home/index');
  assert.equal(harness.modals.length, 1);
  assert.deepEqual(harness.toasts, []);
});

test('relaunch failure is distinguished from deletion failure and releases the action lock', () => {
  const harness = createSettingsHarness();

  harness.page.onClearAll();
  harness.invoke(() => harness.modals[0].success({ confirm: true, cancel: false }));
  harness.invoke(() => harness.relaunches[0].fail(new Error('navigation unavailable')));

  assert.ok(Object.values(STORAGE_KEYS).every((key) => !harness.values.has(key)));
  assert.equal(harness.resetCount, 1);
  assert.deepEqual(harness.toasts, [{
    title: '数据已清除，请手动返回首页',
    icon: 'none'
  }]);
  assert.equal(harness.page.data.deletingAll, false);

  harness.page.onClearAll();
  assert.equal(harness.modals.length, 2);
});

test('full-delete callbacks become inert after the settings page unloads', () => {
  const harness = createSettingsHarness();

  harness.page.onClearAll();
  harness.page.onUnload();
  harness.invoke(() => harness.modals[0].success({ confirm: true, cancel: false }));

  assert.equal(harness.removed.length, 0);
  assert.equal(harness.resetCount, 0);
  assert.equal(harness.relaunches.length, 0);
  assert.deepEqual(harness.toasts, []);
});

test('home and report pages open privacy settings through stack navigation', () => {
  for (const route of ['home', 'result']) {
    const visits = [];
    const harness = createPageHarness(route, {
      wxApi: {
        navigateTo({ url }) {
          visits.push(url);
        }
      }
    });

    harness.page.onOpenSettings();

    assert.deepEqual(visits, ['/pages/settings/index']);
  }
});

test('returning from settings hides a report that was deleted from session and storage', () => {
  const report = getDemoReport();
  const values = new Map([[STORAGE_KEYS.REPORT, report]]);
  const relaunches = [];
  const app = {
    globalData: { session: { report } },
    resetSession() {}
  };
  const harness = createPageHarness('result', {
    app,
    wxApi: {
      getStorageSync(key) {
        return values.get(key);
      },
      setStorageSync(key, value) {
        values.set(key, value);
      },
      removeStorageSync(key) {
        values.delete(key);
      },
      navigateTo() {},
      reLaunch(options) {
        relaunches.push(options);
      },
      showToast() {}
    }
  });
  harness.page.onLoad();
  harness.page.onOpenSettings();
  values.delete(STORAGE_KEYS.REPORT);
  app.globalData.session.report = null;

  harness.page.onShow();

  assert.equal(harness.page.data.report, null);
  assert.equal(relaunches.length, 1);
  assert.equal(relaunches[0].url, '/pages/home/index');
});

test('returning from settings reloads cleared favorites before another favorite is saved', () => {
  const report = getDemoReport();
  const firstId = report.sections.clothing[0].id;
  const staleId = report.sections.hair[0].id;
  const values = new Map([
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.FAVORITES, [firstId, staleId]],
    [STORAGE_KEYS.FEEDBACK, {}]
  ]);
  const app = {
    globalData: { session: { report } },
    resetSession() {}
  };
  const harness = createPageHarness('result', {
    app,
    wxApi: {
      getStorageSync(key) {
        return values.get(key);
      },
      setStorageSync(key, value) {
        values.set(key, value);
      },
      removeStorageSync(key) {
        values.delete(key);
      },
      navigateTo() {},
      reLaunch() {},
      showToast() {}
    }
  });
  harness.page.onLoad();
  assert.deepEqual(harness.page.data.favoriteIds, [firstId, staleId]);
  harness.page.onOpenSettings();
  values.delete(STORAGE_KEYS.FAVORITES);

  harness.page.onShow();
  harness.page.onFavoriteChange({ detail: { id: firstId } });

  assert.deepEqual(harness.page.data.favoriteIds, [firstId]);
  assert.deepEqual(values.get(STORAGE_KEYS.FAVORITES), [firstId]);
});

test('favorite read failure after settings deletion clears favorite UI and blocks only favorite writes', () => {
  const harness = createResultReconciliationHarness();
  const beforeFeedback = { ...harness.page.data.feedbackMap };
  harness.values.delete(STORAGE_KEYS.FAVORITES);
  harness.readFailures.add(STORAGE_KEYS.FAVORITES);

  returnFromSettings(harness);

  assert.deepEqual(harness.page.data.favoriteIds, []);
  assert.deepEqual(harness.page.data.feedbackMap, beforeFeedback);
  assert.equal(harness.page.data.favoritesReady, false);
  assert.equal(harness.page.data.feedbackReady, true);
  assert.ok(harness.toasts.some(({ title }) => (
    title === '收藏暂不可用，请稍后重试'
  )));

  harness.page.onFavoriteChange({ detail: { id: harness.favoriteId } });
  harness.page.onFeedbackChange({
    detail: { id: harness.favoriteId, state: 'not-for-me' }
  });

  assert.equal(harness.writes.length, 1);
  assert.equal(harness.writes[0].key, STORAGE_KEYS.FEEDBACK);
  assert.deepEqual(
    {
      ...harness.writes[0].value[harness.favoriteId],
      updatedAt: '<timestamp>'
    },
    {
      recommendationId: harness.favoriteId,
      family: 'clothing',
      state: 'not-for-me',
      updatedAt: '<timestamp>'
    }
  );
  assert.match(
    harness.writes[0].value[harness.favoriteId].updatedAt,
    /^\d{4}-\d{2}-\d{2}T/
  );

  harness.readFailures.delete(STORAGE_KEYS.FAVORITES);
  harness.values.delete(STORAGE_KEYS.FAVORITES);
  returnFromSettings(harness);

  assert.deepEqual(harness.page.data.favoriteIds, []);
  assert.equal(harness.page.data.favoritesReady, true);
  harness.writes.length = 0;
  harness.page.onFavoriteChange({ detail: { id: harness.favoriteId } });
  assert.deepEqual(harness.writes, [{
    key: STORAGE_KEYS.FAVORITES,
    value: [harness.favoriteId]
  }]);
});

test('feedback read failure after settings deletion clears feedback UI and blocks only feedback writes', () => {
  const harness = createResultReconciliationHarness();
  const beforeFavorites = [...harness.page.data.favoriteIds];
  harness.values.delete(STORAGE_KEYS.FEEDBACK);
  harness.readFailures.add(STORAGE_KEYS.FEEDBACK);

  returnFromSettings(harness);

  assert.deepEqual(harness.page.data.favoriteIds, beforeFavorites);
  assert.deepEqual(harness.page.data.feedbackMap, {});
  assert.equal(harness.page.data.favoritesReady, true);
  assert.equal(harness.page.data.feedbackReady, false);
  assert.ok(harness.toasts.some(({ title }) => (
    title === '反馈暂不可用，请稍后重试'
  )));

  harness.page.onFavoriteChange({ detail: { id: harness.favoriteId } });
  harness.page.onFeedbackChange({
    detail: { id: harness.favoriteId, state: 'not-for-me' }
  });

  assert.deepEqual(harness.writes, [{
    key: STORAGE_KEYS.FAVORITES,
    value: [harness.otherFavoriteId]
  }]);

  harness.readFailures.delete(STORAGE_KEYS.FEEDBACK);
  harness.values.delete(STORAGE_KEYS.FEEDBACK);
  returnFromSettings(harness);

  assert.deepEqual(harness.page.data.feedbackMap, {});
  assert.equal(harness.page.data.feedbackReady, true);
  harness.writes.length = 0;
  harness.page.onFeedbackChange({
    detail: { id: harness.favoriteId, state: 'tried' }
  });
  assert.equal(harness.writes.length, 1);
  assert.equal(harness.writes[0].key, STORAGE_KEYS.FEEDBACK);
  assert.equal(
    harness.writes[0].value[harness.favoriteId].state,
    'tried'
  );
  assert.equal(
    harness.writes[0].value[harness.favoriteId].family,
    'clothing'
  );
});

test('deleted feedback cannot be reused for regeneration when the settings return read fails', () => {
  const report = getDemoReport();
  const recommendation = report.sections.clothing[0];
  const staleFeedback = {
    [recommendation.id]: {
      recommendationId: recommendation.id,
      family: 'clothing',
      state: 'suppress-similar',
      updatedAt: '2026-07-29T00:00:00.000Z'
    }
  };
  const values = new Map([
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.PROFILE, structuredClone(DEMO_PROFILE)],
    [STORAGE_KEYS.FEEDBACK, staleFeedback]
  ]);
  const readFailures = new Set();
  const modals = [];
  const app = {
    globalData: {
      session: {
        profile: structuredClone(DEMO_PROFILE),
        report
      }
    },
    resetSession() {}
  };
  const harness = createPageHarness('result', {
    app,
    wxApi: {
      getStorageSync(key) {
        if (readFailures.has(key)) throw new Error(`cannot read ${key}`);
        return values.get(key);
      },
      setStorageSync(key, value) {
        values.set(key, value);
      },
      removeStorageSync(key) {
        values.delete(key);
      },
      navigateTo() {},
      showModal(options) {
        modals.push(options);
      },
      reLaunch() {},
      showToast() {}
    }
  });
  harness.page.onLoad();
  assert.deepEqual(harness.page.data.feedbackMap, staleFeedback);

  harness.page.onOpenSettings();
  values.delete(STORAGE_KEYS.FEEDBACK);
  readFailures.add(STORAGE_KEYS.FEEDBACK);
  harness.page.onShow();

  assert.deepEqual(harness.page.data.feedbackMap, {});
  assert.equal(harness.page.data.feedbackReady, false);

  harness.page.onReanalyze();
  harness.invoke(() => modals[0].success({ confirm: true, cancel: false }));

  assert.deepEqual(
    app.globalData.session.pendingRegeneration.profile.feedbackSummary,
    {
      likedRuleIds: [],
      rejectedRuleIds: [],
      ownedRuleIds: [],
      triedRuleIds: [],
      suppressedFamilies: []
    }
  );
});

test('result migrates legacy feedback without reordering the current report', () => {
  const report = getDemoReport();
  const id = report.sections.clothing[0].id;
  const values = new Map([
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.FEEDBACK, { [id]: 'tried' }]
  ]);
  const writes = [];
  const harness = createPageHarness('result', {
    app: {
      globalData: { session: { report } },
      resetSession() {}
    },
    wxApi: {
      getStorageSync(key) {
        return values.get(key);
      },
      setStorageSync(key, value) {
        writes.push({ key, value });
        values.set(key, value);
      },
      removeStorageSync(key) {
        values.delete(key);
      },
      showToast() {},
      reLaunch() {}
    }
  });

  harness.page.onLoad();
  const orderBefore = harness.page.data.sections.flatMap(
    ({ recommendations }) => recommendations.map(({ id: itemId }) => itemId)
  );
  harness.page.onFeedbackChange({ detail: { id, state: 'liked' } });
  const orderAfter = harness.page.data.sections.flatMap(
    ({ recommendations }) => recommendations.map(({ id: itemId }) => itemId)
  );

  const saved = values.get(STORAGE_KEYS.FEEDBACK);
  assert.equal(saved[id].recommendationId, id);
  assert.equal(saved[id].family, 'clothing');
  assert.equal(saved[id].state, 'liked');
  assert.match(saved[id].updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(orderAfter, orderBefore);
  assert.ok(writes.some(({ key }) => key === STORAGE_KEYS.FEEDBACK));
});

test('result accepts feedback only for a current recommendation and derives its controlled family', () => {
  const harness = createResultReconciliationHarness();
  const validId = harness.report.sections.clothing[0].id;
  const writesBefore = harness.writes.length;

  harness.page.onFeedbackChange({
    detail: {
      id: 'forged-recommendation',
      state: 'liked',
      family: 'clothing'
    }
  });
  assert.equal(harness.writes.length, writesBefore);

  harness.page.onFeedbackChange({
    detail: {
      id: validId,
      state: 'liked',
      family: 'free text from event'
    }
  });
  assert.equal(
    harness.values.get(STORAGE_KEYS.FEEDBACK)[validId].family,
    'clothing'
  );

  harness.report.sections.clothing[0].appliedRuleIds = [];
  const writesAfterTraceableFeedback = harness.writes.length;
  harness.page.onFeedbackChange({
    detail: { id: validId, state: 'owned', family: 'clothing' }
  });
  assert.equal(harness.writes.length, writesAfterTraceableFeedback);

  harness.report.sections.clothing[0].family = 'unknown';
  const writesAfterValidFeedback = harness.writes.length;
  harness.page.onFeedbackChange({
    detail: { id: validId, state: 'tried', family: 'clothing' }
  });
  assert.equal(harness.writes.length, writesAfterValidFeedback);
});

test('result rejects feedback for nonexistent and wrong-family rule mappings', () => {
  const harness = createResultReconciliationHarness();
  const recommendation = harness.report.sections.hairColor[0];
  const writesBefore = harness.writes.length;

  recommendation.appliedRuleIds = ['fabricated-rule'];
  harness.page.onFeedbackChange({
    detail: { id: recommendation.id, state: 'liked' }
  });
  assert.equal(harness.writes.length, writesBefore);

  recommendation.appliedRuleIds = [
    harness.report.sections.clothing[0].appliedRuleIds[0]
  ];
  harness.page.onFeedbackChange({
    detail: { id: recommendation.id, state: 'tried' }
  });
  assert.equal(harness.writes.length, writesBefore);
});

test('regeneration hands off feedback without mutating current storage, session, or page', () => {
  const report = getDemoReport();
  const id = report.sections.clothing[0].id;
  const feedback = {
    [id]: {
      recommendationId: id,
      family: 'clothing',
      state: 'liked',
      updatedAt: '2026-07-29T00:00:00.000Z'
    }
  };
  const values = new Map([
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.PROFILE, structuredClone(DEMO_PROFILE)],
    [STORAGE_KEYS.FEEDBACK, feedback]
  ]);
  const modals = [];
  const relaunches = [];
  let resetCount = 0;
  const app = {
    globalData: {
      session: {
        profile: structuredClone(DEMO_PROFILE),
        report
      }
    },
    resetSession() {
      resetCount += 1;
    }
  };
  const harness = createPageHarness('result', {
    app,
    wxApi: {
      getStorageSync(key) {
        return values.get(key);
      },
      setStorageSync(key, value) {
        values.set(key, value);
      },
      removeStorageSync(key) {
        values.delete(key);
      },
      showModal(options) {
        modals.push(options);
      },
      reLaunch(options) {
        relaunches.push(options);
      },
      showToast() {}
    }
  });
  harness.page.onLoad();
  const displayedReport = harness.page.data.report;

  harness.page.onReanalyze();
  harness.invoke(() => modals[0].success({ confirm: true, cancel: false }));

  assert.strictEqual(harness.page.data.report, displayedReport);
  assert.equal(resetCount, 0);
  assert.strictEqual(app.globalData.session.report, report);
  assert.deepEqual(app.globalData.session.profile, DEMO_PROFILE);
  assert.deepEqual(app.globalData.session.pendingRegeneration.profile.feedbackSummary, {
    likedRuleIds: report.sections.clothing[0].appliedRuleIds,
    rejectedRuleIds: [],
    ownedRuleIds: [],
    triedRuleIds: [],
    suppressedFamilies: []
  });
  assert.strictEqual(values.get(STORAGE_KEYS.REPORT), report);
  assert.deepEqual(values.get(STORAGE_KEYS.PROFILE), DEMO_PROFILE);
  assert.deepEqual(relaunches.map(({ url }) => url), ['/pages/processing/index']);
});

test('regeneration never deletes the current report before processing takes over', () => {
  const report = getDemoReport();
  const values = new Map([
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.PROFILE, structuredClone(DEMO_PROFILE)],
    [STORAGE_KEYS.FEEDBACK, {}]
  ]);
  const modals = [];
  const removed = [];
  const toasts = [];
  const app = {
    globalData: {
      session: {
        profile: structuredClone(DEMO_PROFILE),
        report
      }
    },
    resetSession() {}
  };
  const harness = createPageHarness('result', {
    app,
    wxApi: {
      getStorageSync(key) {
        return values.get(key);
      },
      setStorageSync(key, value) {
        values.set(key, value);
      },
      removeStorageSync(key) {
        removed.push(key);
        if (key === STORAGE_KEYS.REPORT) throw new Error('report delete failed');
        values.delete(key);
      },
      showModal(options) {
        modals.push(options);
      },
      reLaunch() {},
      showToast(options) {
        toasts.push(options);
      }
    }
  });
  harness.page.onLoad();

  harness.page.onReanalyze();
  harness.invoke(() => modals[0].success({ confirm: true, cancel: false }));

  assert.equal(removed.includes(STORAGE_KEYS.REPORT), false);
  assert.strictEqual(values.get(STORAGE_KEYS.REPORT), report);
  assert.strictEqual(app.globalData.session.report, report);
  assert.strictEqual(harness.page.data.report, report);
  assert.ok(app.globalData.session.pendingRegeneration);
  assert.equal(toasts.length, 0);
});

test('failed regeneration relaunch rolls back the pending handoff and keeps the old report', () => {
  const report = getDemoReport();
  const values = new Map([
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.PROFILE, structuredClone(DEMO_PROFILE)],
    [STORAGE_KEYS.FEEDBACK, {}]
  ]);
  const modals = [];
  const relaunches = [];
  const toasts = [];
  const originalProfile = structuredClone(DEMO_PROFILE);
  const app = {
    globalData: {
      session: {
        profile: originalProfile,
        report
      }
    },
    resetSession() {}
  };
  const harness = createPageHarness('result', {
    app,
    wxApi: {
      getStorageSync(key) {
        return values.get(key);
      },
      setStorageSync(key, value) {
        values.set(key, value);
      },
      removeStorageSync(key) {
        values.delete(key);
      },
      showModal(options) {
        modals.push(options);
      },
      reLaunch(options) {
        relaunches.push(options);
      },
      showToast(options) {
        toasts.push(options);
      }
    }
  });
  harness.page.onLoad();
  const profileBeforeRegeneration = app.globalData.session.profile;

  harness.page.onReanalyze();
  harness.invoke(() => modals[0].success({ confirm: true, cancel: false }));
  harness.invoke(() => relaunches[0].fail());

  assert.equal(app.globalData.session.pendingRegeneration, undefined);
  assert.strictEqual(
    app.globalData.session.profile,
    profileBeforeRegeneration
  );
  assert.strictEqual(app.globalData.session.report, report);
  assert.strictEqual(values.get(STORAGE_KEYS.REPORT), report);
  assert.deepEqual(values.get(STORAGE_KEYS.PROFILE), DEMO_PROFILE);
  assert.strictEqual(harness.page.data.report, report);
  assert.equal(harness.page.data.confirmingReset, false);
  assert.deepEqual(toasts.at(-1), {
    title: '暂时无法重新开始，请重试',
    icon: 'none'
  });

  harness.page.onReanalyze();
  harness.invoke(() => modals[1].success({ confirm: true, cancel: false }));
  assert.equal(relaunches.length, 2);
  assert.ok(app.globalData.session.pendingRegeneration);
});

test('one modal confirmation callback creates exactly one regeneration handoff', () => {
  const report = getDemoReport();
  const values = new Map([
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.PROFILE, structuredClone(DEMO_PROFILE)],
    [STORAGE_KEYS.FEEDBACK, {}]
  ]);
  const modals = [];
  const relaunches = [];
  const app = {
    globalData: {
      session: {
        profile: structuredClone(DEMO_PROFILE),
        report
      }
    },
    resetSession() {}
  };
  const harness = createPageHarness('result', {
    app,
    wxApi: {
      getStorageSync(key) {
        return values.get(key);
      },
      setStorageSync(key, value) {
        values.set(key, value);
      },
      removeStorageSync(key) {
        values.delete(key);
      },
      showModal(options) {
        modals.push(options);
      },
      reLaunch(options) {
        relaunches.push(options);
      },
      showToast() {}
    }
  });
  harness.page.onLoad();
  harness.page.onReanalyze();

  harness.invoke(() => modals[0].success({ confirm: true }));
  const firstHandoff = app.globalData.session.pendingRegeneration;
  harness.invoke(() => modals[0].success({ confirm: true }));

  assert.equal(relaunches.length, 1);
  assert.strictEqual(app.globalData.session.pendingRegeneration, firstHandoff);
});

test('an older delayed relaunch failure cannot clear or unlock a newer handoff', () => {
  const report = getDemoReport();
  const values = new Map([
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.PROFILE, structuredClone(DEMO_PROFILE)],
    [STORAGE_KEYS.FEEDBACK, {}]
  ]);
  const modals = [];
  const relaunches = [];
  const toasts = [];
  const app = {
    globalData: {
      session: {
        profile: structuredClone(DEMO_PROFILE),
        report
      }
    },
    resetSession() {}
  };
  const harness = createPageHarness('result', {
    app,
    wxApi: {
      getStorageSync(key) {
        return values.get(key);
      },
      setStorageSync(key, value) {
        values.set(key, value);
      },
      removeStorageSync(key) {
        values.delete(key);
      },
      showModal(options) {
        modals.push(options);
      },
      reLaunch(options) {
        relaunches.push(options);
      },
      showToast(options) {
        toasts.push(options);
      }
    }
  });
  harness.page.onLoad();
  harness.page.onReanalyze();
  harness.invoke(() => modals[0].success({ confirm: true }));
  harness.invoke(() => relaunches[0].fail());
  harness.page.onReanalyze();
  harness.invoke(() => modals[1].success({ confirm: true }));
  const newerHandoff = app.globalData.session.pendingRegeneration;
  const toastCount = toasts.length;

  harness.invoke(() => relaunches[0].fail());

  assert.strictEqual(app.globalData.session.pendingRegeneration, newerHandoff);
  assert.equal(harness.page.data.confirmingReset, true);
  assert.equal(toasts.length, toastCount);
});

test('successful regeneration handoff survives source unload before reLaunch success', () => {
  const report = getDemoReport();
  const values = new Map([
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.PROFILE, structuredClone(DEMO_PROFILE)],
    [STORAGE_KEYS.FEEDBACK, {}],
    [STORAGE_KEYS.FAVORITES, []]
  ]);
  const modals = [];
  const relaunches = [];
  const app = {
    globalData: {
      session: {
        profile: structuredClone(DEMO_PROFILE),
        report
      }
    },
    resetSession() {}
  };
  const harness = createPageHarness('result', {
    app,
    wxApi: {
      getStorageSync(key) {
        return values.get(key);
      },
      setStorageSync(key, value) {
        values.set(key, value);
      },
      removeStorageSync(key) {
        values.delete(key);
      },
      showModal(options) {
        modals.push(options);
      },
      reLaunch(options) {
        relaunches.push(options);
      },
      showToast() {}
    }
  });
  harness.page.onLoad();
  harness.page.onReanalyze();
  harness.invoke(() => modals[0].success({ confirm: true, cancel: false }));
  const handoff = app.globalData.session.pendingRegeneration;

  harness.page.onUnload();
  harness.invoke(() => relaunches[0].success());

  assert.strictEqual(app.globalData.session.pendingRegeneration, handoff);
  const processing = createPageHarness('processing', {
    app,
    wxApi: harness.wxApi
  });
  processing.page.onLoad();
  assert.deepEqual(processing.scheduler.pendingDelays(), [350, 750, 1150]);
});

test('result load clears a stale regeneration marker before accepting another action', () => {
  const report = getDemoReport();
  const values = new Map([
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.FAVORITES, []],
    [STORAGE_KEYS.FEEDBACK, {}]
  ]);
  const app = {
    globalData: {
      session: {
        profile: structuredClone(DEMO_PROFILE),
        report,
        pendingRegeneration: {
          kind: 'local-feedback-regeneration-v1',
          profile: structuredClone(DEMO_PROFILE)
        }
      }
    },
    resetSession() {}
  };
  const harness = createPageHarness('result', {
    app,
    wxApi: {
      getStorageSync(key) {
        return values.get(key);
      },
      setStorageSync(key, value) {
        values.set(key, value);
      },
      removeStorageSync(key) {
        values.delete(key);
      },
      reLaunch() {},
      showToast() {}
    }
  });

  harness.page.onLoad();

  assert.equal(app.globalData.session.pendingRegeneration, undefined);
});

test('opening an all-trends-expired report removes it and prompts regeneration', () => {
  const report = getDemoReport();
  report.trendMeta = {
    enabled: true,
    appliedRuleIds: ['trend-cn-lightweight-modern-chinese'],
    validUntil: '2025-12-31'
  };
  const values = new Map([
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.PROFILE, structuredClone(DEMO_PROFILE)]
  ]);
  const modals = [];
  const app = {
    globalData: { session: { report: null } },
    resetSession() {}
  };
  const harness = createPageHarness('result', {
    app,
    wxApi: {
      getStorageSync(key) {
        return values.get(key);
      },
      setStorageSync(key, value) {
        values.set(key, value);
      },
      removeStorageSync(key) {
        values.delete(key);
      },
      showModal(options) {
        modals.push(options);
      },
      reLaunch() {},
      showToast() {}
    }
  });

  harness.page.onLoad();

  assert.equal(values.has(STORAGE_KEYS.REPORT), false);
  assert.equal(app.globalData.session.report, null);
  assert.equal(harness.page.data.report, null);
  assert.equal(modals.length, 1);
  assert.equal(modals[0].title, '趋势建议已到期');
  assert.match(modals[0].content, /重新生成/);
});

test('an expired report stays hidden when its local deletion fails', () => {
  const report = getDemoReport();
  report.trendMeta = {
    enabled: true,
    appliedRuleIds: ['trend-cn-lightweight-modern-chinese'],
    validUntil: '2025-12-31'
  };
  const values = new Map([
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.PROFILE, structuredClone(DEMO_PROFILE)]
  ]);
  const modals = [];
  const app = {
    globalData: { session: { report: null } },
    resetSession() {}
  };
  const harness = createPageHarness('result', {
    app,
    wxApi: {
      getStorageSync(key) {
        return values.get(key);
      },
      setStorageSync(key, value) {
        values.set(key, value);
      },
      removeStorageSync() {
        throw new Error('storage unavailable');
      },
      showModal(options) {
        modals.push(options);
      },
      reLaunch() {},
      showToast() {}
    }
  });

  harness.page.onLoad();

  assert.strictEqual(values.get(STORAGE_KEYS.REPORT), report);
  assert.equal(app.globalData.session.report, null);
  assert.equal(harness.page.data.report, null);
  assert.equal(modals.length, 1);
  assert.equal(modals[0].title, '趋势建议已到期');
  assert.match(modals[0].content, /无法从本机删除/);
  assert.match(modals[0].content, /不会继续展示/);
});

test('expired-report prompt failures return home instead of leaving a blank result page', () => {
  for (const failureMode of ['callback', 'throw']) {
    const report = getDemoReport();
    report.trendMeta = {
      enabled: true,
      appliedRuleIds: ['trend-cn-lightweight-modern-chinese'],
      validUntil: '2025-12-31'
    };
    const values = new Map([
      [STORAGE_KEYS.REPORT, report],
      [STORAGE_KEYS.PROFILE, structuredClone(DEMO_PROFILE)]
    ]);
    const relaunches = [];
    const harness = createPageHarness('result', {
      app: {
        globalData: { session: { report: null } },
        resetSession() {}
      },
      wxApi: {
        getStorageSync(key) {
          return values.get(key);
        },
        setStorageSync(key, value) {
          values.set(key, value);
        },
        removeStorageSync(key) {
          values.delete(key);
        },
        showModal({ fail }) {
          if (failureMode === 'throw') {
            throw new Error('modal unavailable');
          }
          fail(new Error('modal unavailable'));
        },
        reLaunch(options) {
          relaunches.push(options);
        },
        showToast() {}
      }
    });

    assert.doesNotThrow(() => harness.page.onLoad(), failureMode);
    assert.deepEqual(
      relaunches.map(({ url }) => url),
      ['/pages/home/index'],
      failureMode
    );
  }
});

test('expired-report regeneration navigation failure clears its handoff and returns home', () => {
  const report = getDemoReport();
  report.trendMeta = {
    enabled: true,
    appliedRuleIds: ['trend-cn-lightweight-modern-chinese'],
    validUntil: '2025-12-31'
  };
  const values = new Map([
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.PROFILE, structuredClone(DEMO_PROFILE)],
    [STORAGE_KEYS.FEEDBACK, {}]
  ]);
  const modals = [];
  const relaunches = [];
  const toasts = [];
  const app = {
    globalData: { session: { report: null } },
    resetSession() {}
  };
  const harness = createPageHarness('result', {
    app,
    wxApi: {
      getStorageSync(key) {
        return values.get(key);
      },
      setStorageSync(key, value) {
        values.set(key, value);
      },
      removeStorageSync(key) {
        values.delete(key);
      },
      showModal(options) {
        modals.push(options);
      },
      reLaunch(options) {
        relaunches.push(options);
        if (options.url === '/pages/processing/index') {
          options.fail(new Error('processing unavailable'));
        }
      },
      showToast(options) {
        toasts.push(options);
      }
    }
  });

  harness.page.onLoad();
  harness.invoke(() => modals[0].success({ confirm: true }));

  assert.equal(app.globalData.session.pendingRegeneration, undefined);
  assert.deepEqual(
    relaunches.map(({ url }) => url),
    ['/pages/processing/index', '/pages/home/index']
  );
  assert.match(toasts.at(-1).title, /重新生成/);
});

test('cold-start expired report hands a stored profile directly to processing', () => {
  const report = getDemoReport();
  report.trendMeta = {
    enabled: true,
    appliedRuleIds: ['trend-old'],
    validUntil: '2025-12-31'
  };
  const values = new Map([
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.PROFILE, structuredClone(DEMO_PROFILE)],
    [STORAGE_KEYS.FEEDBACK, {}]
  ]);
  const modals = [];
  const relaunches = [];
  const redirects = [];
  const app = {
    globalData: { session: { report: null } },
    resetSession() {}
  };
  const wxApi = {
    getStorageSync(key) {
      return values.get(key);
    },
    setStorageSync(key, value) {
      values.set(key, value);
    },
    removeStorageSync(key) {
      values.delete(key);
    },
    showModal(options) {
      modals.push(options);
    },
    reLaunch(options) {
      relaunches.push(options);
    },
    redirectTo(options) {
      redirects.push(options);
    },
    showToast() {}
  };
  const resultHarness = createPageHarness('result', {
    app,
    wxApi
  });

  resultHarness.page.onLoad();
  resultHarness.invoke(() => modals[0].success({ confirm: true }));

  assert.equal(
    app.globalData.session.pendingRegeneration?.kind,
    'local-feedback-regeneration-v1'
  );
  assert.equal(
    app.globalData.session.pendingRegeneration?.profile?.schemaVersion,
    2
  );
  assert.deepEqual(
    relaunches.map(({ url }) => url),
    ['/pages/processing/index']
  );

  const processingHarness = createPageHarness('processing', {
    app,
    wxApi
  });
  processingHarness.page.onLoad();

  assert.deepEqual(processingHarness.scheduler.pendingDelays(), [350, 750, 1150]);
  assert.deepEqual(redirects, []);
});

test('expired invalid report cannot inject redirected suppression into regeneration', () => {
  const report = getDemoReport();
  const clothing = report.sections.clothing[0];
  report.sections.hairColor[0].id = clothing.id;
  report.trendMeta = {
    enabled: true,
    appliedRuleIds: ['trend-cn-lightweight-modern-chinese'],
    validUntil: '2025-12-31'
  };
  const values = new Map([
    [STORAGE_KEYS.REPORT, report],
    [STORAGE_KEYS.PROFILE, structuredClone(DEMO_PROFILE)],
    [STORAGE_KEYS.FEEDBACK, {
      [clothing.id]: {
        recommendationId: clothing.id,
        family: 'clothing',
        state: 'suppress-similar',
        updatedAt: '2026-07-29T00:00:00.000Z'
      }
    }]
  ]);
  const modals = [];
  const relaunches = [];
  const app = {
    globalData: { session: { report: null } },
    resetSession() {}
  };
  const harness = createPageHarness('result', {
    app,
    wxApi: {
      getStorageSync(key) {
        return values.get(key);
      },
      setStorageSync(key, value) {
        values.set(key, value);
      },
      removeStorageSync(key) {
        values.delete(key);
      },
      showModal(options) {
        modals.push(options);
      },
      reLaunch(options) {
        relaunches.push(options);
      },
      showToast() {}
    }
  });
  harness.page.onLoad();

  harness.invoke(() => modals[0].success({ confirm: true }));

  assert.deepEqual(
    app.globalData.session.pendingRegeneration.profile
      .feedbackSummary.suppressedFamilies,
    []
  );
  assert.deepEqual(
    relaunches.map(({ url }) => url),
    ['/pages/processing/index']
  );
});
