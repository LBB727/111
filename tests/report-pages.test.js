const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  validateConfirmedFeatures
} = require('../apps/miniprogram/utils/validators');
const {
  generateReport,
  isReportForProfile
} = require('../apps/miniprogram/services/recommendation-engine');
const {
  buildStyleProfile,
  createDefaultPreferences
} = require('../apps/miniprogram/services/profile-contract');
const {
  buildVisualLayers
} = require('../apps/miniprogram/services/visual-layer-builder');
const {
  createPendingRegeneration
} = require('../apps/miniprogram/services/report-state');
const {
  createComponentHarness,
  createPageHarness
} = require('./helpers/miniprogram-harness');

const REPORT_KEY = 'beauty-style-miniapp:report';
const PROFILE_KEY = 'beauty-style-miniapp:profile';
const FAVORITES_KEY = 'beauty-style-miniapp:favorites';
const FEEDBACK_KEY = 'beauty-style-miniapp:feedback';
const miniprogramRoot = path.resolve(__dirname, '../apps/miniprogram');
const expectedResultSections = [
  '本次由用户确认的依据',
  '今日最值得先尝试的三项',
  '具体色彩方案',
  '整体穿搭示意图',
  '单品拼贴卡',
  '核心服装结构图',
  '发型与发色',
  '妆造',
  '配饰与眼镜',
  '场合切换',
  '替代方案',
  '推荐理由与趋势有效期'
];
const validFeatures = Object.freeze({
  line: 'soft',
  value: 'medium',
  temperature: 'warm',
  presence: 'medium',
  contrast: 'low'
});
const validPreferences = Object.freeze({
  scene: 'commute',
  styles: ['natural'],
  budget: 'moderate',
  makeup: 'light',
  doNotChange: []
});

function completeSession(overrides = {}) {
  return {
    analysisMode: 'photo',
    consentTicket: {
      adult: true,
      mode: 'photo',
      ownPhoto: true,
      photoProcessing: true
    },
    profileDraft: { presentationMode: 'neutral', scenes: ['commute'] },
    photoKind: 'portrait',
    photoPath: 'wxfile://local.jpg',
    photoMeta: {
      path: 'wxfile://local.jpg',
      width: 1080,
      height: 1440,
      size: 1200000
    },
    qualityResult: { passed: true },
    features: { ...validFeatures },
    preferences: structuredClone(validPreferences),
    report: null,
    ...overrides
  };
}

function loadResultHelpers() {
  const modulePath = path.join(
    miniprogramRoot,
    'pages/result/index.js'
  );
  const ownedPage = Object.prototype.hasOwnProperty.call(global, 'Page');
  const previousPage = global.Page;
  global.Page = () => {};
  try {
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
  } finally {
    if (ownedPage) global.Page = previousPage;
    else delete global.Page;
  }
}

function createWxStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const calls = {
    navigateTo: [],
    pageScrollTo: [],
    redirectTo: [],
    reLaunch: [],
    removeStorageSync: [],
    setStorageSync: [],
    showModal: [],
    showToast: []
  };
  const failures = new Set();
  const setOutcomes = new Map();
  const removeOutcomes = new Map();
  const nextOutcome = (outcomes, key) => {
    const queue = outcomes.get(key) || [];
    return queue.shift();
  };
  const wxApi = {
    getStorageSync(key) {
      return values.get(key);
    },
    setStorageSync(key, value) {
      calls.setStorageSync.push({ key, value });
      if (failures.has(key)) throw new Error(`write failed: ${key}`);
      const outcome = nextOutcome(setOutcomes, key);
      if (outcome === 'before') throw new Error(`write failed before: ${key}`);
      values.set(key, value);
      if (outcome === 'after') throw new Error(`write failed after: ${key}`);
    },
    removeStorageSync(key) {
      calls.removeStorageSync.push({ key });
      const outcome = nextOutcome(removeOutcomes, key);
      if (outcome === 'before') throw new Error(`remove failed before: ${key}`);
      values.delete(key);
      if (outcome === 'after') throw new Error(`remove failed after: ${key}`);
    },
    navigateTo(options) {
      calls.navigateTo.push(options);
    },
    pageScrollTo(options) {
      calls.pageScrollTo.push(options);
    },
    redirectTo(options) {
      calls.redirectTo.push(options);
    },
    reLaunch(options) {
      calls.reLaunch.push(options);
    },
    showModal(options) {
      calls.showModal.push(options);
    },
    showToast(options) {
      calls.showToast.push(options);
    }
  };
  return {
    wxApi,
    calls,
    values,
    failures,
    setOutcomes,
    removeOutcomes
  };
}

function runProcessingStages(harness) {
  harness.scheduler.runByDelay(350);
  harness.scheduler.runByDelay(750);
  harness.scheduler.runByDelay(1150);
}

function generatedProfile({
  scenes = ['commute'],
  desiredEffects = ['clean', 'vertical']
} = {}) {
  return buildStyleProfile({
    analysisMode: 'manual',
    preferences: {
      ...createDefaultPreferences(),
      scenes,
      desiredEffects
    }
  });
}

function generatedReport(profile = generatedProfile()) {
  const report = generateReport(profile, { now: '2026-07-29T00:00:00.000Z' });
  report.visualLayers = buildVisualLayers(report, profile);
  return structuredClone(report);
}

function regenerationFixture({ oldReport = generatedReport() } = {}) {
  const oldProfile = buildStyleProfile({
    analysisMode: 'manual',
    preferences: createDefaultPreferences()
  });
  const nextProfile = buildStyleProfile({
    analysisMode: 'manual',
    preferences: {
      ...createDefaultPreferences(),
      scenes: ['interview'],
      desiredEffects: ['clean', 'vertical']
    }
  });
  return {
    oldReport,
    oldProfile,
    nextProfile,
    session: completeSession({
      profile: oldProfile,
      report: oldReport,
      pendingRegeneration: createPendingRegeneration(nextProfile)
    })
  };
}

