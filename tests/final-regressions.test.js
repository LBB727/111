const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CHOICE_GROUPS
} = require('../apps/miniprogram/config/preferences');
const { STYLE_RULES_V2 } = require('../apps/miniprogram/data/style-rules-v2');
const { APPEARANCE_VALUES: FEATURE_OPTIONS } = require('../apps/miniprogram/config/appearance-options');
const {
  PREFERENCE_VALUES: PROFILE_PREFERENCE_VALUES,
  DESIRED_EFFECT_LABELS
} = require('../apps/miniprogram/config/preference-options');
const {
  generateReport
} = require('../apps/miniprogram/services/recommendation-engine');
const {
  buildStyleProfile,
  createDefaultPreferences
} = require('../apps/miniprogram/services/profile-contract');
const {
  buildVisualLayers
} = require('../apps/miniprogram/services/visual-layer-builder');
const {
  getDemoReport
} = require('../apps/miniprogram/data/demo-report');
const {
  resolveRules
} = require('../apps/miniprogram/services/rule-resolver');
const { isUsableReport } = require('../apps/miniprogram/services/report-state');
const {
  hasConsentTicket,
  nextRequiredRoute
} = require('../apps/miniprogram/utils/flow-state');
const {
  validatePreferences
} = require('../apps/miniprogram/utils/validators');
const {
  createPageHarness
} = require('./helpers/miniprogram-harness');

const validFeatures = Object.freeze({
  line: 'soft',
  value: 'medium',
  temperature: 'warm',
  presence: 'medium',
  contrast: 'low'
});
const validConsentTicket = Object.freeze({
  adult: true,
  mode: 'photo',
  ownPhoto: true,
  photoProcessing: true
});
const validPreferences = Object.freeze({
  scene: 'commute',
  styles: ['natural'],
  budget: 'moderate',
  makeup: 'light',
  doNotChange: []
});
const REPORT_NOW = '2026-07-29T00:00:00.000Z';

function generatedReport({ appearance = {}, preferences = {} } = {}) {
  const defaults = createDefaultPreferences();
  const profile = buildStyleProfile({
    analysisMode: 'manual',
    appearance,
    preferences: {
      ...defaults,
      scenes: ['commute'],
      desiredEffects: ['clean', 'vertical'],
      stylePreferences: ['minimal'],
      ...preferences,
      hairColorPreference: {
        ...defaults.hairColorPreference,
        ...(preferences.hairColorPreference || {})
      }
    }
  });
  const report = generateReport(profile, { now: REPORT_NOW });
  report.visualLayers = buildVisualLayers(report, profile);
  return report;
}

