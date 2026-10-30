const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  clearPhotoState,
  nextRequiredRoute: routeForSession
} = require('../apps/miniprogram/utils/flow-state');
const { safeNavigate } = require('../apps/miniprogram/utils/navigation');
const {
  createDefaultAppearance,
  createDefaultPreferences,
  confirmAppearance
} = require('../apps/miniprogram/services/profile-contract');
const {
  generateReport
} = require('../apps/miniprogram/services/recommendation-engine');

const miniprogramRoot = path.resolve(__dirname, '../apps/miniprogram');
const consentTicket = Object.freeze({
  adult: true,
  mode: 'photo',
  ownPhoto: true,
  photoProcessing: true
});

function nextRequiredRoute(session) {
  return routeForSession({
    analysisMode: 'photo',
    consentTicket,
    profileDraft: { presentationMode: 'neutral', scenes: ['commute'] },
    photoKind: 'portrait',
    ...session
  });
}

test('manual flow bypasses capture after the profile draft exists', () => {
  assert.equal(nextRequiredRoute({
    analysisMode: 'manual',
    consentTicket: { adult: true, mode: 'manual' },
    profileDraft: { presentationMode: 'neutral', scenes: ['commute'] },
    features: null
  }), '/pages/feature-review/index');
});

test('photo flow requires a photo after the same profile step', () => {
  assert.equal(nextRequiredRoute({
    analysisMode: 'photo',
    consentTicket: {
      adult: true,
      mode: 'photo',
      ownPhoto: true,
      photoProcessing: true
    },
    profileDraft: { presentationMode: 'neutral', scenes: ['commute'] },
    photoPath: '',
    photoMeta: null
  }), '/pages/capture/index');
});

function preferenceSession(overrides = {}) {
  return {
    photoPath: 'wxfile://local.jpg',
    photoMeta: {
      path: 'wxfile://local.jpg',
      width: 1080,
      height: 1440,
      size: 1200000
    },
    qualityResult: { passed: true },
    features: {
      line: 'balanced',
      value: 'medium',
      temperature: 'neutral',
      presence: 'medium',
      contrast: 'medium'
    },
    preferences: null,
    report: null,
    ...overrides
  };
}

function loadPage(route, session, wxApi = {}) {
  if (!Object.prototype.hasOwnProperty.call(session, 'consentTicket')) {
    Object.defineProperty(session, 'consentTicket', {
      value: { ...consentTicket },
      writable: true,
      configurable: true,
      enumerable: false
    });
  }
  for (const [key, value] of Object.entries({
    analysisMode: 'photo',
    profileDraft: { presentationMode: 'neutral', scenes: ['commute'] },
    photoKind: 'portrait'
  })) {
    if (!Object.prototype.hasOwnProperty.call(session, key)) {
      Object.defineProperty(session, key, {
        value,
        writable: true,
        configurable: true,
        enumerable: true
      });
    }
  }
  const pagePath = path.join(miniprogramRoot, 'pages', route, 'index.js');
  const previousPage = global.Page;
  const previousGetApp = global.getApp;
  const previousWx = global.wx;
  let definition;

  try {
    global.Page = (config) => {
      definition = config;
    };
    global.getApp = () => ({ globalData: { session } });
    global.wx = wxApi;
    delete require.cache[require.resolve(pagePath)];
    require(pagePath);
  } finally {
    global.Page = previousPage;
    global.getApp = previousGetApp;
    global.wx = previousWx;
  }

  const page = {
    ...definition,
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(patch) {
      this.data = { ...this.data, ...patch };
    }
  };

  for (const [name, handler] of Object.entries(definition)) {
    if (typeof handler !== 'function') continue;
    page[name] = function invokePageHandler(...args) {
      const currentGetApp = global.getApp;
      const currentWx = global.wx;
      global.getApp = () => ({ globalData: { session } });
      global.wx = wxApi;
      try {
        return handler.apply(this, args);
      } finally {
        global.getApp = currentGetApp;
        global.wx = currentWx;
      }
    };
  }

  return page;
}

function withCurrentPages(pages, callback) {
  const previousGetCurrentPages = global.getCurrentPages;
  global.getCurrentPages = () => pages;
  try {
    return callback();
  } finally {
    if (previousGetCurrentPages === undefined) {
      delete global.getCurrentPages;
    } else {
      global.getCurrentPages = previousGetCurrentPages;
    }
  }
}

test('a new session resumes at photo capture after consent', () => {
  assert.equal(nextRequiredRoute({
    photoPath: '',
    photoMeta: null,
    qualityResult: null,
    features: null,
    preferences: null,
    report: null
  }), '/pages/capture/index');
});

test('clearPhotoState removes photo-derived state without mutating the input', () => {
  const before = {
    photoKind: 'portrait',
    photoPath: 'wxfile://local.jpg',
    photoMeta: { width: 1080 },
    qualityResult: { passed: true },
    appearanceCandidates: { faceOutline: 'round' },
    features: { line: 'balanced' },
    profileDraft: { presentationMode: 'neutral', scenes: ['commute'] },
    preferences: { scene: 'commute' },
    report: { id: 'report-1' }
  };

  const after = clearPhotoState(before);

  assert.deepEqual(after, {
    photoKind: '',
    photoPath: '',
    photoMeta: null,
    qualityResult: null,
    appearanceCandidates: null,
    features: null,
    profileDraft: { presentationMode: 'neutral', scenes: ['commute'] },
    preferences: { scene: 'commute' },
    report: { id: 'report-1' }
  });
  assert.notStrictEqual(after, before);
  assert.deepEqual(before, {
    photoKind: 'portrait',
    photoPath: 'wxfile://local.jpg',
    photoMeta: { width: 1080 },
    qualityResult: { passed: true },
    appearanceCandidates: { faceOutline: 'round' },
    features: { line: 'balanced' },
    profileDraft: { presentationMode: 'neutral', scenes: ['commute'] },
    preferences: { scene: 'commute' },
    report: { id: 'report-1' }
  });
});