function createProcessingWithOverride({
  exportName,
  replacement,
  session,
  wxApi
}) {
  const dependencyPath = exportName === 'generateReport'
    ? require.resolve('../apps/miniprogram/services/recommendation-engine')
    : require.resolve('../apps/miniprogram/services/visual-layer-builder');
  const dependency = require(dependencyPath);
  const original = dependency[exportName];
  dependency[exportName] = replacement;
  try {
    return createPageHarness('processing', { session, wxApi });
  } finally {
    dependency[exportName] = original;
  }
}

function loadComponentModule(component) {
  const modulePath = path.join(
    miniprogramRoot,
    `components/${component}/index.js`
  );
  const ownedComponent = Object.prototype.hasOwnProperty.call(
    global,
    'Component'
  );
  const previousComponent = global.Component;
  let definition;
  global.Component = (value) => {
    definition = value;
  };
  delete require.cache[require.resolve(modulePath)];
  try {
    const moduleExports = require(modulePath);
    return {
      definition,
      exports: moduleExports
    };
  } finally {
    if (ownedComponent) global.Component = previousComponent;
    else delete global.Component;
  }
}

test('validateConfirmedFeatures accepts exactly five confirmed enum values including unknown', () => {
  assert.equal(validateConfirmedFeatures(validFeatures).valid, true);
  assert.equal(validateConfirmedFeatures({
    ...validFeatures,
    line: 'unknown',
    value: 'unknown',
    temperature: 'unknown',
    presence: 'unknown',
    contrast: 'unknown'
  }).valid, true);
});

test('validateConfirmedFeatures rejects empty, missing, invalid and simulator metadata objects', () => {
  assert.equal(validateConfirmedFeatures({}).valid, false);
  assert.equal(validateConfirmedFeatures({
    ...validFeatures,
    contrast: undefined
  }).valid, false);
  assert.equal(validateConfirmedFeatures({
    ...validFeatures,
    line: 'curved'
  }).valid, false);
  assert.equal(validateConfirmedFeatures({
    ...validFeatures,
    source: 'generated',
    confidenceLabel: '未确认'
  }).valid, false);
  assert.equal(validateConfirmedFeatures({
    source: 'generated',
    confidenceLabel: '未确认'
  }).valid, false);
});

test('processing recovers malformed features to review and malformed preferences to preferences', () => {
  const featureWx = createWxStorage();
  const featureSession = completeSession({
    features: {},
    report: generatedReport()
  });
  const featureHarness = createPageHarness('processing', {
    session: featureSession,
    wxApi: featureWx.wxApi
  });

  featureHarness.page.onLoad();

  assert.deepEqual(
    featureWx.calls.redirectTo.map((call) => call.url),
    ['/pages/feature-review/index']
  );
  assert.deepEqual(featureHarness.scheduler.pendingDelays(), []);
  assert.equal(featureSession.features, null);
  assert.equal(featureSession.preferences, null);
  assert.equal(featureSession.report, null);

  const preferencesWx = createWxStorage();
  const preferencesSession = completeSession({
    preferences: {},
    report: generatedReport()
  });
  const preferencesHarness = createPageHarness('processing', {
    session: preferencesSession,
    wxApi: preferencesWx.wxApi
  });

  preferencesHarness.page.onLoad();

  assert.deepEqual(
    preferencesWx.calls.redirectTo.map((call) => call.url),
    ['/pages/preferences/index']
  );
  assert.deepEqual(preferencesHarness.scheduler.pendingDelays(), []);
  assert.equal(preferencesSession.preferences, null);
  assert.equal(preferencesSession.report, null);

  const missingPreferencesWx = createWxStorage();
  const missingPreferencesHarness = createPageHarness('processing', {
    session: completeSession({ preferences: null }),
    wxApi: missingPreferencesWx.wxApi
  });

  missingPreferencesHarness.page.onLoad();

  assert.deepEqual(
    missingPreferencesWx.calls.redirectTo.map((call) => call.url),
    ['/pages/preferences/index']
  );
  assert.deepEqual(missingPreferencesHarness.scheduler.pendingDelays(), []);
});

test('processing uses exact stage delays and generates and persists one report', () => {
  const session = completeSession();
  const storage = createWxStorage();
  const harness = createPageHarness('processing', {
    session,
    wxApi: storage.wxApi
  });

  harness.page.onLoad();
  assert.deepEqual(harness.scheduler.pendingDelays(), [350, 750, 1150]);

  const finalStage = harness.scheduler.jobs[2];
  runProcessingStages(harness);
  harness.scheduler.invoke(finalStage);

  assert.equal(harness.page.data.progress, 100);
  assert.equal(harness.page.data.reportReady, true);
  assert.ok(session.report);
  assert.deepEqual(
    Object.keys(session.report.visualLayers),
    ['overall', 'collage', 'technical']
  );
  assert.equal(
    storage.calls.setStorageSync.filter((call) => call.key === REPORT_KEY).length,
    1
  );
  assert.equal(
    storage.calls.setStorageSync.filter((call) => call.key === PROFILE_KEY).length,
    1
  );
  assert.strictEqual(storage.values.get(REPORT_KEY), session.report);
  assert.strictEqual(storage.values.get(PROFILE_KEY), session.profile);
});

test('initial generation rolls back its report when profile persistence fails', () => {
  const session = completeSession();
  const storage = createWxStorage();
  storage.setOutcomes.set(PROFILE_KEY, ['before']);
  const harness = createPageHarness('processing', {
    session,
    wxApi: storage.wxApi
  });

  harness.page.onLoad();
  runProcessingStages(harness);

  assert.equal(storage.values.has(REPORT_KEY), false);
  assert.equal(storage.values.has(PROFILE_KEY), false);
  assert.ok(session.report);
  assert.ok(session.profile);
  assert.equal(harness.page.data.reportReady, true);
  assert.deepEqual(
    storage.calls.showToast.map(({ title }) => title),
    ['报告未保存，历史不会保留']
  );
});