function completeSession(overrides = {}) {
  return {
    analysisMode: 'photo',
    consentTicket: { ...validConsentTicket },
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

test('demo report remains usable and isolated when structuredClone is unavailable', () => {
  const hadStructuredClone = Object.prototype.hasOwnProperty.call(global, 'structuredClone');
  const previousStructuredClone = global.structuredClone;
  try {
    delete global.structuredClone;
    const first = getDemoReport();
    const second = getDemoReport();

    assert.equal(isUsableReport(first), true);
    assert.ok(first.visualLayers?.overall);
    assert.ok(first.visualLayers?.collage);
    assert.ok(first.visualLayers?.technical);
    assert.notStrictEqual(first, second);
    assert.deepEqual(first, second);
  } finally {
    if (hadStructuredClone) global.structuredClone = previousStructuredClone;
    else delete global.structuredClone;
  }
});

test('home demo click builds the report and navigates without structuredClone', () => {
  const hadStructuredClone = Object.prototype.hasOwnProperty.call(global, 'structuredClone');
  const previousStructuredClone = global.structuredClone;
  const session = { report: null };
  const navigations = [];
  const app = {
    globalData: { session },
    resetSession() {
      session.report = null;
    }
  };
  try {
    delete global.structuredClone;
    const harness = createPageHarness('home', {
      app,
      wxApi: {
        navigateTo({ url }) {
          navigations.push(url);
        },
        redirectTo() {
          assert.fail('demo click should not require fallback navigation');
        }
      }
    });

    assert.doesNotThrow(() => harness.page.onViewDemo());
    assert.equal(isUsableReport(session.report), true);
    assert.deepEqual(navigations, ['/pages/result/index']);
  } finally {
    if (hadStructuredClone) global.structuredClone = previousStructuredClone;
    else delete global.structuredClone;
  }
});

test('resolved rule candidates project out evidence metadata before runtime use', () => {
  const profile = buildStyleProfile({
    analysisMode: 'manual',
    appearance: {
      lineQuality: 'balanced'
    },
    preferences: {
      ...createDefaultPreferences(),
      scenes: ['commute'],
      desiredEffects: ['vertical'],
      trendEnabled: true
    }
  });
  const rules = resolveRules(profile, { now: REPORT_NOW });

  assert.ok(rules.some(({ layer }) => layer === 'stable'));
  assert.ok(rules.some(({ layer }) => layer === 'seasonal_trend'));
  assert.ok(rules.every(({ candidate }) => (
    !Object.hasOwn(candidate, 'evidenceUrl')
    && !Object.hasOwn(candidate.source || {}, 'evidenceUrl')
  )));
});

test('every value exposed by the shared preference choices validates as real UI input', () => {
  for (const [group, options] of Object.entries(CHOICE_GROUPS)) {
    for (const option of options) {
      const preferences = structuredClone(validPreferences);
      preferences[group] = group === 'styles' || group === 'doNotChange'
        ? [option.value]
        : option.value;
      assert.equal(validatePreferences(preferences).valid, true, `${group}:${option.value}`);
    }
  }
});

test('every UI scene remains explicit in scene-transition guidance', () => {
  for (const { value: scene } of CHOICE_GROUPS.scene) {
    const report = generatedReport({ preferences: { scenes: [scene] } });
    assert.ok(report.sections.sceneTransition[0].sceneFit.includes(scene), scene);
  }
});

test('every canonical UI style produces concrete non-fallback recommendations', () => {
  for (const style of PROFILE_PREFERENCE_VALUES.stylePreferences) {
    const report = generatedReport({
      preferences: { stylePreferences: [style] }
    });
    assert.ok(
      Object.values(report.sections).flat().some((item) => !item.id.endsWith('fallback')),
      style
    );
  }
});

test('UI no-makeup choice only returns explicit fully skippable makeup guidance', () => {
  const report = generatedReport({ preferences: { makeupPreference: 'none' } });

  assert.ok(report.sections.makeup.length > 0);
  assert.ok(report.sections.makeup.every((item) => item.skippable === true));
  assert.ok(report.sections.makeup.every((item) => /完全跳过|不化妆/.test(item.action)));
});

test('all canonical locked areas map to their affected recommendation family', () => {
  const cases = {
    hairLength: 'hair',
    hairColor: 'hairColor',
    glasses: 'accessories',
    makeup: 'makeup',
    fit: 'clothing'
  };

  for (const [choice, category] of Object.entries(cases)) {
    const report = generatedReport({
      preferences: { lockedAreas: [choice] }
    });
    assert.ok(report.sections[category].every((item) => item.lowIntervention === true), choice);
  }
});

test('budget stays in report identity without changing hard scene constraints', () => {
  const low = generatedReport({ preferences: { budgetBand: 'low' } });
  const premium = generatedReport({ preferences: { budgetBand: 'premium' } });

  assert.notEqual(low.id, premium.id);
  const withoutBasis = ({ confirmedBasis, ...recommendation }) => recommendation;
  assert.deepEqual(
    low.sections.sceneTransition.map(withoutBasis),
    premium.sections.sceneTransition.map(withoutBasis)
  );
});

test('report identity includes the normalized makeup preference and stays deterministic', () => {
  const light = generatedReport();
  const none = generatedReport({ preferences: { makeupPreference: 'none' } });
  const repeat = generatedReport({ preferences: { makeupPreference: 'none' } });

  assert.notEqual(light.id, none.id);
  assert.equal(none.id, repeat.id);
});

test('V2 rule predicates and appearance choices are deeply immutable', () => {
  assert.ok(STYLE_RULES_V2.every((rule) => (
    Object.isFrozen(rule.confirmedInputs)
    && rule.confirmedInputs.every(Object.isFrozen)
    && Object.isFrozen(rule.scene)
    && Object.isFrozen(rule.recommendation)
  )));
  assert.ok(Object.isFrozen(FEATURE_OPTIONS));
  assert.ok(Object.values(FEATURE_OPTIONS).every(Object.isFrozen));
});

test('every supported desired effect has a user-visible Chinese label', () => {
  assert.ok(Object.isFrozen(DESIRED_EFFECT_LABELS));
  assert.deepEqual(
    PROFILE_PREFERENCE_VALUES.desiredEffects.map((value) => (
      DESIRED_EFFECT_LABELS[value]
    )),
    [
      '利落',
      '柔和',
      '松弛',
      '鲜明',
      '克制',
      '复古',
      '新中式',
      '延伸纵向线条',
      '增加肩部结构',
      '突出腰线',
      '增加下装量感',
      '减少贴身感',
      '方便活动'
    ]
  );
});

test('report confirmed basis contains complete manual scene and intent labels', () => {
  const report = generatedReport();

  assert.deepEqual(report.confirmedBasis, [
    { key: 'scene', label: '场景', value: '通勤', source: 'manual' },
    {
      key: 'presentationMode',
      label: '呈现方式',
      value: '中性',
      source: 'manual'
    },
    {
      key: 'activityContext',
      label: '活动环境',
      value: '室内',
      source: 'manual'
    },
    {
      key: 'desiredEffects',
      label: '希望呈现',
      value: '利落、延伸纵向线条',
      source: 'manual'
    },
    {
      key: 'stylePreferences',
      label: '风格偏好',
      value: '极简',
      source: 'manual'
    },
    {
      key: 'fitPreference',
      label: '常穿松量',
      value: '合身',
      source: 'manual'
    },
    {
      key: 'budgetBand',
      label: '预算',
      value: '适中预算',
      source: 'manual'
    }
  ]);
});

test('report integrity rejects missing V2 metadata and malformed confirmed basis', () => {
  const valid = structuredClone(generatedReport());
  assert.equal(isUsableReport(valid), true);

  for (const mutate of [
    (report) => { report.id = ''; },
    (report) => { report.mode = 'remote'; },
    (report) => { report.generatedAt = ''; },
    (report) => { report.schemaVersion = 1; },
    (report) => { report.ruleSetVersion = ''; },
    (report) => { report.confirmedBasis = []; },
    (report) => { report.topRecommendations.pop(); },
    (report) => { report.colorPlan.main.percentage = 50; }
  ]) {
    const report = structuredClone(valid);
    mutate(report);
    assert.equal(isUsableReport(report), false);
  }
});

test('current flow always starts at consent without a complete current-session ticket', () => {
  assert.equal(hasConsentTicket(validConsentTicket), true);
  assert.equal(hasConsentTicket({ ...validConsentTicket, ownPhoto: false }), false);
  assert.equal(nextRequiredRoute(completeSession({ consentTicket: null })), '/pages/consent/index');
  assert.equal(
    nextRequiredRoute(completeSession({ consentTicket: { ...validConsentTicket, ownPhoto: false } })),
    '/pages/consent/index'
  );
});

test('capture checks consent on load, show, and immediately before chooseMedia', () => {
  let chooseCount = 0;
  const redirects = [];
  const session = completeSession({ consentTicket: null });
  const harness = createPageHarness('capture', {
    session,
    wxApi: {
      redirectTo({ url }) {
        redirects.push(url);
      },
      chooseMedia() {
        chooseCount += 1;
      }
    }
  });

  harness.page.onLoad();
  harness.page.onShow();
  harness.page.onChoosePhoto({ currentTarget: { dataset: { source: 'album' } } });

  assert.deepEqual(redirects, [
    '/pages/consent/index',
    '/pages/consent/index',
    '/pages/consent/index'
  ]);
  assert.equal(chooseCount, 0);
});

test('new photo metadata atomically clears every stale downstream result before navigation', () => {
  const staleReport = generatedReport();
  const session = completeSession({ report: staleReport });
  const navigations = [];
  const harness = createPageHarness('capture', {
    session,
    wxApi: {
      redirectTo({ url, fail }) {
        navigations.push({ method: 'redirectTo', url });
        if (fail) fail(new Error('redirect unavailable'));
      },
      navigateTo({ url }) {
        navigations.push({ method: 'navigateTo', url });
        throw new Error('navigate unavailable');
      },
      getImageInfo({ success }) {
        success({ width: 900, height: 1200 });
      },
      getFileSystemManager() {
        return {
          getFileInfo({ success }) {
            success({ size: 345678 });
          }
        };
      }
    }
  });
  harness.page.onLoad();
  const token = harness.page.operationGuard.begin();

  harness.page.readPhotoMetadata('wxfile://new-photo.jpg', token);

  assert.equal(session.photoPath, 'wxfile://new-photo.jpg');
  assert.deepEqual(session.photoMeta, {
    path: 'wxfile://new-photo.jpg',
    width: 900,
    height: 1200,
    size: 345678,
    decoded: true
  });
  assert.equal(session.qualityResult, null);
  assert.equal(session.features, null);
  assert.equal(session.preferences, null);
  assert.equal(session.report, null);
  assert.equal(nextRequiredRoute(session), '/pages/quality-check/index');
  assert.deepEqual(navigations, [
    { method: 'navigateTo', url: '/pages/quality-check/index' },
    { method: 'redirectTo', url: '/pages/quality-check/index' }
  ]);
});

test('photo metadata read failure preserves the complete previous session', () => {
  const session = completeSession({
    report: generatedReport()
  });
  const before = structuredClone(session);
  const harness = createPageHarness('capture', {
    session,
    wxApi: {
      redirectTo() {},
      getImageInfo({ success }) {
        success({ width: 900, height: 1200 });
      },
      getFileSystemManager() {
        return {
          getFileInfo({ fail }) {
            fail(new Error('file info unavailable'));
          }
        };
      },
      showToast() {}
    }
  });
  harness.page.onLoad();
  const token = harness.page.operationGuard.begin();

  harness.page.readPhotoMetadata('wxfile://unreadable.jpg', token);

  assert.deepEqual(session, before);
  assert.equal(harness.page.data.selecting, false);
});

test('feature and preference edits invalidate only affected downstream state', () => {
  const session = completeSession({
    report: generatedReport()
  });
  const oldReport = session.report;
  const featureHarness = createPageHarness('feature-review', {
    session,
    wxApi: { navigateTo() {}, redirectTo() {} }
  });
  featureHarness.page.onLoad();
  featureHarness.page.onFeatureChange({
    currentTarget: { dataset: { key: 'line' } },
    detail: { value: 'defined' }
  });
  featureHarness.page.onContinue();
  assert.equal(session.preferences, null);
  assert.equal(session.report, null);

  session.preferences = structuredClone(validPreferences);
  session.report = generatedReport();
  const preferenceHarness = createPageHarness('preferences', {
    session,
    wxApi: { navigateTo() {}, redirectTo() {} }
  });
  preferenceHarness.page.onLoad();
  preferenceHarness.page.data.form = {
    ...preferenceHarness.page.data.form,
    scenes: ['date'],
    cityOrClimateText: 'Shanghai summer',
    desiredEffects: ['clean']
  };
  preferenceHarness.page.onContinue();
  assert.equal(session.report, null);
  assert.deepEqual(session.preferences.scenes, ['date']);
  assert.notEqual(session.profile, null);
});

test('feature review stores canonical fit and optional measurements outside appearance', () => {
  const session = completeSession({ features: null, preferences: null, report: null });
  const harness = createPageHarness('feature-review', {
    session,
    wxApi: { navigateTo() {}, redirectTo() {} }
  });

  harness.page.onLoad();
  harness.page.onFitPreferenceChange({ detail: { value: 'relaxed' } });
  harness.page.onMeasurementInput({
    currentTarget: { dataset: { key: 'heightCm' } },
    detail: { value: '170' }
  });
  harness.page.onMeasurementInput({
    currentTarget: { dataset: { key: 'waistCm' } },
    detail: { value: '' }
  });
  harness.page.onContinue();

  assert.equal(session.profileDraft.fitPreference, 'relaxed');
  assert.deepEqual(session.profileDraft.manualMeasurements, { heightCm: 170 });
  assert.equal(Object.hasOwn(session.features, 'fitPreference'), false);
  assert.equal(Object.hasOwn(session.features, 'manualMeasurements'), false);
});

test('feature review preserves unsubmitted edits after a background return', () => {
  const session = completeSession({
    features: null,
    preferences: null,
    report: null
  });
  const harness = createPageHarness('feature-review', {
    session,
    wxApi: { navigateTo() {}, redirectTo() {} }
  });

  harness.page.onLoad();
  harness.page.onShow();
  harness.page.onAppearanceChange({
    currentTarget: { dataset: { key: 'lineQuality', group: '' } },
    detail: { value: 'sharp' }
  });
  harness.page.onFitPreferenceChange({ detail: { value: 'relaxed' } });
  harness.page.onMeasurementInput({
    currentTarget: { dataset: { key: 'heightCm' } },
    detail: { value: '170' }
  });

  harness.page.onShow();

  assert.equal(harness.page.data.draft.lineQuality, 'sharp');
  assert.equal(harness.page.data.fitPreference, 'relaxed');
  assert.deepEqual(harness.page.data.manualMeasurements, { heightCm: 170 });
  assert.equal(session.features, null);
});

test('submitting detailed preferences clears the current report', () => {
  const report = generatedReport();
  const session = completeSession({ report });
  const harness = createPageHarness('preferences', {
    session,
    wxApi: { navigateTo() {}, redirectTo() {} }
  });
  harness.page.onLoad();
  harness.page.data.form = {
    ...harness.page.data.form,
    cityOrClimateText: 'Shanghai summer',
    stylePreferences: ['warm', 'natural'],
    lockedAreas: ['glasses', 'hairLength']
  };
  harness.page.onContinue();

  assert.equal(session.report, null);
});

test('result markup renders the feature summary before top recommendations', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../apps/miniprogram/pages/result/index.wxml'),
    'utf8'
  );
  const summaryIndex = source.indexOf('featureSummary');
  const topIndex = source.indexOf('最值得先尝试的三项');

  assert.ok(summaryIndex >= 0);
  assert.ok(summaryIndex < topIndex);
});