test('profile saves manual context, preserves appearance, and invalidates downstream results', () => {
  const visited = [];
  const session = {
    analysisMode: 'manual',
    consentTicket: { adult: true, mode: 'manual' },
    profileDraft: null,
    features: { line: 'balanced' },
    preferences: { scene: 'commute' },
    report: { id: 'stale-report' }
  };
  const page = loadPage('profile', session, {
    navigateTo({ url }) { visited.push(url); }
  });

  page.onLoad();
  page.onPresentationModeChange({ detail: { value: 'neutral' } });
  page.onScenesChange({ detail: { value: ['commute'] } });
  page.onActivityContextChange({ detail: { value: ['indoor'] } });
  page.onDesiredEffectsChange({ detail: { value: ['clean'] } });
  page.onSubmit();

  assert.deepEqual(session.profileDraft, {
    presentationMode: 'neutral',
    scenes: ['commute'],
    cityOrClimateText: '',
    activityContext: ['indoor'],
    desiredEffects: ['clean']
  });
  assert.equal(session.report, null);
  assert.deepEqual(session.features, { line: 'balanced' });
  assert.equal(session.preferences, null);
  assert.deepEqual(visited, ['/pages/feature-review/index']);
});

test('profile sends photo-assisted sessions to capture without claiming analysis', () => {
  const visited = [];
  const session = {
    analysisMode: 'photo',
    consentTicket: { adult: true, mode: 'photo', ownPhoto: true, photoProcessing: true },
    profileDraft: null,
    report: null
  };
  const page = loadPage('profile', session, {
    navigateTo({ url }) { visited.push(url); }
  });

  page.onLoad();
  page.onPresentationModeChange({ detail: { value: 'neutral' } });
  page.onScenesChange({ detail: { value: ['commute'] } });
  page.onActivityContextChange({ detail: { value: ['indoor'] } });
  page.onDesiredEffectsChange({ detail: { value: ['clean'] } });
  page.onSubmit();

  assert.deepEqual(visited, ['/pages/capture/index']);
});

test('profile round trip preserves fit preference and optional measurements', () => {
  const visited = [];
  const session = {
    analysisMode: 'manual',
    consentTicket: { adult: true, mode: 'manual' },
    profileDraft: {
      presentationMode: 'neutral',
      scenes: ['commute'],
      cityOrClimateText: '',
      activityContext: ['indoor'],
      desiredEffects: ['clean'],
      fitPreference: 'relaxed',
      manualMeasurements: { heightCm: 170, waistCm: 72 }
    },
    features: null,
    preferences: null,
    report: null
  };
  const page = loadPage('profile', session, {
    navigateTo({ url }) {
      visited.push(url);
    }
  });

  page.onLoad();
  page.onCityOrClimateInput({ detail: { value: '杭州' } });
  page.onSubmit();

  assert.equal(session.profileDraft.fitPreference, 'relaxed');
  assert.deepEqual(session.profileDraft.manualMeasurements, {
    heightCm: 170,
    waistCm: 72
  });
  assert.equal(session.profileDraft.cityOrClimateText, '杭州');
  assert.deepEqual(visited, ['/pages/feature-review/index']);
});

test('profile round trip preserves an unselected fit preference', () => {
  const session = {
    analysisMode: 'manual',
    consentTicket: { adult: true, mode: 'manual' },
    profileDraft: {
      presentationMode: 'neutral',
      scenes: ['commute'],
      cityOrClimateText: '',
      activityContext: ['indoor'],
      desiredEffects: ['clean'],
      manualMeasurements: null
    },
    features: null,
    preferences: null,
    report: null
  };
  const page = loadPage('profile', session, { navigateTo() {} });

  page.onLoad();
  page.onSubmit();

  assert.equal(
    Object.prototype.hasOwnProperty.call(session.profileDraft, 'fitPreference'),
    false
  );
  assert.equal(session.profileDraft.manualMeasurements, null);
});

test('profile rejects empty required activity and desired-effect choices', () => {
  const visited = [];
  const session = {
    analysisMode: 'manual',
    consentTicket: { adult: true, mode: 'manual' },
    profileDraft: null,
    features: { line: 'balanced' },
    preferences: { scene: 'commute' },
    report: { id: 'stale-report' }
  };
  const page = loadPage('profile', session, {
    navigateTo({ url }) {
      visited.push(url);
    }
  });

  page.onLoad();
  page.onPresentationModeChange({ detail: { value: 'neutral' } });
  page.onScenesChange({ detail: { value: ['commute'] } });
  page.onSubmit();

  assert.match(page.data.errors.activityContext, /至少选择/);
  assert.match(page.data.errors.desiredEffects, /至少选择/);
  assert.equal(session.profileDraft, null);
  assert.deepEqual(session.features, { line: 'balanced' });
  assert.deepEqual(session.preferences, { scene: 'commute' });
  assert.deepEqual(session.report, { id: 'stale-report' });
  assert.deepEqual(visited, []);
});

test('a session with photo metadata resumes at quality check', () => {
  assert.equal(nextRequiredRoute({
    photoPath: 'wxfile://local.jpg',
    photoMeta: { width: 1080, height: 1440, size: 1200000 },
    qualityResult: null,
    features: null,
    preferences: null,
    report: null
  }), '/pages/quality-check/index');
});

test('a path without photo metadata resumes at capture', () => {
  assert.equal(nextRequiredRoute({
    photoPath: 'wxfile://local.jpg',
    photoMeta: null,
    qualityResult: { passed: true },
    features: { line: 'balanced' },
    preferences: { scene: 'commute', styles: ['natural'] },
    report: { id: 'stale-report' }
  }), '/pages/capture/index');
});

test('photo metadata without a path resumes at capture', () => {
  assert.equal(nextRequiredRoute({
    photoPath: '',
    photoMeta: { width: 1080, height: 1440, size: 1200000 },
    qualityResult: { passed: true },
    features: { line: 'balanced' },
    preferences: { scene: 'commute', styles: ['natural'] },
    report: { id: 'stale-report' }
  }), '/pages/capture/index');
});

test('a passed quality result without confirmed features resumes at feature review', () => {
  assert.equal(nextRequiredRoute({
    photoPath: 'wxfile://local.jpg',
    photoMeta: { width: 1080, height: 1440, size: 1200000 },
    qualityResult: { passed: true },
    features: null,
    preferences: null,
    report: null
  }), '/pages/feature-review/index');
});