test('initial generation repairs a durable report and profile after rollback also fails', () => {
  const oldProfile = generatedProfile();
  const oldReport = generatedReport(oldProfile);
  const session = completeSession({
    preferences: {
      ...createDefaultPreferences(),
      scenes: ['travel'],
      desiredEffects: ['mobility']
    }
  });
  const storage = createWxStorage({
    [REPORT_KEY]: oldReport,
    [PROFILE_KEY]: oldProfile
  });
  storage.setOutcomes.set(REPORT_KEY, [undefined, 'before']);
  storage.setOutcomes.set(PROFILE_KEY, ['before']);
  const harness = createPageHarness('processing', {
    session,
    wxApi: storage.wxApi
  });

  harness.page.onLoad();
  runProcessingStages(harness);

  const durableReport = storage.values.get(REPORT_KEY);
  const durableProfile = storage.values.get(PROFILE_KEY);
  assert.equal(isReportForProfile(durableReport, durableProfile), true);
  assert.equal(durableProfile.scenes[0], 'travel');
  assert.strictEqual(session.report, durableReport);
  assert.strictEqual(session.profile, durableProfile);
});

test('processing consumes a pending regeneration and replaces the old report only after generation', () => {
  const oldReport = generatedReport();
  const nextProfile = buildStyleProfile({
    analysisMode: 'manual',
    preferences: {
      ...createDefaultPreferences(),
      scenes: ['interview'],
      desiredEffects: ['clean']
    }
  });
  const session = completeSession({
    profile: buildStyleProfile({
      analysisMode: 'manual',
      preferences: createDefaultPreferences()
    }),
    report: oldReport,
    pendingRegeneration: createPendingRegeneration(nextProfile)
  });
  const storage = createWxStorage({ [REPORT_KEY]: oldReport });
  const harness = createPageHarness('processing', {
    session,
    wxApi: storage.wxApi
  });

  harness.page.onLoad();

  assert.strictEqual(session.report, oldReport);
  assert.deepEqual(harness.scheduler.pendingDelays(), [350, 750, 1150]);

  runProcessingStages(harness);

  assert.notStrictEqual(session.report, oldReport);
  assert.strictEqual(session.profile, nextProfile);
  assert.equal(session.pendingRegeneration, undefined);
  assert.strictEqual(storage.values.get(REPORT_KEY), session.report);
  assert.strictEqual(storage.values.get(PROFILE_KEY), nextProfile);
});

test('unloading processing rolls back an unconsumed regeneration handoff', () => {
  const oldReport = generatedReport();
  const oldProfile = buildStyleProfile({
    analysisMode: 'manual',
    preferences: createDefaultPreferences()
  });
  const session = completeSession({
    profile: oldProfile,
    report: oldReport,
    pendingRegeneration: createPendingRegeneration(
      buildStyleProfile({
        analysisMode: 'manual',
        preferences: {
          ...createDefaultPreferences(),
          scenes: ['interview']
        }
      })
    )
  });
  const storage = createWxStorage({ [REPORT_KEY]: oldReport });
  const harness = createPageHarness('processing', {
    session,
    wxApi: storage.wxApi
  });

  harness.page.onLoad();
  harness.page.onUnload();

  assert.equal(session.pendingRegeneration, undefined);
  assert.strictEqual(session.report, oldReport);
  assert.strictEqual(session.profile, oldProfile);
  assert.strictEqual(storage.values.get(REPORT_KEY), oldReport);
});

for (const failure of [
  {
    name: 'report generation',
    exportName: 'generateReport',
    replacement() {
      throw new Error('generation failed');
    }
  },
  {
    name: 'visual-layer building',
    exportName: 'buildVisualLayers',
    replacement() {
      throw new Error('visual build failed');
    }
  }
]) {
  test(`processing recovers when ${failure.name} throws`, () => {
    const fixture = regenerationFixture();
    const storage = createWxStorage({
      [REPORT_KEY]: fixture.oldReport,
      [PROFILE_KEY]: fixture.oldProfile
    });
    const harness = createProcessingWithOverride({
      exportName: failure.exportName,
      replacement: failure.replacement,
      session: fixture.session,
      wxApi: storage.wxApi
    });

    harness.page.onLoad();
    assert.doesNotThrow(() => runProcessingStages(harness));

    assert.equal(fixture.session.pendingRegeneration, undefined);
    assert.strictEqual(fixture.session.report, fixture.oldReport);
    assert.strictEqual(fixture.session.profile, fixture.oldProfile);
    assert.strictEqual(storage.values.get(REPORT_KEY), fixture.oldReport);
    assert.strictEqual(storage.values.get(PROFILE_KEY), fixture.oldProfile);
    assert.equal(harness.page.data.reportReady, true);
    assert.match(harness.page.data.statusText, /保留原报告/);
    assert.equal(storage.calls.showToast.length, 1);
  });
}

test('new-report write failure keeps an existing durable report and session aligned', () => {
  const fixture = regenerationFixture();
  const storage = createWxStorage({
    [REPORT_KEY]: fixture.oldReport,
    [PROFILE_KEY]: fixture.oldProfile
  });
  storage.setOutcomes.set(REPORT_KEY, ['before']);
  const harness = createPageHarness('processing', {
    session: fixture.session,
    wxApi: storage.wxApi
  });

  harness.page.onLoad();
  runProcessingStages(harness);

  assert.equal(fixture.session.pendingRegeneration, undefined);
  assert.strictEqual(storage.values.get(REPORT_KEY), fixture.oldReport);
  assert.strictEqual(storage.values.get(PROFILE_KEY), fixture.oldProfile);
  assert.strictEqual(fixture.session.report, fixture.oldReport);
  assert.strictEqual(fixture.session.profile, fixture.oldProfile);
  assert.equal(harness.page.data.reportReady, true);
});