test('result markup preserves the approved 12-section and three-layer visual order', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../apps/miniprogram/pages/result/index.wxml'),
    'utf8'
  );
  const approvedSections = [
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
  const positions = approvedSections.map((title) => source.indexOf(title));

  assert.ok(positions.every((position) => position >= 0));
  assert.ok(positions.every((position, index) => (
    index === 0 || position > positions[index - 1]
  )));
  assert.ok(source.indexOf('<overall-look') < source.indexOf('<outfit-collage'));
  assert.ok(source.indexOf('<outfit-collage') < source.indexOf('<garment-technical'));
});

test('consent ticket is issued only after persistence succeeds and rapid taps navigate once', () => {
  const session = completeSession({ consentTicket: null });
  const navigations = [];
  let failWrite = true;
  const harness = createPageHarness('consent', {
    session,
    wxApi: {
      setStorageSync() {
        if (failWrite) throw new Error('storage unavailable');
      },
      navigateTo(options) {
        navigations.push(options);
      },
      showToast() {}
    }
  });
  harness.page.onLoad();
  harness.page.data.form = { ...validConsentTicket };

  harness.page.onContinue();
  assert.equal(session.consentTicket, null);
  assert.equal(navigations.length, 0);

  failWrite = false;
  harness.page.onContinue();
  harness.page.onContinue();
  assert.deepEqual(session.consentTicket, validConsentTicket);
  assert.equal(navigations.length, 1);
});