test('a failed quality result never advances past quality check', () => {
  assert.equal(nextRequiredRoute({
    photoPath: 'wxfile://local.jpg',
    photoMeta: { width: 1080, height: 1440, size: 1200000 },
    qualityResult: { passed: false },
    features: { line: 'balanced' },
    preferences: { scene: 'commute', styles: ['natural'] },
    report: null
  }), '/pages/quality-check/index');
});

test('confirmed features without preferences resume at preferences', () => {
  assert.equal(nextRequiredRoute({
    photoPath: 'wxfile://local.jpg',
    photoMeta: { width: 1080, height: 1440, size: 1200000 },
    qualityResult: { passed: true },
    features: { line: 'balanced' },
    preferences: null,
    report: null
  }), '/pages/preferences/index');
});

test('completed preferences resume at processing', () => {
  assert.equal(nextRequiredRoute({
    photoPath: 'wxfile://local.jpg',
    photoMeta: { width: 1080, height: 1440, size: 1200000 },
    qualityResult: { passed: true },
    features: { line: 'balanced' },
    preferences: {
      scene: 'commute',
      styles: ['natural'],
      budget: 'moderate',
      makeup: 'light',
      doNotChange: []
    },
    report: null
  }), '/pages/processing/index');
});

test('a complete valid session with a report resumes at result', () => {
  assert.equal(nextRequiredRoute({
    photoPath: 'wxfile://local.jpg',
    photoMeta: { width: 1080, height: 1440, size: 1200000 },
    qualityResult: { passed: true },
    features: { line: 'balanced' },
    preferences: {
      scene: 'commute',
      styles: ['natural'],
      budget: 'moderate',
      makeup: 'light',
      doNotChange: []
    },
    report: { id: 'report-1' }
  }), '/pages/result/index');
});

test('quality check redirects either incomplete photo state to capture', () => {
  for (const session of [
    { photoPath: 'wxfile://local.jpg', photoMeta: null },
    { photoPath: '', photoMeta: { width: 1080, height: 1440, size: 1200000 } }
  ]) {
    const redirects = [];
    const page = loadPage('quality-check', session, {
      redirectTo({ url }) {
        redirects.push(url);
      }
    });

    page.onLoad();

    assert.deepEqual(redirects, ['/pages/capture/index']);
    assert.equal(session.qualityResult, undefined);
  }
});

test('passed quality creates no appearance draft and feature confirmation starts unknown', () => {
  const photoPath = 'wxfile://local-1.jpg';
  const photoMeta = {
    path: photoPath,
    width: 1080,
    height: 1440,
    size: 1200000,
    type: 'image/jpeg',
    decoded: true
  };
  const visited = [];
  const session = {
    photoPath,
    photoMeta,
    qualityResult: { passed: true, featureDraft: { line: 'soft' } },
    features: { line: 'balanced' },
    preferences: { scene: 'date', styles: ['vintage'] },
    report: { id: 'stale-report' }
  };
  const page = loadPage('quality-check', session, {
    navigateTo({ url }) {
      visited.push(url);
    }
  });

  page.onLoad();

  assert.equal(session.qualityResult.passed, true);
  assert.equal(session.features, null);
  assert.equal(session.preferences, null);
  assert.equal(session.report, null);
  assert.equal(session.photoPath, photoPath);
  assert.strictEqual(session.photoMeta, photoMeta);
  assert.equal(page.data.checks.length, 5);
  assert.ok(page.data.checks.every((check) => check.basisLabel === '本地文件信息'));
  assert.equal(session.qualityResult.featureDraft, undefined);
  assert.equal(nextRequiredRoute(session), '/pages/feature-review/index');

  const featurePage = loadPage('feature-review', session, {
    navigateTo({ url }) {
      visited.push(url);
    }
  });
  featurePage.onLoad();
  assert.deepEqual(featurePage.data.draft, createDefaultAppearance());
  featurePage.onContinue();

  assert.deepEqual(session.features, createDefaultAppearance());
  assert.equal(nextRequiredRoute(session), '/pages/preferences/index');
  assert.deepEqual(visited, ['/pages/preferences/index']);
});

test('failed quality inspection clears all downstream state and creates no draft', () => {
  const photoPath = 'wxfile://too-small.jpg';
  const photoMeta = { path: photoPath, width: 320, height: 320, size: 200000 };
  const session = {
    photoPath,
    photoMeta,
    qualityResult: { passed: true, featureDraft: { line: 'soft' } },
    features: { line: 'balanced' },
    preferences: { scene: 'commute', styles: ['natural'] },
    report: { id: 'stale-report' }
  };
  const page = loadPage('quality-check', session);

  page.onLoad();

  assert.equal(session.qualityResult.passed, false);
  assert.equal(session.qualityResult.featureDraft, undefined);
  assert.equal(session.features, null);
  assert.equal(session.preferences, null);
  assert.equal(session.report, null);
  assert.equal(session.photoPath, photoPath);
  assert.strictEqual(session.photoMeta, photoMeta);
  assert.equal(nextRequiredRoute(session), '/pages/quality-check/index');
});

test('failed quality cannot continue and offers only recovery navigation', () => {
  const visited = [];
  const session = {
    photoPath: 'wxfile://local.jpg',
    photoMeta: { path: 'wxfile://local.jpg', width: 1080, height: 1440, size: 1200000 },
    qualityResult: { passed: false },
    features: { line: 'balanced' },
    preferences: { scene: 'commute', styles: ['natural'] },
    report: null
  };
  const page = loadPage('quality-check', session, {
    navigateBack({ delta }) {
      visited.push(['navigateBack', delta]);
    },
    redirectTo({ url }) {
      visited.push(['redirectTo', url]);
    },
    showToast() {}
  });
  page.data.result = session.qualityResult;

  page.onContinue();
  assert.deepEqual(visited, []);

  withCurrentPages([
    { route: 'pages/capture/index' },
    { route: 'pages/quality-check/index' }
  ], () => page.onReselect());
  assert.deepEqual(visited, [['navigateBack', 1]]);
  assert.deepEqual(session, {
    analysisMode: 'photo',
    profileDraft: { presentationMode: 'neutral', scenes: ['commute'] },
    photoKind: '',
    photoPath: '',
    photoMeta: null,
    qualityResult: null,
    appearanceCandidates: null,
    features: null,
    preferences: null,
    report: null
  });
});