test('profile write failure restores the previous durable report before returning', () => {
  const fixture = regenerationFixture();
  const storage = createWxStorage({
    [REPORT_KEY]: fixture.oldReport,
    [PROFILE_KEY]: fixture.oldProfile
  });
  storage.setOutcomes.set(PROFILE_KEY, ['before']);
  const harness = createPageHarness('processing', {
    session: fixture.session,
    wxApi: storage.wxApi
  });

  harness.page.onLoad();
  runProcessingStages(harness);

  assert.equal(fixture.session.pendingRegeneration, undefined);
  assert.strictEqual(storage.values.get(REPORT_KEY), fixture.oldReport);
  assert.strictEqual(storage.values.get(PROFILE_KEY), fixture.oldProfile);
  assert.strictEqual(fixture.session.report, fixture.oldReport);
  assert.strictEqual(fixture.session.profile, fixture.oldProfile);
  assert.equal(
    storage.calls.setStorageSync.filter(({ key }) => key === REPORT_KEY).length,
    2
  );
});

test('failed report rollback repairs the durable generated report and profile pair', () => {
  const fixture = regenerationFixture();
  const storage = createWxStorage({
    [REPORT_KEY]: fixture.oldReport,
    [PROFILE_KEY]: fixture.oldProfile
  });
  storage.setOutcomes.set(REPORT_KEY, [undefined, 'before']);
  storage.setOutcomes.set(PROFILE_KEY, ['before']);
  const harness = createPageHarness('processing', {
    session: fixture.session,
    wxApi: storage.wxApi
  });

  harness.page.onLoad();
  runProcessingStages(harness);

  const durableReport = storage.values.get(REPORT_KEY);
  assert.notStrictEqual(durableReport, fixture.oldReport);
  assert.strictEqual(fixture.session.report, durableReport);
  assert.notStrictEqual(fixture.session.profile, fixture.oldProfile);
  assert.strictEqual(
    fixture.session.profile,
    storage.values.get(PROFILE_KEY)
  );
  assert.equal(
    isReportForProfile(fixture.session.report, fixture.session.profile),
    true
  );
  assert.equal(fixture.session.pendingRegeneration, undefined);
  assert.equal(harness.page.data.reportReady, true);
  assert.match(harness.page.data.statusText, /已恢复本机保存/);
});

test('profile write failure removes a new report when no previous durable report existed', () => {
  const fixture = regenerationFixture({ oldReport: null });
  const storage = createWxStorage({
    [PROFILE_KEY]: fixture.oldProfile
  });
  storage.setOutcomes.set(PROFILE_KEY, ['before']);
  const harness = createPageHarness('processing', {
    session: fixture.session,
    wxApi: storage.wxApi
  });

  harness.page.onLoad();
  runProcessingStages(harness);

  assert.equal(storage.values.has(REPORT_KEY), false);
  assert.strictEqual(storage.values.get(PROFILE_KEY), fixture.oldProfile);
  assert.equal(fixture.session.report, null);
  assert.strictEqual(fixture.session.profile, fixture.oldProfile);
  assert.equal(fixture.session.pendingRegeneration, undefined);
  assert.equal(harness.page.data.reportReady, false);
  assert.deepEqual(
    storage.calls.reLaunch.map(({ url }) => url),
    ['/pages/home/index']
  );
});

test('failed removal without a previous report repairs the durable generated pair', () => {
  const fixture = regenerationFixture({ oldReport: null });
  const storage = createWxStorage({
    [PROFILE_KEY]: fixture.oldProfile
  });
  storage.setOutcomes.set(PROFILE_KEY, ['before']);
  storage.removeOutcomes.set(REPORT_KEY, ['before']);
  const harness = createPageHarness('processing', {
    session: fixture.session,
    wxApi: storage.wxApi
  });

  harness.page.onLoad();
  runProcessingStages(harness);

  const durableReport = storage.values.get(REPORT_KEY);
  assert.ok(durableReport);
  assert.strictEqual(fixture.session.report, durableReport);
  assert.notStrictEqual(fixture.session.profile, fixture.oldProfile);
  assert.strictEqual(
    fixture.session.profile,
    storage.values.get(PROFILE_KEY)
  );
  assert.equal(
    isReportForProfile(fixture.session.report, fixture.session.profile),
    true
  );
  assert.equal(fixture.session.pendingRegeneration, undefined);
  assert.equal(harness.page.data.reportReady, true);
  assert.match(harness.page.data.statusText, /已恢复本机保存/);
});

test('processing unload suppresses stale generation and navigation callbacks', () => {
  const session = completeSession();
  const storage = createWxStorage();
  const harness = createPageHarness('processing', {
    session,
    wxApi: storage.wxApi
  });

  harness.page.onLoad();
  const stageJobs = [...harness.scheduler.jobs];
  harness.page.onUnload();
  stageJobs.forEach((job) => harness.scheduler.invoke(job));

  assert.equal(session.report, null);
  assert.deepEqual(storage.calls.setStorageSync, []);
  assert.deepEqual(storage.calls.navigateTo, []);
  assert.deepEqual(storage.calls.redirectTo, []);
});

test('manual report navigation wins the race with automatic navigation', () => {
  const storage = createWxStorage();
  const harness = createPageHarness('processing', {
    session: completeSession(),
    wxApi: storage.wxApi
  });

  harness.page.onLoad();
  runProcessingStages(harness);
  harness.page.onViewReport();
  harness.scheduler.runByDelay(1200);

  assert.deepEqual(
    storage.calls.redirectTo.map((call) => call.url),
    ['/pages/result/index']
  );
});

test('processing storage failure still exposes the session report with a visible warning', () => {
  const session = completeSession();
  const storage = createWxStorage();
  storage.failures.add(REPORT_KEY);
  const harness = createPageHarness('processing', {
    session,
    wxApi: storage.wxApi
  });

  harness.page.onLoad();
  runProcessingStages(harness);

  assert.ok(session.report);
  assert.equal(harness.page.data.reportReady, true);
  assert.deepEqual(
    storage.calls.showToast.map((call) => call.title),
    ['报告未保存，历史不会保留']
  );
});