test('manual consent exposes only adulthood and advances without photo confirmations', () => {
  const session = completeSession({
    analysisMode: 'manual',
    consentTicket: null,
    photoKind: '',
    photoPath: '',
    photoMeta: null,
    qualityResult: null
  });
  const navigations = [];
  const harness = createPageHarness('consent', {
    session,
    wxApi: {
      setStorageSync() {},
      navigateTo(options) {
        navigations.push(options);
      },
      showToast() {}
    }
  });

  harness.page.onLoad();

  assert.deepEqual(harness.page.data.consentControls, [
    { key: 'adult', label: '我已年满 18 岁' }
  ]);

  harness.page.onConsentChange({ detail: { value: ['adult'] } });
  harness.page.onContinue();

  assert.deepEqual(session.consentTicket, {
    adult: true,
    mode: 'manual'
  });
  assert.deepEqual(
    navigations.map(({ url }) => url),
    ['/pages/profile/index']
  );
});

test('returning to the cached consent page releases its navigation lock', () => {
  const navigations = [];
  const harness = createPageHarness('consent', {
    session: completeSession({ consentTicket: null }),
    wxApi: {
      setStorageSync() {},
      navigateTo(options) {
        navigations.push(options);
      },
      showToast() {}
    }
  });
  harness.page.onLoad();
  harness.page.data.form = { ...validConsentTicket };
  assert.equal(typeof harness.page.onShow, 'function');
  harness.page.onShow();
  harness.page.onContinue();
  harness.page.onShow();
  harness.page.onContinue();

  assert.equal(navigations.length, 2);
});