test('quality reselect redirects to capture when redirect navigation replaced the capture page', () => {
  const visited = [];
  const session = {
    analysisMode: 'photo',
    photoPath: 'wxfile://local.jpg',
    photoMeta: {
      path: 'wxfile://local.jpg',
      width: 320,
      height: 320,
      size: 200000
    },
    qualityResult: { passed: false },
    features: null,
    preferences: null,
    report: null
  };
  const page = loadPage('quality-check', session, {
    navigateBack({ delta }) {
      visited.push(['navigateBack', delta]);
    },
    redirectTo({ url }) {
      visited.push(['redirectTo', url]);
    }
  });

  withCurrentPages([
    { route: 'pages/profile/index' },
    { route: 'pages/quality-check/index' }
  ], () => page.onReselect());

  assert.deepEqual(visited, [
    ['redirectTo', '/pages/capture/index']
  ]);
});

test('quality reselect redirects to capture when navigating back to capture fails', () => {
  const visited = [];
  const session = {
    analysisMode: 'photo',
    photoPath: 'wxfile://local.jpg',
    photoMeta: {
      path: 'wxfile://local.jpg',
      width: 320,
      height: 320,
      size: 200000
    },
    qualityResult: { passed: false },
    features: null,
    preferences: null,
    report: null
  };
  const page = loadPage('quality-check', session, {
    navigateBack({ delta, fail }) {
      visited.push(['navigateBack', delta]);
      fail();
    },
    redirectTo({ url }) {
      visited.push(['redirectTo', url]);
    }
  });

  withCurrentPages([
    { route: 'pages/capture/index' },
    { route: 'pages/quality-check/index' }
  ], () => page.onReselect());

  assert.deepEqual(visited, [
    ['navigateBack', 1],
    ['redirectTo', '/pages/capture/index']
  ]);
});

test('feature review exposes every manual appearance field with an unknown choice', () => {
  const session = {
    photoPath: 'wxfile://local.jpg',
    photoMeta: { path: 'wxfile://local.jpg', width: 1080, height: 1440, size: 1200000 },
    qualityResult: { passed: true },
    features: null,
    preferences: null,
    report: null
  };
  const page = loadPage('feature-review', session);

  page.onLoad();

  assert.equal(page.data.appearanceGroups.length, 3);
  assert.ok(page.data.appearanceGroups.every((group) => (
    group.items.every((item) => item.options.some((option) => option.value === 'unknown'))
  )));
});

test('photo feature review ignores generated candidates and starts every value unknown', () => {
  const session = {
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
    qualityResult: {
      passed: true,
      featureDraft: {
        line: 'soft',
        value: 'deep',
        temperature: 'warm',
        presence: 'strong',
        contrast: 'high'
      }
    },
    features: null,
    preferences: null,
    report: null
  };
  const page = loadPage('feature-review', session);

  page.onLoad();

  assert.deepEqual(page.data.draft, createDefaultAppearance());
});

test('feature review saves a user correction while untouched values remain unknown', () => {
  const visited = [];
  const session = {
    photoPath: 'wxfile://local.jpg',
    photoMeta: { path: 'wxfile://local.jpg', width: 1080, height: 1440, size: 1200000 },
    qualityResult: { passed: true },
    features: null,
    preferences: null,
    report: null
  };
  const page = loadPage('feature-review', session, {
    navigateTo({ url }) {
      visited.push(url);
    }
  });
  page.onLoad();

  page.onFeatureChange({
    currentTarget: { dataset: { key: 'line' } },
    detail: { value: 'defined' }
  });
  page.onContinue();

  assert.deepEqual(session.features, confirmAppearance({
    ...createDefaultAppearance(),
    lineQuality: 'sharp'
  }));
  assert.deepEqual(visited, ['/pages/preferences/index']);
});

test('feature review redirects path-only and metadata-only deep links to capture', () => {
  for (const session of [
    {
      photoPath: 'wxfile://local.jpg',
      photoMeta: null,
      qualityResult: { passed: true, featureDraft: { line: 'balanced' } },
      features: null,
      preferences: null,
      report: null
    },
    {
      photoPath: '',
      photoMeta: { path: 'wxfile://local.jpg', width: 1080, height: 1440, size: 1200000 },
      qualityResult: { passed: true, featureDraft: { line: 'balanced' } },
      features: null,
      preferences: null,
      report: null
    }
  ]) {
    const redirects = [];
    const page = loadPage('feature-review', session, {
      redirectTo({ url }) {
        redirects.push(url);
      }
    });

    page.onLoad();

    assert.deepEqual(redirects, ['/pages/capture/index']);
    assert.equal(page.data.draft, null);
  }
});

test('preferences start with detailed questionnaire defaults', () => {
  const page = loadPage('preferences', {});

  assert.equal(page.data.form.fitPreference, 'regular');
  assert.equal(page.data.form.stylingTimeMinutes, 10);
  assert.equal(page.data.form.hairColorPreference.willingness, 'no-dye');
  assert.equal(page.data.form.makeupPreference, 'light');
  assert.equal(page.data.form.trendEnabled, false);
  assert.equal(page.data.form.manualMeasurements, null);
});

test('preferences summary shows desired effects with user-visible Chinese labels', () => {
  const session = preferenceSession({
    profileDraft: {
      presentationMode: 'neutral',
      scenes: ['commute'],
      cityOrClimateText: '',
      activityContext: ['indoor'],
      desiredEffects: ['clean', 'vertical']
    }
  });
  const page = loadPage('preferences', session);

  page.onLoad();

  assert.deepEqual(
    page.data.summary.find(({ label }) => label === '希望呈现'),
    { label: '希望呈现', value: '利落、延伸纵向线条' }
  );
});