test('result loads a valid stored fallback and replaces a corrupt session report', () => {
  const profile = generatedProfile();
  const report = generatedReport(profile);
  const storage = createWxStorage({
    [REPORT_KEY]: report,
    [PROFILE_KEY]: profile,
    [FAVORITES_KEY]: [],
    [FEEDBACK_KEY]: {}
  });
  const session = completeSession({
    report: {
      topRecommendations: [],
      sections: {
        color: [],
        hair: [],
        clothing: [],
        accessories: [],
        makeup: [],
        capsule: []
      }
    }
  });
  const harness = createPageHarness('result', {
    session,
    wxApi: storage.wxApi
  });

  harness.page.onLoad();

  assert.equal(harness.page.data.report.id, report.id);
  assert.equal(session.report.id, report.id);
  assert.equal(harness.page.data.sections.length, 6);
  assert.deepEqual(
    harness.page.data.reportSections.map(({ title }) => title),
    expectedResultSections
  );
  assert.deepEqual(storage.calls.reLaunch, []);
});

test('result loads a stored report with its matching stored profile instead of mixing session state', () => {
  const storedProfile = generatedProfile();
  const storedReport = generatedReport(storedProfile);
  const unrelatedSessionProfile = generatedProfile({
    scenes: ['travel'],
    desiredEffects: ['mobility']
  });
  const storage = createWxStorage({
    [REPORT_KEY]: storedReport,
    [PROFILE_KEY]: storedProfile,
    [FAVORITES_KEY]: [],
    [FEEDBACK_KEY]: {}
  });
  const session = completeSession({
    profile: unrelatedSessionProfile,
    report: null
  });
  const harness = createPageHarness('result', {
    session,
    wxApi: storage.wxApi
  });

  harness.page.onLoad();

  assert.strictEqual(storage.values.get(PROFILE_KEY), storedProfile);
  assert.strictEqual(session.report, storedReport);
  assert.deepEqual(session.profile, storedProfile);
  assert.equal(isReportForProfile(session.report, session.profile), true);
});

test('result never persists a session profile without its matching session report', () => {
  const storedProfile = generatedProfile();
  const storedReport = generatedReport(storedProfile);
  const sessionProfile = generatedProfile({
    scenes: ['travel'],
    desiredEffects: ['mobility']
  });
  const sessionReport = generatedReport(sessionProfile);
  const storage = createWxStorage({
    [REPORT_KEY]: storedReport,
    [PROFILE_KEY]: storedProfile,
    [FAVORITES_KEY]: [],
    [FEEDBACK_KEY]: {}
  });
  const session = completeSession({
    profile: sessionProfile,
    report: sessionReport
  });
  const harness = createPageHarness('result', {
    session,
    wxApi: storage.wxApi
  });

  harness.page.onLoad();

  assert.strictEqual(harness.page.data.report, sessionReport);
  assert.strictEqual(storage.values.get(REPORT_KEY), storedReport);
  assert.strictEqual(storage.values.get(PROFILE_KEY), storedProfile);
  assert.equal(
    isReportForProfile(
      storage.values.get(REPORT_KEY),
      storage.values.get(PROFILE_KEY)
    ),
    true
  );
});

test('result rejects a stored report whose stored profile belongs to another report', () => {
  const report = generatedReport(generatedProfile());
  const mismatchedProfile = generatedProfile({
    scenes: ['travel'],
    desiredEffects: ['mobility']
  });
  const storage = createWxStorage({
    [REPORT_KEY]: report,
    [PROFILE_KEY]: mismatchedProfile,
    [FAVORITES_KEY]: [],
    [FEEDBACK_KEY]: {}
  });
  const session = completeSession({ profile: null, report: null });
  const harness = createPageHarness('result', {
    session,
    wxApi: storage.wxApi
  });

  harness.page.onLoad();

  assert.equal(harness.page.data.report, null);
  assert.equal(session.report, null);
  assert.deepEqual(
    storage.calls.reLaunch.map(({ url }) => url),
    ['/pages/home/index']
  );
});

test('result renders the exact twelve-section native report and registers all four visual components', () => {
  const resultWxml = fs.readFileSync(
    path.join(miniprogramRoot, 'pages/result/index.wxml'),
    'utf8'
  );
  const resultConfig = JSON.parse(fs.readFileSync(
    path.join(miniprogramRoot, 'pages/result/index.json'),
    'utf8'
  ));

  let previousIndex = -1;
  for (const title of expectedResultSections) {
    const titleIndex = resultWxml.indexOf(title);
    assert.ok(titleIndex > previousIndex, `${title} must follow the approved order`);
    previousIndex = titleIndex;
  }
  assert.deepEqual(resultConfig.usingComponents, {
    'color-plan': '/components/color-plan/index',
    'garment-technical': '/components/garment-technical/index',
    'overall-look': '/components/overall-look/index',
    'outfit-collage': '/components/outfit-collage/index',
    'recommendation-card': '/components/recommendation-card/index'
  });
});

test('all three visual layers collapse and reopen without changing sibling state', () => {
  const report = generatedReport();
  const storage = createWxStorage({
    [FAVORITES_KEY]: [],
    [FEEDBACK_KEY]: {}
  });
  const harness = createPageHarness('result', {
    session: completeSession({ report }),
    wxApi: storage.wxApi
  });

  harness.page.onLoad();

  for (const section of ['overall', 'collage', 'technical']) {
    const siblings = ['overall', 'collage', 'technical'].filter(
      (candidate) => candidate !== section
    );
    harness.page.onToggleSection({
      currentTarget: { dataset: { section } }
    });

    assert.equal(harness.page.data.expandedSections[section], false, section);
    assert.ok(siblings.every(
      (sibling) => harness.page.data.expandedSections[sibling] === true
    ), `${section} collapse must preserve siblings`);

    harness.page.onToggleSection({
      currentTarget: { dataset: { section } }
    });
    assert.equal(harness.page.data.expandedSections[section], true, section);
  }
});