test('cached flow pages re-check consent and return to consent after session reset', () => {
  const routes = ['quality-check', 'feature-review', 'preferences'];
  for (const route of routes) {
    const session = completeSession();
    const redirects = [];
    const harness = createPageHarness(route, {
      session,
      wxApi: {
        redirectTo({ url }) {
          redirects.push(url);
        }
      }
    });
    harness.page.onLoad();
    harness.page.onShow();
    session.consentTicket = null;
    harness.page.onShow();
    assert.equal(redirects.at(-1), '/pages/consent/index', route);
  }
});

test('continue actions keep one navigation in flight across quality, feature, and preferences', () => {
  const cases = [
    {
      route: 'quality-check',
      prepare(page) {
        page.data.result = { passed: true };
      }
    },
    { route: 'feature-review', prepare() {} },
    {
      route: 'preferences',
      prepare(page) {
        page.data.form = structuredClone(validPreferences);
      }
    }
  ];

  for (const { route, prepare } of cases) {
    const navigations = [];
    const harness = createPageHarness(route, {
      session: completeSession(),
      wxApi: {
        navigateTo(options) {
          navigations.push(options);
        },
        redirectTo() {}
      }
    });
    harness.page.onLoad();
    prepare(harness.page);
    harness.page.onContinue();
    harness.page.onContinue();
    assert.equal(navigations.length, 1, route);
  }
});

test('cached processing unlocks report navigation and preserves a ready report', () => {
  const report = generatedReport();
  const session = completeSession({ report });
  const harness = createPageHarness('processing', {
    session,
    wxApi: {
      redirectTo() {},
      reLaunch() {}
    }
  });
  harness.page.onLoad();
  harness.page.setData({ navigating: true });
  harness.page.onShow();
  harness.page.onShow();

  assert.equal(harness.page.data.navigating, false);
  assert.equal(harness.page.data.reportReady, true);
});