test('preferences summary localizes presentation, scene, and activity selections', () => {
  const session = preferenceSession({
    profileDraft: {
      presentationMode: 'womenswear',
      scenes: ['commute', 'date'],
      cityOrClimateText: '',
      activityContext: ['indoor', 'longWalk'],
      desiredEffects: []
    }
  });
  const page = loadPage('preferences', session);

  page.onLoad();

  const summary = Object.fromEntries(
    page.data.summary.map(({ label, value }) => [label, value])
  );
  assert.deepEqual(
    {
      presentationMode: summary['呈现方式'],
      scenes: summary['场景'],
      activityContext: summary['活动情况']
    },
    {
      presentationMode: '女装',
      scenes: '通勤、约会',
      activityContext: '室内、长时间步行'
    }
  );
});

test('preferences summary safely labels unknown profile values', () => {
  const session = preferenceSession({
    profileDraft: {
      presentationMode: 'futureMode',
      scenes: ['futureScene'],
      cityOrClimateText: '',
      activityContext: ['futureContext'],
      desiredEffects: []
    }
  });
  const page = loadPage('preferences', session);

  page.onLoad();

  const summary = Object.fromEntries(
    page.data.summary.map(({ label, value }) => [label, value])
  );
  assert.deepEqual(
    {
      presentationMode: summary['呈现方式'],
      scenes: summary['场景'],
      activityContext: summary['活动情况']
    },
    {
      presentationMode: '暂不确定',
      scenes: '暂不确定',
      activityContext: '暂不确定'
    }
  );
});

test('preferences show detailed validation errors without advancing', () => {
  const visited = [];
  const session = preferenceSession();
  const page = loadPage('preferences', session, {
    navigateTo({ url }) {
      visited.push(url);
    }
  });

  page.data.form = { ...page.data.form, scenes: [], desiredEffects: [] };
  page.onContinue();

  /* assert.deepEqual(page.data.errors, {
    scene: '请选择使用场景',
    styles: '请至少选择一种风格偏好'
  }); */
  assert.ok(page.data.errors.scenes);
  assert.ok(page.data.errors.desiredEffects);
  assert.equal(session.preferences, null);
  assert.deepEqual(visited, []);
});

test('preferences show Chinese errors when a required style is cleared and height is out of range', () => {
  const visited = [];
  const session = preferenceSession();
  const page = loadPage('preferences', session, {
    navigateTo({ url }) {
      visited.push(url);
    }
  });

  page.onLoad();
  page.onChoiceChange({
    currentTarget: { dataset: { field: 'stylePreferences' } },
    detail: { value: [] }
  });
  page.onMeasurementInput({
    currentTarget: { dataset: { key: 'heightCm' } },
    detail: { value: '300' }
  });
  page.onContinue();

  assert.equal(page.data.errors.stylePreferences, '请至少选择一种风格偏好');
  assert.equal(page.data.measurementErrors.heightCm, '身高请输入 80–230 cm');
  assert.doesNotMatch(
    Object.values(page.data.errors).join(' '),
    /\b(?:Invalid|Measurements?|must|selection|preference)\b/i
  );
  assert.equal(session.preferences, null);
  assert.deepEqual(visited, []);
});

test('preferences edit action opens profile and resubmitting clears stale downstream results', () => {
  const visited = [];
  const relaunched = [];
  const session = preferenceSession({
    profileDraft: {
      presentationMode: 'neutral',
      scenes: ['commute'],
      cityOrClimateText: '上海',
      activityContext: ['indoor'],
      desiredEffects: ['clean']
    },
    features: confirmAppearance(createDefaultAppearance()),
    preferences: createDefaultPreferences(),
    profile: { schemaVersion: 2, id: 'stale-profile' },
    report: { id: 'stale-report' }
  });
  const wxApi = {
    reLaunch({ url }) {
      relaunched.push(url);
    },
    navigateTo({ url }) {
      visited.push(url);
    }
  };
  const preferencesPage = loadPage('preferences', session, wxApi);

  preferencesPage.onLoad();
  preferencesPage.onEditProfile();

  assert.deepEqual(relaunched, ['/pages/profile/index']);
  assert.deepEqual(visited, []);

  const profilePage = loadPage('profile', session, wxApi);
  profilePage.onLoad();
  profilePage.onCityOrClimateInput({ detail: { value: '北京，偏干燥' } });
  profilePage.onSubmit();

  assert.equal(session.profileDraft.cityOrClimateText, '北京，偏干燥');
  assert.deepEqual(session.features, confirmAppearance(createDefaultAppearance()));
  assert.equal(session.preferences, null);
  assert.equal(session.profile, null);
  assert.equal(session.report, null);
  assert.deepEqual(visited, ['/pages/preferences/index']);
});

test('preferences draft survives profile editing and restores long-form choices', () => {
  const visited = [];
  const session = preferenceSession({
    profileDraft: {
      presentationMode: 'neutral',
      scenes: ['commute'],
      cityOrClimateText: '上海',
      activityContext: ['indoor'],
      desiredEffects: ['clean']
    }
  });
  const wxApi = {
    reLaunch({ url }) {
      visited.push(url);
    },
    navigateTo({ url }) {
      visited.push(url);
    }
  };
  const preferencesPage = loadPage('preferences', session, wxApi);

  preferencesPage.onLoad();
  preferencesPage.onChoiceChange({
    currentTarget: { dataset: { field: 'stylingTimeMinutes' } },
    detail: { value: 20 }
  });
  preferencesPage.onChoiceChange({
    currentTarget: { dataset: { field: 'stylePreferences' } },
    detail: { value: ['newChinese'] }
  });
  preferencesPage.onChoiceChange({
    currentTarget: { dataset: { field: 'makeupPreference' } },
    detail: { value: 'none' }
  });
  preferencesPage.onEditProfile();

  assert.equal(session.preferencesDraft.stylingTimeMinutes, 20);
  assert.deepEqual(session.preferencesDraft.stylePreferences, ['newChinese']);
  assert.equal(session.preferencesDraft.makeupPreference, 'none');

  const profilePage = loadPage('profile', session, wxApi);
  profilePage.onLoad();
  profilePage.onScenesChange({ detail: { value: ['travel'] } });
  profilePage.onCityOrClimateInput({ detail: { value: '北京，偏干燥' } });
  profilePage.onSubmit();
  session.features = confirmAppearance(createDefaultAppearance());

  const resumed = loadPage('preferences', session, wxApi);
  resumed.onLoad();

  assert.equal(resumed.data.form.cityOrClimateText, '北京，偏干燥');
  assert.deepEqual(resumed.data.form.scenes, ['travel']);
  assert.equal(resumed.data.form.stylingTimeMinutes, 20);
  assert.deepEqual(resumed.data.form.stylePreferences, ['newChinese']);
  assert.equal(resumed.data.form.makeupPreference, 'none');

  resumed.onContinue();
  assert.deepEqual(session.preferences.scenes, ['travel']);
  assert.deepEqual(session.profile.scenes, ['travel']);
  const report = generateReport(session.profile, {
    now: '2026-07-29T00:00:00.000Z'
  });
  assert.ok(report.sections.sceneTransition[0].sceneFit.includes('travel'));
});