test('all three Top recommendations open and scroll to literal family evidence targets', () => {
  const report = generatedReport();
  const storage = createWxStorage({
    [FAVORITES_KEY]: [],
    [FEEDBACK_KEY]: {}
  });
  const harness = createPageHarness('result', {
    session: completeSession({ report }),
    wxApi: storage.wxApi
  });

  harness.page.onLoad();

  const expectations = [
    {
      family: 'color',
      section: 'color',
      target: 'section-color'
    },
    {
      family: 'clothing',
      section: 'technical',
      target: 'section-technical'
    },
    {
      family: 'hairColor',
      section: 'hair',
      target: 'section-hair'
    }
  ];

  for (const expectation of expectations) {
    const recommendation = harness.page.data.topRecommendations.find(
      ({ family }) => family === expectation.family
    );
    assert.deepEqual(
      {
        section: recommendation.evidenceSection,
        target: recommendation.evidenceTarget
      },
      {
        section: expectation.section,
        target: expectation.target
      }
    );

    harness.page.onViewEvidence({
      currentTarget: {
        dataset: {
          section: recommendation.evidenceSection,
          target: recommendation.evidenceTarget
        }
      }
    });
    assert.equal(
      harness.page.data.expandedSections[expectation.section],
      true
    );
  }

  assert.deepEqual(storage.calls.pageScrollTo, expectations.map(({ target }) => ({
    selector: `#${target}`,
    duration: 300
  })));
});

test('an invalid evidence section and target pair changes neither disclosure nor scroll', () => {
  const report = generatedReport();
  const storage = createWxStorage({
    [FAVORITES_KEY]: [],
    [FEEDBACK_KEY]: {}
  });
  const harness = createPageHarness('result', {
    session: completeSession({ report }),
    wxApi: storage.wxApi
  });
  harness.page.onLoad();
  const before = structuredClone(harness.page.data.expandedSections);

  harness.page.onViewEvidence({
    currentTarget: {
      dataset: { section: 'color', target: 'section-hair' }
    }
  });

  assert.deepEqual(harness.page.data.expandedSections, before);
  assert.deepEqual(storage.calls.pageScrollTo, []);
});

test('color plan rows preserve changed controlled colors, percentages, and placements', () => {
  const componentModule = loadComponentModule('color-plan');
  assert.equal(
    typeof componentModule.exports.buildColorPlanRows,
    'function',
    'color-plan must expose its input-derived view model'
  );
  const input = {
    main: { name: '森林绿', hex: '#214E3A', percentage: 50 },
    secondary: { name: '纯白', hex: '#FFFFFF', percentage: 35 },
    accent: { name: '金色', hex: '#C6A15B', percentage: 15 },
    nearFace: ['纯白', '雾蓝'],
    lowerBody: ['森林绿', '炭灰'],
    accessories: ['金色', '银色'],
    alternatives: ['藏青'],
    reason: 'changed fixture',
    screenColorDisclaimer: 'changed disclaimer'
  };

  const expectedRows = [
    {
      key: 'main',
      roleLabel: '主色',
      name: '森林绿',
      hex: '#214E3A',
      percentage: 50,
      locationLabel: '下装可用',
      placements: ['森林绿', '炭灰']
    },
    {
      key: 'secondary',
      roleLabel: '辅助色',
      name: '纯白',
      hex: '#FFFFFF',
      percentage: 35,
      locationLabel: '近脸可用',
      placements: ['纯白', '雾蓝']
    },
    {
      key: 'accent',
      roleLabel: '点缀色',
      name: '金色',
      hex: '#C6A15B',
      percentage: 15,
      locationLabel: '配饰可用',
      placements: ['金色', '银色']
    }
  ];
  assert.deepEqual(
    componentModule.exports.buildColorPlanRows(input),
    expectedRows
  );

  let observedData = {};
  componentModule.definition.properties.plan.observer.call({
    setData(patch) {
      observedData = { ...observedData, ...patch };
    }
  }, input);
  assert.deepEqual(observedData.rows, expectedRows);

  const componentWxml = fs.readFileSync(
    path.join(miniprogramRoot, 'components/color-plan/index.wxml'),
    'utf8'
  );
  for (const binding of [
    'row.roleLabel',
    'row.name',
    'row.percentage',
    'row.locationLabel',
    'row.placements'
  ]) {
    assert.match(componentWxml, new RegExp(binding.replace('.', '\\.')));
  }
});

test('four visual components render every required non-color label from report data', () => {
  const componentExpectations = {
    'color-plan': [
      'row.roleLabel', 'row.name', 'row.percentage', 'row.locationLabel',
      'row.placements', 'plan.alternatives', 'plan.screenColorDisclaimer'
    ],
    'overall-look': [
      'layer.assetPath', 'layer.alt', 'color.name', 'color.percentage',
      'layer.hairColorSwatch.name', 'layer.focusLabel', 'layer.disclaimer'
    ],
    'outfit-collage': [
      'item.assetPath', 'item.name', 'item.colorName',
      'item.fitKeywords', 'item.alternative', 'layer.disclaimer'
    ],
    'garment-technical': [
      'layer.assetPath', 'layer.alt', 'item.label',
      'item.value', 'layer.disclaimer'
    ]
  };

  for (const [component, values] of Object.entries(componentExpectations)) {
    const wxml = fs.readFileSync(
      path.join(miniprogramRoot, `components/${component}/index.wxml`),
      'utf8'
    );
    for (const value of values) {
      assert.match(wxml, new RegExp(value.replace('.', '\\.')), `${component}: ${value}`);
    }
  }
});

test('recommendation cards expose scene rationale, evidence, alternative, cost and trend metadata', () => {
  const wxml = fs.readFileSync(
    path.join(miniprogramRoot, 'components/recommendation-card/index.wxml'),
    'utf8'
  );

  for (const value of [
    'item.action',
    'item.reason',
    'item.basisLabels',
    'item.alternative',
    'item.maintenanceBudgetTip',
    'item.trendValidUntil'
  ]) {
    assert.match(wxml, new RegExp(value.replace('.', '\\.')));
  }
  assert.match(wxml, /为什么适合本次场景/);
  assert.match(wxml, /仅在趋势项中显示/);
});

