const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mini = path.join(root, 'apps', 'miniprogram');
const pages = [
  'home', 'consent', 'profile', 'capture', 'quality-check', 'feature-review',
  'preferences', 'processing', 'result', 'settings'
];

test('project config points to the native miniprogram root', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
  assert.equal(config.miniprogramRoot, 'apps/miniprogram/');
});

test('project config enables JS minification for code quality scans', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
  assert.equal(config.setting.minified, true);
});

test('package scripts expose the full Node suite and static verifier', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.equal(packageJson.scripts.test, 'node --test tests/*.test.js');
  assert.equal(packageJson.scripts.verify, 'node scripts/verify-project.js');
  assert.ok(packageJson.scripts.release);
});

test('app registers every required page', () => {
  const app = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'));
  assert.deepEqual(
    app.pages,
    pages.map((name) => `pages/${name}/index`)
  );
});

test('app enables component on-demand injection for code quality scans', () => {
  const app = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'));
  assert.equal(app.lazyCodeLoading, 'requiredComponents');
});

test('every registered route has the minimum native page files', () => {
  const app = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'));

  for (const route of app.pages) {
    for (const extension of ['js', 'json', 'wxml', 'wxss']) {
      assert.ok(
        fs.existsSync(path.join(mini, `${route}.${extension}`)),
        `missing ${route}.${extension}`
      );
    }
  }
});

test('pre-use privacy copy discloses profile persistence and session-only photos', () => {
  const consent = fs.readFileSync(
    path.join(mini, 'pages', 'consent', 'index.wxml'),
    'utf8'
  );
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

  assert.match(consent, /已确认档案和报告会保存在本机/);
  assert.match(consent, /照片路径只保留当前会话/);
  assert.match(consent, /不会上传/);
  assert.match(consent, /隐私与本地数据/);
  assert.doesNotMatch(consent, /本次选择只用于当前会话/);
  assert.match(readme, /本地持久化.*造型档案和使用偏好/);
  assert.match(readme, /照片不会上传；路径和读取信息只保留在当前会话/);
});

const loadAppConfig = () => {
  const appPath = path.join(mini, 'app.js');
  let captured;
  const ownedApp = Object.prototype.hasOwnProperty.call(global, 'App');
  const previousApp = global.App;

  try {
    global.App = (config) => {
      captured = config;
    };
    delete require.cache[require.resolve(appPath)];
    require(appPath);
  } finally {
    if (ownedApp) global.App = previousApp;
    else delete global.App;
  }

  return captured;
};

test('app initializes the exact empty analysis session', () => {
  const app = loadAppConfig();

  assert.deepEqual(app.globalData.session, {
    analysisMode: '',
    consentTicket: null,
    profileDraft: null,
    photoKind: '',
    photoPath: '',
    photoMeta: null,
    qualityResult: null,
    appearanceCandidates: null,
    features: null,
    preferences: null,
    profile: null,
    report: null
  });
});

test('resetSession replaces populated session with a fresh empty session', () => {
  const app = loadAppConfig();
  const originalSession = app.globalData.session;
  app.globalData.session.photoPath = 'wxfile://photo.jpg';
  app.globalData.session.report = { id: 'report-1' };

  app.resetSession();

  assert.notStrictEqual(app.globalData.session, originalSession);
  assert.deepEqual(app.globalData.session, {
    analysisMode: '',
    consentTicket: null,
    profileDraft: null,
    photoKind: '',
    photoPath: '',
    photoMeta: null,
    qualityResult: null,
    appearanceCandidates: null,
    features: null,
    preferences: null,
    profile: null,
    report: null
  });
});

test('constants module exposes photo limits and copy rules', () => {
  const { PHOTO_LIMITS, COPY_RULES } = require(path.join(mini, 'config', 'constants.js'));

  assert.deepEqual(PHOTO_LIMITS, {
    minWidth: 480,
    minHeight: 480,
    maxBytes: 10 * 1024 * 1024,
    minAspect: 0.55,
    maxAspect: 1.8
  });
  assert.deepEqual(COPY_RULES, {
    localProcessingOnly: true,
    noAppearanceScoring: true,
    noIdentityInference: true
  });
});

test('storage-keys module exposes only the application storage keys', () => {
  const { STORAGE_KEYS } = require(path.join(mini, 'config', 'storage-keys.js'));

  assert.deepEqual(STORAGE_KEYS, {
    CONSENT: 'beauty-style-miniapp:consent',
    PROFILE: 'beauty-style-miniapp:profile',
    REPORT: 'beauty-style-miniapp:report',
    FAVORITES: 'beauty-style-miniapp:favorites',
    FEEDBACK: 'beauty-style-miniapp:feedback'
  });
});