test('preferences native back preserves a long-form draft and successful submit clears it', () => {
  const session = preferenceSession({
    profileDraft: {
      presentationMode: 'neutral',
      scenes: ['commute'],
      cityOrClimateText: '上海',
      activityContext: ['indoor'],
      desiredEffects: ['clean']
    }
  });
  const page = loadPage('preferences', session, { navigateTo() {} });

  page.onLoad();
  page.onChoiceChange({
    currentTarget: { dataset: { field: 'stylingTimeMinutes' } },
    detail: { value: 20 }
  });
  page.onChoiceChange({
    currentTarget: { dataset: { field: 'stylePreferences' } },
    detail: { value: ['newChinese'] }
  });
  page.onChoiceChange({
    currentTarget: { dataset: { field: 'makeupPreference' } },
    detail: { value: 'none' }
  });
  page.onHide();

  const resumed = loadPage('preferences', session, { navigateTo() {} });
  resumed.onLoad();
  assert.equal(resumed.data.form.stylingTimeMinutes, 20);
  assert.deepEqual(resumed.data.form.stylePreferences, ['newChinese']);
  assert.equal(resumed.data.form.makeupPreference, 'none');

  resumed.onContinue();
  resumed.onHide();
  assert.equal(Object.hasOwn(session, 'preferencesDraft'), false);
  assert.equal(Object.hasOwn(session, 'preferencesDraftContext'), false);
});

test('explicitly clearing fit calibration does not resurrect a pending relaxed fit', () => {
  const session = preferenceSession({
    features: confirmAppearance(createDefaultAppearance()),
    profileDraft: {
      presentationMode: 'neutral',
      scenes: ['commute'],
      cityOrClimateText: '上海',
      activityContext: ['indoor'],
      desiredEffects: ['clean'],
      fitPreference: 'relaxed',
      manualMeasurements: { heightCm: 170 }
    }
  });
  const wxApi = {
    reLaunch() {},
    navigateTo() {}
  };
  const preferencesPage = loadPage('preferences', session, wxApi);
  preferencesPage.onLoad();
  preferencesPage.onChoiceChange({
    currentTarget: { dataset: { field: 'stylingTimeMinutes' } },
    detail: { value: 20 }
  });
  preferencesPage.onEditProfile();

  session.features = null;
  const featurePage = loadPage('feature-review', session, wxApi);
  featurePage.onLoad();
  assert.equal(featurePage.data.fitPreference, 'relaxed');
  featurePage.onFitPreferenceChange({ detail: { value: 'unselected' } });
  featurePage.onMeasurementInput({
    currentTarget: { dataset: { key: 'heightCm' } },
    detail: { value: '' }
  });
  featurePage.onContinue();

  const resumed = loadPage('preferences', session, wxApi);
  resumed.onLoad();
  assert.equal(resumed.data.form.fitPreference, 'regular');
  assert.equal(resumed.data.form.manualMeasurements, null);
  assert.equal(resumed.data.form.stylingTimeMinutes, 20);
});

test('cached profile reloads returned fit data but keeps unsaved local edits', () => {
  const session = {
    analysisMode: 'manual',
    consentTicket: { adult: true, mode: 'manual' },
    profileDraft: {
      presentationMode: 'neutral',
      scenes: ['commute'],
      cityOrClimateText: '上海',
      activityContext: ['indoor'],
      desiredEffects: ['clean']
    },
    features: null,
    preferences: null,
    profile: null,
    report: null
  };
  const page = loadPage('profile', session, { navigateTo() {} });

  page.onLoad();
  page.onShow();
  session.profileDraft = {
    ...session.profileDraft,
    fitPreference: 'relaxed',
    manualMeasurements: { heightCm: 170, waistCm: 72 }
  };
  page.onShow();

  assert.equal(page.data.form.fitPreference, 'relaxed');
  assert.deepEqual(page.data.form.manualMeasurements, {
    heightCm: 170,
    waistCm: 72
  });

  page.onCityOrClimateInput({ detail: { value: '杭州，潮湿' } });
  session.profileDraft = {
    ...session.profileDraft,
    cityOrClimateText: '后台返回值',
    manualMeasurements: { heightCm: 180 }
  };
  page.onShow();

  assert.equal(page.data.form.cityOrClimateText, '杭州，潮湿');
  assert.deepEqual(page.data.form.manualMeasurements, {
    heightCm: 170,
    waistCm: 72
  });

  page.onSubmit();
  assert.equal(session.profileDraft.cityOrClimateText, '杭州，潮湿');
  assert.equal(session.profileDraft.fitPreference, 'relaxed');
  assert.deepEqual(session.profileDraft.manualMeasurements, {
    heightCm: 170,
    waistCm: 72
  });
});

test('preferences redirects path-only and metadata-only deep links to capture', () => {
  for (const session of [
    {
      photoPath: 'wxfile://local.jpg',
      photoMeta: null,
      qualityResult: { passed: true },
      features: { line: 'balanced' },
      preferences: null,
      report: null
    },
    {
      photoPath: '',
      photoMeta: { path: 'wxfile://local.jpg', width: 1080, height: 1440, size: 1200000 },
      qualityResult: { passed: true },
      features: { line: 'balanced' },
      preferences: null,
      report: null
    }
  ]) {
    const redirects = [];
    const page = loadPage('preferences', session, {
      redirectTo({ url }) {
        redirects.push(url);
      }
    });

    page.onLoad();

    assert.deepEqual(redirects, ['/pages/capture/index']);
  }
});