test('result marks only traceable recommendations as feedback eligible and gates the controls', () => {
  const report = generatedReport();
  const storage = createWxStorage({
    [FAVORITES_KEY]: [],
    [FEEDBACK_KEY]: {}
  });
  const harness = createPageHarness('result', {
    session: completeSession({ report }),
    wxApi: storage.wxApi
  });
  harness.page.onLoad();

  const recommendations = harness.page.data.sections.flatMap(
    (section) => section.recommendations
  );
  assert.ok(recommendations.some(({ feedbackEligible }) => !feedbackEligible));
  for (const recommendation of recommendations) {
    assert.equal(
      recommendation.feedbackEligible,
      recommendation.appliedRuleIds.length > 0,
      recommendation.family
    );
  }

  const wxml = fs.readFileSync(
    path.join(
      miniprogramRoot,
      'components/recommendation-card/index.wxml'
    ),
    'utf8'
  );
  assert.match(
    wxml,
    /<block wx:if="{{item\.feedbackEligible}}">[\s\S]*bindtap="onFeedbackChange"[\s\S]*<\/block>/
  );
});

test('result feedback eligibility rejects nonexistent and wrong-family rule ids', () => {
  const report = generatedReport();
  const recommendation = report.sections.hairColor[0];
  const clothingRuleId = report.sections.clothing[0].appliedRuleIds[0];
  const { buildReportViewData } = loadResultHelpers();

  assert.equal(
    buildReportViewData(report, [], {}).hairRecommendations
      .find(({ id }) => id === recommendation.id).feedbackEligible,
    true
  );

  recommendation.appliedRuleIds = ['fabricated-rule'];
  assert.equal(
    buildReportViewData(report, [], {}).hairRecommendations
      .find(({ id }) => id === recommendation.id).feedbackEligible,
    false
  );

  recommendation.appliedRuleIds = [clothingRuleId];
  assert.equal(
    buildReportViewData(report, [], {}).hairRecommendations
      .find(({ id }) => id === recommendation.id).feedbackEligible,
    false
  );
});

test('a cross-section duplicate id makes the whole feedback registry ineligible', () => {
  const report = generatedReport();
  const clothing = report.sections.clothing[0];
  report.sections.hairColor[0].id = clothing.id;
  const { buildReportViewData, isUsableReport } = loadResultHelpers();

  const view = buildReportViewData(report, [], {});

  assert.equal(isUsableReport(report), false);
  assert.equal(
    view.sections
      .flatMap(({ recommendations }) => recommendations)
      .some(({ feedbackEligible }) => feedbackEligible),
    false
  );
});

test('result rejects a corrupt stored report and safely returns home', () => {
  const report = generatedReport();
  report.topRecommendations.pop();
  const storage = createWxStorage({ [REPORT_KEY]: report });
  const harness = createPageHarness('result', {
    session: completeSession(),
    wxApi: storage.wxApi
  });

  harness.page.onLoad();

  assert.deepEqual(
    storage.calls.reLaunch.map((call) => call.url),
    ['/pages/home/index']
  );
  assert.equal(harness.page.data.report, null);
});

test('favorite and feedback write failures leave visible report state unchanged', () => {
  const report = generatedReport();
  const storage = createWxStorage({
    [FAVORITES_KEY]: [],
    [FEEDBACK_KEY]: {}
  });
  const session = completeSession({ report });
  const harness = createPageHarness('result', {
    session,
    wxApi: storage.wxApi
  });
  harness.page.onLoad();
  const id = report.sections.clothing[0].id;
  const beforeSections = structuredClone(harness.page.data.sections);

  storage.failures.add(FAVORITES_KEY);
  harness.page.onFavoriteChange({ detail: { id } });
  storage.failures.add(FEEDBACK_KEY);
  harness.page.onFeedbackChange({ detail: { id, state: 'tried' } });

  assert.deepEqual(harness.page.data.favoriteIds, []);
  assert.deepEqual(harness.page.data.feedbackMap, {});
  assert.deepEqual(harness.page.data.sections, beforeSections);
  assert.deepEqual(
    storage.calls.showToast.map((call) => call.title),
    ['收藏保存失败，请重试', '反馈保存失败，请重试']
  );
});

test('confirmed reset remains locked while relaunch is pending and ignores a second tap', () => {
  const report = generatedReport();
  const storage = createWxStorage({
    [FAVORITES_KEY]: [],
    [FEEDBACK_KEY]: {}
  });
  let resets = 0;
  const session = completeSession({ report });
  const app = {
    globalData: { session },
    resetSession() {
      resets += 1;
      this.globalData.session = completeSession();
    }
  };
  const harness = createPageHarness('result', {
    session,
    app,
    wxApi: storage.wxApi
  });
  harness.page.onLoad();

  harness.page.onReanalyze();
  harness.invoke(() => storage.calls.showModal[0].success({ confirm: true }));
  harness.page.onReanalyze();

  assert.equal(storage.calls.showModal.length, 1);
  assert.equal(storage.calls.reLaunch.length, 1);
  assert.equal(resets, 1);
  assert.equal(harness.page.data.confirmingReset, true);
});

test('failed reset relaunch unlocks the action and shows a recoverable warning', () => {
  const report = generatedReport();
  const storage = createWxStorage({
    [FAVORITES_KEY]: [],
    [FEEDBACK_KEY]: {}
  });
  const session = completeSession({ report });
  const app = {
    globalData: { session },
    resetSession() {
      this.globalData.session = completeSession();
    }
  };
  const harness = createPageHarness('result', {
    session,
    app,
    wxApi: storage.wxApi
  });
  harness.page.onLoad();

  harness.page.onReanalyze();
  harness.invoke(() => storage.calls.showModal[0].success({ confirm: true }));
  harness.invoke(() => storage.calls.reLaunch[0].fail());

  assert.equal(harness.page.data.confirmingReset, false);
  assert.equal(session.pendingRegeneration, undefined);
  assert.strictEqual(session.report, report);
  assert.deepEqual(
    storage.calls.showToast.map((call) => call.title),
    ['暂时无法重新开始，请重试']
  );
});