test('preferences redirects a session with missing prerequisite properties to capture', () => {
  const redirects = [];
  const page = loadPage('preferences', {}, {
    redirectTo({ url }) {
      redirects.push(url);
    }
  });

  page.onLoad();

  assert.deepEqual(redirects, ['/pages/capture/index']);
});

test('preferences requires confirmed features before rendering a deep link', () => {
  const redirects = [];
  const session = {
    photoPath: 'wxfile://local.jpg',
    photoMeta: { path: 'wxfile://local.jpg', width: 1080, height: 1440, size: 1200000 },
    qualityResult: {
      passed: true,
      featureDraft: {
        line: 'balanced',
        value: 'medium',
        temperature: 'neutral',
        presence: 'medium',
        contrast: 'medium'
      }
    },
    features: null,
    preferences: null,
    report: null
  };
  const page = loadPage('preferences', session, {
    redirectTo({ url }) {
      redirects.push(url);
    }
  });

  page.onLoad();

  assert.deepEqual(redirects, ['/pages/feature-review/index']);
});

test('valid preferences are stored only in session before processing', () => {
  const visited = [];
  const session = preferenceSession();
  const wxApi = {
    navigateTo({ url }) {
      visited.push(url);
    }
  };
  const page = loadPage('preferences', session, wxApi);
  page.data.form = {
    presentationMode: 'neutral',
    scenes: ['commute'],
    cityOrClimateText: 'Shanghai summer',
    activityContext: ['indoor'],
    desiredEffects: ['clean'],
    fitPreference: 'regular',
    comfortNeeds: ['breathable'],
    stylingTimeMinutes: 10,
    stylePreferences: ['natural', 'warm'],
    hairColorPreference: {
      currentColor: 'naturalBlack',
      willingness: 'no-dye',
      acceptsBleach: 'no',
      maintenanceLevel: 'low',
      workplaceRestriction: 'conservative'
    },
    budgetBand: 'moderate',
    makeupPreference: 'light',
    lockedAreas: ['hairLength'],
    manualMeasurements: null,
    trendEnabled: false
  };

  page.onContinue();

  assert.deepEqual(session.preferences.scenes, ['commute']);
  assert.deepEqual(session.preferences.stylePreferences, ['natural', 'warm']);
  assert.deepEqual(session.preferences.lockedAreas, ['hairLength']);
  assert.deepEqual(visited, ['/pages/processing/index']);
  assert.equal(typeof wxApi.setStorageSync, 'undefined');
  assert.equal(typeof wxApi.request, 'undefined');
});

test('preferences prefill feature-review calibration and save a normalized detailed style profile', () => {
  const visited = [];
  const session = preferenceSession({
    analysisMode: 'photo',
    features: confirmAppearance(createDefaultAppearance()),
    profileDraft: {
      presentationMode: 'neutral',
      scenes: ['commute'],
      cityOrClimateText: '上海，夏季湿热',
      activityContext: ['indoor'],
      desiredEffects: ['clean'],
      fitPreference: 'relaxed',
      manualMeasurements: { heightCm: 170 }
    },
    report: { id: 'stale' }
  });
  const page = loadPage('preferences', session, {
    navigateTo({ url }) {
      visited.push(url);
    }
  });

  page.onLoad();
  assert.equal(page.data.form.fitPreference, 'relaxed');
  assert.deepEqual(page.data.form.manualMeasurements, { heightCm: 170 });

  page.data.form = {
    ...page.data.form,
    presentationMode: 'neutral',
    scenes: ['commute'],
    cityOrClimateText: '上海，夏季湿热',
    activityContext: ['indoor', 'longWalk'],
    desiredEffects: ['clean', 'vertical'],
    fitPreference: 'relaxed',
    comfortNeeds: ['breathable'],
    stylingTimeMinutes: 10,
    stylePreferences: ['minimal'],
    hairColorPreference: {
      currentColor: 'naturalBlack',
      willingness: 'no-dye',
      acceptsBleach: 'no',
      maintenanceLevel: 'low',
      workplaceRestriction: 'conservative'
    },
    budgetBand: 'moderate',
    makeupPreference: 'none',
    lockedAreas: ['hairLength'],
    manualMeasurements: { heightCm: 170 },
    trendEnabled: false
  };
  page.onContinue();

  assert.equal(session.preferences.fitPreference, 'relaxed');
  assert.equal(session.preferences.hairColorPreference.willingness, 'no-dye');
  assert.equal(session.preferences.makeupPreference, 'none');
  assert.equal(session.preferences.trendEnabled, false);
  assert.deepEqual(session.preferences.manualMeasurements, { heightCm: 170 });
  assert.equal(session.profile.schemaVersion, 2);
  assert.equal(session.profile.fitPreference, 'relaxed');
  assert.equal(session.report, null);
  assert.deepEqual(visited, ['/pages/processing/index']);
});

test('safe navigation redirects to the fallback when stack navigation fails', () => {
  const visited = [];
  const wxApi = {
    navigateTo({ url, fail }) {
      visited.push(['navigateTo', url]);
      fail();
    },
    redirectTo({ url }) {
      visited.push(['redirectTo', url]);
    }
  };

  safeNavigate(wxApi, '/pages/result/index', '/pages/home/index');

  assert.deepEqual(visited, [
    ['navigateTo', '/pages/result/index'],
    ['redirectTo', '/pages/home/index']
  ]);
});

test('safe navigation success never invokes the fallback redirect', () => {
  const visited = [];
  safeNavigate({
    navigateTo({ url, success }) {
      visited.push(['navigateTo', url]);
      if (success) success();
    },
    redirectTo({ url }) {
      visited.push(['redirectTo', url]);
    }
  }, '/pages/preferences/index', '/pages/home/index');

  assert.deepEqual(visited, [
    ['navigateTo', '/pages/preferences/index']
  ]);
});

test('safe navigation skips a delayed fallback after continuation becomes stale', () => {
  let active = true;
  let delayedFailure;
  const redirected = [];
  const wxApi = {
    navigateTo({ fail }) {
      delayedFailure = fail;
    },
    redirectTo({ url }) {
      redirected.push(url);
    }
  };

  safeNavigate(
    wxApi,
    '/pages/quality-check/index',
    '/pages/capture/index',
    () => active
  );
  active = false;
  delayedFailure();

  assert.deepEqual(redirected, []);
});

test('quality page stores five deterministic local file checks and no appearance draft', () => {
  const session = preferenceSession({
    photoMeta: {
      path: 'wxfile://local.jpg',
      width: 1080,
      height: 1440,
      size: 1200000,
      type: 'image/jpeg',
      decoded: true
    },
    features: { lineQuality: 'sharp' },
    preferences: { scene: 'commute' },
    report: { id: 'old' }
  });
  const page = loadPage('quality-check', session, { redirectTo() {} });

  page.onLoad();

  assert.deepEqual(
    page.data.checks.map((check) => check.key),
    ['decode', 'resolution', 'aspect', 'size', 'format']
  );
  assert.ok(page.data.checks.every((check) => check.basisLabel === '本地文件信息'));
  assert.equal(Object.hasOwn(session.qualityResult, 'featureDraft'), false);
  assert.equal(session.features, null);
  assert.equal(session.preferences, null);
  assert.equal(session.report, null);
});

test('capture records the selected local photo kind before opening a source', () => {
  const sources = [];
  const session = {
    consentTicket: { ...consentTicket },
    photoKind: '',
    photoPath: '',
    photoMeta: null,
    qualityResult: null,
    features: null,
    preferences: null,
    report: null
  };
  const page = loadPage('capture', session, {
    chooseMedia({ sourceType }) {
      sources.push(sourceType);
    }
  });

  page.onLoad();
  page.onPhotoKindChange({ detail: { value: 'fullBody' } });
  page.onChoosePhoto({ currentTarget: { dataset: { source: 'album' } } });

  assert.equal(session.photoKind, 'fullBody');
  assert.deepEqual(sources, [['album']]);
});

test('failed quality can switch to a manual appearance draft without retaining photo state', () => {
  const redirects = [];
  const session = preferenceSession({
    photoPath: 'wxfile://too-small.jpg',
    photoMeta: {
      path: 'wxfile://too-small.jpg',
      width: 320,
      height: 320,
      size: 200000,
      type: 'image/jpeg',
      decoded: true
    },
    qualityResult: null
  });
  const page = loadPage('quality-check', session, {
    redirectTo({ url }) {
      redirects.push(url);
    }
  });

  page.onLoad();
  page.onUseManual();

  assert.equal(session.analysisMode, 'manual');
  assert.deepEqual(session.consentTicket, { adult: true, mode: 'manual' });
  assert.equal(session.photoKind, '');
  assert.equal(session.photoPath, '');
  assert.equal(session.qualityResult, null);
  assert.deepEqual(redirects, ['/pages/feature-review/index']);
});

test('photo review starts unknown and saves only user-confirmed manual provenance', () => {
  const visited = [];
  const session = preferenceSession({
    qualityResult: { passed: true, featureDraft: { line: 'soft' } }
  });
  const page = loadPage('feature-review', session, {
    navigateTo({ url }) {
      visited.push(url);
    }
  });

  page.onLoad();
  assert.equal(page.data.mode, 'photo');
  assert.equal(page.data.draft.lineQuality, 'unknown');
  assert.equal(page.data.draft.colorCalibration.accentChoice, 'unknown');
  page.onAppearanceChange({
    currentTarget: { dataset: { key: 'lineQuality', group: '' } },
    detail: { value: 'sharp' }
  });
  page.onAppearanceChange({
    currentTarget: { dataset: { key: 'whiteChoice', group: 'colorCalibration' } },
    detail: { value: 'ivory' }
  });
  page.onContinue();

  assert.equal(session.features.lineQuality, 'sharp');
  assert.equal(session.features.faceOutline, 'unknown');
  assert.equal(session.features.colorCalibration.whiteChoice, 'ivory');
  assert.deepEqual(
    session.features.provenance.lineQuality,
    { source: 'manual', userConfirmed: true }
  );
  assert.deepEqual(
    session.features.provenance.colorCalibration,
    { source: 'manual', userConfirmed: true }
  );
  assert.deepEqual(visited, ['/pages/preferences/index']);
});

test('feature review keeps fit unselected and optional measurements empty', () => {
  const session = preferenceSession();
  const page = loadPage('feature-review', session, { navigateTo() {} });

  page.onLoad();

  assert.equal(page.data.fitPreference, 'unselected');
  assert.deepEqual(page.data.fitOptions[0], {
    label: '暂不确定',
    value: 'unselected'
  });
  assert.deepEqual(page.data.manualMeasurements, {});
  page.onContinue();
  assert.equal(
    Object.prototype.hasOwnProperty.call(session.profileDraft, 'fitPreference'),
    false
  );
  assert.equal(session.profileDraft.manualMeasurements, null);
  assert.equal(session.features.lineQuality, 'unknown');
  assert.equal(Object.hasOwn(session.features, 'fitPreference'), false);
  assert.equal(Object.hasOwn(session.features, 'manualMeasurements'), false);
});

test('manual and photo paths both save the same confirmed appearance shape', () => {
  const manualSession = {
    analysisMode: 'manual',
    consentTicket: { adult: true, mode: 'manual' },
    profileDraft: { presentationMode: 'neutral', scenes: ['commute'] },
    features: null,
    preferences: null,
    report: null
  };
  const photoSession = preferenceSession();

  for (const session of [manualSession, photoSession]) {
    const page = loadPage('feature-review', session, { navigateTo() {} });
    page.onLoad();
    page.onContinue();
    assert.deepEqual(Object.keys(session.features).sort(), [
      'colorCalibration',
      'faceOutline',
      'glassesState',
      'hairLength',
      'hairTexture',
      'lineQuality',
      'provenance',
      'valueContrast',
      'visibleGarmentSilhouette',
      'visibleHairColorFamily',
      'visibleHairVolume',
      'visualScale'
    ]);
  }
});