test('an older no-profile relaunch failure cannot unlock a newer confirmation', () => {
  const report = generatedReport();
  const storage = createWxStorage({
    [FAVORITES_KEY]: [],
    [FEEDBACK_KEY]: {}
  });
  let resets = 0;
  const session = completeSession({ report });
  const app = {
    globalData: { session },
    resetSession() {
      resets += 1;
      this.globalData.session = completeSession();
    }
  };
  const harness = createPageHarness('result', {
    session,
    app,
    wxApi: storage.wxApi
  });
  harness.page.onLoad();
  harness.page.onReanalyze();
  harness.invoke(() => storage.calls.showModal[0].success({ confirm: true }));
  harness.invoke(() => storage.calls.reLaunch[0].fail());
  harness.page.onReanalyze();
  const toastCount = storage.calls.showToast.length;

  harness.invoke(() => storage.calls.reLaunch[0].fail());

  assert.equal(storage.calls.showModal.length, 2);
  assert.equal(harness.page.data.confirmingReset, true);
  assert.equal(storage.calls.showToast.length, toastCount);
  assert.equal(storage.calls.reLaunch.length, 1);
  assert.equal(resets, 1);
});

test('no-profile relaunch callbacks are one-shot and cannot disturb a newer reset operation', () => {
  const report = generatedReport();
  const storage = createWxStorage({
    [FAVORITES_KEY]: [],
    [FEEDBACK_KEY]: {}
  });
  let resets = 0;
  const session = completeSession({ report });
  const app = {
    globalData: { session },
    resetSession() {
      resets += 1;
      this.globalData.session = completeSession();
    }
  };
  const harness = createPageHarness('result', {
    session,
    app,
    wxApi: storage.wxApi
  });
  harness.page.onLoad();
  harness.page.onReanalyze();
  harness.invoke(() => storage.calls.showModal[0].success({ confirm: true }));
  harness.invoke(() => storage.calls.reLaunch[0].fail());
  harness.page.onReanalyze();
  harness.invoke(() => storage.calls.showModal[1].success({ confirm: true }));
  const toastCount = storage.calls.showToast.length;

  assert.equal(typeof storage.calls.reLaunch[0].success, 'function');
  assert.equal(typeof storage.calls.reLaunch[1].success, 'function');
  harness.invoke(() => storage.calls.reLaunch[0].success());
  harness.invoke(() => storage.calls.reLaunch[0].fail());
  harness.invoke(() => storage.calls.reLaunch[1].success());
  harness.invoke(() => storage.calls.reLaunch[1].success());
  harness.invoke(() => storage.calls.reLaunch[1].fail());

  assert.equal(storage.calls.showModal.length, 2);
  assert.equal(storage.calls.reLaunch.length, 2);
  assert.equal(resets, 2);
  assert.equal(harness.page.data.confirmingReset, true);
  assert.equal(storage.calls.showToast.length, toastCount);
});

test('canceling reset unlocks the action without resetting or relaunching', () => {
  const report = generatedReport();
  const storage = createWxStorage({
    [FAVORITES_KEY]: [],
    [FEEDBACK_KEY]: {}
  });
  let resets = 0;
  const session = completeSession({ report });
  const app = {
    globalData: { session },
    resetSession() {
      resets += 1;
    }
  };
  const harness = createPageHarness('result', {
    session,
    app,
    wxApi: storage.wxApi
  });
  harness.page.onLoad();

  harness.page.onReanalyze();
  harness.invoke(() => storage.calls.showModal[0].success({ confirm: false }));

  assert.equal(harness.page.data.confirmingReset, false);
  assert.equal(resets, 0);
  assert.deepEqual(storage.calls.reLaunch, []);
});

test('modal open failure unlocks reset, warns, and allows a later retry', () => {
  const report = generatedReport();
  const storage = createWxStorage({
    [FAVORITES_KEY]: [],
    [FEEDBACK_KEY]: {}
  });
  let resets = 0;
  const session = completeSession({ report });
  const app = {
    globalData: { session },
    resetSession() {
      resets += 1;
    }
  };
  storage.wxApi.showModal = (options) => {
    storage.calls.showModal.push(options);
    options.fail({ errMsg: 'showModal:fail unavailable' });
  };
  const harness = createPageHarness('result', {
    session,
    app,
    wxApi: storage.wxApi
  });
  harness.page.onLoad();

  harness.page.onReanalyze();

  assert.equal(harness.page.data.confirmingReset, false);
  assert.equal(resets, 0);
  assert.deepEqual(storage.calls.reLaunch, []);
  assert.deepEqual(
    storage.calls.showToast.map((call) => call.title),
    ['暂时无法确认，请重试']
  );

  harness.page.onReanalyze();
  assert.equal(storage.calls.showModal.length, 2);
});

test('recommendation card emits favorite and feedback payload details by recommendation id', () => {
  const item = { id: 'rec-a' };
  const harness = createComponentHarness(
    'components/recommendation-card/index.js',
    { item, favorite: false, feedback: '' }
  );

  harness.component.onFavoriteChange();
  harness.component.onFeedbackChange({
    currentTarget: { dataset: { state: 'not-for-me' } }
  });

  assert.deepEqual(harness.events, [
    { name: 'favoritechange', detail: { id: 'rec-a' } },
    {
      name: 'feedbackchange',
      detail: { id: 'rec-a', state: 'not-for-me' }
    }
  ]);
});

test('recommendation card exposes and emits every approved feedback state', () => {
  const states = ['liked', 'owned', 'tried', 'not-for-me', 'suppress-similar'];
  const markup = fs.readFileSync(
    path.join(
      miniprogramRoot,
      'components/recommendation-card/index.wxml'
    ),
    'utf8'
  );
  const harness = createComponentHarness(
    'components/recommendation-card/index.js',
    {
      item: { id: 'rec-a', family: 'clothing' },
      favorite: false,
      feedback: ''
    }
  );

  for (const state of states) {
    assert.match(markup, new RegExp(`data-state="${state}"`), state);
    harness.component.onFeedbackChange({
      currentTarget: { dataset: { state } }
    });
  }

  assert.deepEqual(
    harness.events,
    states.map((state) => ({
      name: 'feedbackchange',
      detail: { id: 'rec-a', state }
    }))
  );
});
