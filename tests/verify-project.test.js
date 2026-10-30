const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyProject } = require('../scripts/verify-project');

const projectRoot = path.resolve(__dirname, '..');
const verifyScript = path.join(projectRoot, 'scripts', 'verify-project.js');
const PAGE_NAMES = [
  'home',
  'consent',
  'profile',
  'capture',
  'quality-check',
  'feature-review',
  'preferences',
  'processing',
  'result',
  'settings'
];
const REPORT_SECTION_TITLES = [
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
const VISUAL_COMPONENTS = [
  'color-plan',
  'overall-look',
  'outfit-collage',
  'garment-technical'
];
const ALLOWED_EVIDENCE_HOSTS = [
  'openstd.samr.gov.cn',
  'www.cntac.org.cn',
  'www.pantonecn.com',
  'www.cie.co.at',
  'dxs.moe.gov.cn',
  'www.mfa.gov.cn',
  'www.cma.gov.cn',
  'pubmed.ncbi.nlm.nih.gov',
  'arxiv.org'
];
const MINIMUM_AUDITED_FILE_COUNT = 122;

const resultMarkup = REPORT_SECTION_TITLES.map((title, index) => {
  const component = {
    2: '<color-plan plan="{{report.colorPlan}}" />',
    3: '<overall-look layer="{{report.visualLayers.overall}}" />',
    4: '<outfit-collage layer="{{report.visualLayers.collage}}" />',
    5: '<garment-technical layer="{{report.visualLayers.technical}}" />'
  }[index] || '';
  return `<view id="section-${index + 1}"><text>${title}</text>${component}</view>`;
}).join('\n');

const resultComponentConfig = JSON.stringify({
  usingComponents: {
    'color-plan': '/components/color-plan/index',
    'overall-look': '/components/overall-look/index',
    'outfit-collage': '/components/outfit-collage/index',
    'garment-technical': '/components/garment-technical/index',
    'recommendation-card': '/components/recommendation-card/index'
  }
});

const REQUIRED_FIXTURE_FILES = {
  'pages/home/index.wxml': [
    '本色衣橱',
    '从你的本色出发',
    '用你确认的信息，整理一份适合当下场景的穿搭灵感',
    '手动完成造型档案',
    '使用照片辅助观察',
    '本地记录 · 不做自动外貌识别',
    '查看示例报告',
    '隐私与本地数据'
  ].join('\n'),
  'pages/consent/index.wxml': [
    '已确认档案和报告会保存在本机',
    '照片路径只保留当前会话',
    '不会上传',
    '隐私与本地数据'
  ].join('\n'),
  'pages/consent/index.js': [
    'Page({ consentCopy: [',
    "  '我已年满 18 岁',",
    "  '我确认使用的是本人照片，且有权使用',",
    "  '我同意在本机处理照片和相关造型特征'",
    '] });'
  ].join('\n'),
  'pages/capture/index.wxml': [
    '拍摄照片',
    '从相册选择',
    '照片路径与读取信息仅保留在本次会话中'
  ].join('\n'),
  'pages/feature-review/index.wxml': [
    '手动确认你的造型档案',
    '所有选项都从不确定开始，由你自己填写；不会自动识别或评价外貌。',
    '确认并继续'
  ].join('\n'),
  'pages/preferences/index.wxml': '选择场景（单选）\n风格偏好（可多选）\n生成我的建议',
  'pages/processing/index.wxml': '本地规则分析\n不会上传照片或你的选择\n立即查看',
  'pages/result/index.wxml': [
    resultMarkup,
    '最值得先尝试的三项',
    '重新分析',
    '隐私与本地数据'
  ].join('\n'),
  'pages/result/index.json': resultComponentConfig,
  'pages/result/index.js': [
    "'推荐色彩'",
    "'发型'",
    "'服装'",
    "'眼镜与配饰'",
    "'眉形与妆容'",
    "'场景胶囊搭配'",
    'const DEFAULT_EXPANDED_SECTIONS = { overall: true, collage: true, technical: true };'
  ].join('\n'),
  'pages/settings/index.wxml': [
    '你的数据仅存储在本机',
    '清除当前照片',
    '清除报告',
    '清除收藏',
    '清除全部本地数据'
  ].join('\n'),
  'components/recommendation-card/index.json': JSON.stringify({ component: true }),
  'components/recommendation-card/index.wxml': [
    '为什么这样建议',
    '{{item.reason}}',
    '也可以：{{item.alternative}}'
  ].join('\n'),
  'components/color-plan/index.wxml': [
    '{{row.name}}',
    '{{row.percentage}}',
    '{{row.placements}}',
    '{{plan.alternatives}}',
    '{{plan.reason}}',
    '{{plan.screenColorDisclaimer}}'
  ].join('\n'),
  'components/overall-look/index.wxml': [
    '<image src="{{layer.assetPath}}" />',
    '{{layer.colorBlocks}}',
    '{{layer.hairColorSwatch}}',
    '{{layer.focusLabel}}',
    '{{layer.disclaimer}}'
  ].join('\n'),
  'components/outfit-collage/index.wxml': [
    '<image src="{{item.assetPath}}" />',
    '{{item.name}}',
    '{{item.colorName}}',
    '{{item.fitKeywords}}',
    '{{item.alternative}}',
    '{{layer.disclaimer}}'
  ].join('\n'),
  'components/garment-technical/index.wxml': [
    '<image src="{{layer.assetPath}}" />',
    '{{layer.labels}}',
    '{{item.label}}',
    '{{item.value}}',
    '{{layer.disclaimer}}'
  ].join('\n'),
  'services/report-state.js': [
    "'confirmedBasis', 'topRecommendations', 'colorPlan', 'outfitPlan', 'visualLayers', 'sections', 'alternatives', 'trendMeta'",
    "'main', 'secondary', 'accent', 'nearFace', 'lowerBody', 'accessories', 'reason', 'screenColorDisclaimer'",
    "'necklineOrCollar', 'shoulderConstruction', 'waistPlacement', 'length', 'sleeveLength', 'trouserRise', 'legShape', 'skirtShape', 'ease', 'materialAppearance'",
    "'colorName', 'colorFamily', 'depthBand', 'toneDirection', 'applicationStyle', 'bleachExpectation', 'maintenanceLevel', 'fadeDirection', 'sceneFit', 'wardrobeColorLinks', 'makeupAndAccessoryLinks', 'noDyeAlternative', 'trendValidUntil', 'safetyNote'",
    "'hair', 'hairColor', 'makeup', 'accessories', 'sceneTransition'"
  ].join('\n'),
  'services/recommendation-engine.js': [
    "const sections = { clothing: [], hair: [], hairColor: [], makeup: [], accessories: [], sceneTransition: [] };",
    "const colorPlan = { main: {}, secondary: {}, accent: {}, nearFace: [], lowerBody: [], accessories: [], alternatives: [], reason: '', screenColorDisclaimer: '' };"
  ].join('\n'),
  'services/visual-layer-builder.js': [
    "const overall = { assetPath: '/assets/styling/overall.svg', colorBlocks: [], hairColorSwatch: {}, focusLabel: '', disclaimer: '' };",
    "const collage = { assetPath: '/assets/styling/collage.svg', items: [{ name: '', colorName: '', fitKeywords: [], alternative: '' }], disclaimer: '' };",
    "const technical = { assetPath: '/assets/styling/technical.svg', labels: [], disclaimer: '' };"
  ].join('\n'),
  'services/rule-resolver.js': [
    "const SAFE_RULE_RUNTIME_FIELDS = Object.freeze(['ruleId', 'scene', 'recommendation', 'techniques']);",
    'function projectSafeRuleCandidate(candidate) {',
    '  return Object.fromEntries(SAFE_RULE_RUNTIME_FIELDS.map((field) => [field, candidate[field]]));',
    '}',
    'function stableRules() {',
    "  return resolved('stable', 'clothing', 'stable', projectSafeRuleCandidate(candidate));",
    '}',
    'function trendRules() {',
    "  return resolved('trend', 'clothing', 'seasonal_trend', projectSafeRuleCandidate(candidate));",
    '}'
  ].join('\n'),
  'data/garment-taxonomy.js': [
    "'necklineOrCollar', 'shoulderConstruction', 'waistPlacement', 'length'",
    "'sleeveLength', 'trouserRise', 'legShape', 'skirtShape', 'ease', 'materialAppearance'"
  ].join('\n'),
  'data/hair-color-rules.js': [
    "'name', 'level', 'temperature', 'applicationMethod'",
    "'bleachExpectation', 'maintenanceLevel', 'fadeDirection', 'scenes'",
    "'wardrobeLinks', 'groomingLinks', 'noDyeAlternative', 'safetyNote'"
  ].join('\n'),
  'data/style-rules-v2.js': [
    "const rule = { evidenceUrl: 'https://openstd.samr.gov.cn/' };",
    'module.exports = { rule };'
  ].join('\n'),
  'data/trend-rules.js': [
    "const rule = { evidenceUrl: 'https://www.cntac.org.cn/source' };",
    'module.exports = { rule };'
  ].join('\n'),
  'assets/styling/overall.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  'assets/styling/collage.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  'assets/styling/technical.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
};

function writeFile(root, relativePath, contents) {
  const target = path.join(root, 'apps', 'miniprogram', relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, 'utf8');
}

function makeProjectFixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beauty-style-verify-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, 'apps', 'miniprogram'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'project.config.json'),
    JSON.stringify({
      appid: '',
      compileType: 'miniprogram',
      miniprogramRoot: 'apps/miniprogram/'
    }),
    'utf8'
  );
  fs.writeFileSync(
    path.join(root, 'apps', 'miniprogram', 'app.json'),
    JSON.stringify({
      pages: PAGE_NAMES.map((name) => `pages/${name}/index`)
    }),
    'utf8'
  );

  for (const name of PAGE_NAMES) {
    for (const extension of ['js', 'json', 'wxml', 'wxss']) {
      const defaultContents = {
        js: 'Page({});',
        json: '{}',
        wxml: '<view>页面内容</view>',
        wxss: ''
      };
      writeFile(
        root,
        `pages/${name}/index.${extension}`,
        defaultContents[extension]
      );
    }
  }
  for (const name of VISUAL_COMPONENTS) {
    for (const extension of ['js', 'json', 'wxml', 'wxss']) {
      writeFile(
        root,
        `components/${name}/index.${extension}`,
        extension === 'json' ? JSON.stringify({ component: true }) : ''
      );
    }
  }
  for (const [relativePath, contents] of Object.entries(REQUIRED_FIXTURE_FILES)) {
    writeFile(root, relativePath, contents);
  }
  for (const [relativePath, contents] of Object.entries(overrides)) {
    const target = path.join(root, 'apps', 'miniprogram', relativePath);
    if (contents === null) {
      fs.rmSync(target, { force: true });
    } else {
      writeFile(root, relativePath, contents);
    }
  }

  return root;
}

function runVerifier(root, options = {}) {
  const args = root === undefined ? [verifyScript] : [verifyScript, root];
  return spawnSync(process.execPath, args, {
    cwd: options.cwd || projectRoot,
    encoding: 'utf8'
  });
}

function projectWithSource(t, source) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beauty-style-verify-source-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const miniRoot = path.join(root, 'apps', 'miniprogram');
  fs.mkdirSync(path.join(miniRoot, 'pages', 'home'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'project.config.json'),
    JSON.stringify({ miniprogramRoot: 'apps/miniprogram/' }),
    'utf8'
  );
  fs.writeFileSync(
    path.join(miniRoot, 'app.json'),
    JSON.stringify({ pages: [] }),
    'utf8'
  );
  fs.writeFileSync(path.join(miniRoot, 'pages', 'home', 'index.js'), source, 'utf8');
  return root;
}

test('verifier accepts a complete local-only project fixture', (t) => {
  const fixture = makeProjectFixture(t);
  const result = runVerifier(fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Pages: 10/);
  assert.match(result.stdout, /Scanned files: \d+/);
  assert.match(result.stdout, /Verification passed/);
});

test('verifier accepts every exact audited evidence host only as direct evidenceUrl metadata', (t) => {
  const metadata = ALLOWED_EVIDENCE_HOSTS.map((host, index) => (
    `{ id: ${index}, evidenceUrl: 'https://${host}/official-source' }`
  )).join(',\n');
  const fixture = makeProjectFixture(t, {
    'data/trend-rules.js': `const rules = [${metadata}];\nmodule.exports = { rules };`,
    'data/style-rules-v2.js': [
      'const rule = {',
      "  'evidenceUrl': 'https://openstd.samr.gov.cn/quoted-key-is-valid'",
      '};',
      'module.exports = { rule };'
    ].join('\n')
  });
  const result = runVerifier(fixture);

  assert.equal(result.status, 0, result.stderr);
});

test('verifier rejects evidence URL syntax and host bypasses', async (t) => {
  const cases = [
    ['non-HTTPS', 'http://openstd.samr.gov.cn/source'],
    ['credentials', 'https://user@openstd.samr.gov.cn/source'],
    ['port', 'https://openstd.samr.gov.cn:443/source'],
    ['query', 'https://openstd.samr.gov.cn/source?next=1'],
    ['fragment', 'https://openstd.samr.gov.cn/source#part'],
    ['unlisted host', 'https://example.com/source'],
    ['subdomain trick', 'https://openstd.samr.gov.cn.example.com/source']
  ];

  for (const [name, url] of cases) {
    await t.test(name, (t) => {
      const fixture = makeProjectFixture(t, {
        'data/trend-rules.js': `const rule = { evidenceUrl: '${url}' };`
      });
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /data\/trend-rules\.js: evidenceUrl 元数据不符合安全约束/);
    });
  }
});

test('verifier rejects allowlisted URLs outside the two direct evidenceUrl fields', async (t) => {
  const cases = [
    {
      name: 'wrong file',
      override: {
        'pages/home/index.js': "const evidenceUrl = 'https://openstd.samr.gov.cn/source';"
      }
    },
    {
      name: 'wrong key',
      override: {
        'data/trend-rules.js': "const rule = { sourceUrl: 'https://openstd.samr.gov.cn/source' };"
      }
    },
    {
      name: 'computed key',
      override: {
        'data/trend-rules.js': "const rule = { ['evidenceUrl']: 'https://openstd.samr.gov.cn/source' };"
      }
    },
    {
      name: 'aliased value',
      override: {
        'data/trend-rules.js': [
          "const source = 'https://openstd.samr.gov.cn/source';",
          'const rule = { evidenceUrl: source };'
        ].join('\n')
      }
    },
    {
      name: 'template value',
      override: {
        'data/trend-rules.js': 'const rule = { evidenceUrl: `https://openstd.samr.gov.cn/source` };'
      }
    }
  ];

  for (const { name, override } of cases) {
    await t.test(name, (t) => {
      const fixture = makeProjectFixture(t, override);
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /禁止的远程 URL/);
    });
  }
});

test('verifier resolves its own project root and passes the deterministic local project', () => {
  const result = runVerifier(undefined, { cwd: os.tmpdir() });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Pages: 10/);
  assert.match(result.stdout, /Scanned files: [1-9]\d*/);
  assert.match(result.stdout, /Verification passed/);
});

test('verifier rejects a registered page with a missing quartet file', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/home/index.wxml': null
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pages\/home\/index\.wxml: 缺少已注册页面文件/);
});

test('verifier requires exactly the ten approved page routes', async (t) => {
  const cases = [
    {
      name: 'extra complete route',
      pages: [...PAGE_NAMES, 'extra']
    },
    {
      name: 'substituted route',
      pages: PAGE_NAMES.map((name) => name === 'settings' ? 'account' : name)
    }
  ];

  for (const { name, pages } of cases) {
    await t.test(name, (t) => {
      const overrides = {
        'app.json': JSON.stringify({
          pages: pages.map((page) => `pages/${page}/index`)
        })
      };
      for (const page of ['extra', 'account']) {
        for (const extension of ['js', 'json', 'wxml', 'wxss']) {
          overrides[`pages/${page}/index.${extension}`] = extension === 'json' ? '{}' : '';
        }
      }
      const fixture = makeProjectFixture(t, overrides);
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /app\.json: 必须且只能注册 10 个已批准页面/);
    });
  }
});

test('verifier rejects a directory disguised as any registered page quartet file', async (t) => {
  for (const extension of ['js', 'json', 'wxml', 'wxss']) {
    await t.test(extension, (t) => {
      const fixture = makeProjectFixture(t);
      const disguised = path.join(
        fixture,
        'apps',
        'miniprogram',
        'pages',
        'home',
        `index.${extension}`
      );
      fs.rmSync(disguised);
      fs.mkdirSync(disguised);

      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        new RegExp(`pages/home/index\\.${extension}: 不是可读的已注册页面文件`)
      );
    });
  }
});

test('verifier rejects an unregistered page quartet left in the package', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/legacy/index.js': '',
    'pages/legacy/index.json': '{}',
    'pages/legacy/index.wxml': '',
    'pages/legacy/index.wxss': ''
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pages\/legacy\/index: 未注册的页面四件套/);
});

test('verifier rejects malformed page or component JSON with its file name', (t) => {
  const fixture = makeProjectFixture(t, {
    'components/recommendation-card/index.json': '{ not-json'
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /components\/recommendation-card\/index\.json: JSON 解析失败/);
});

test('verifier rejects prohibited network APIs in first-party source', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/home/index.js': "Page({ load() { wx.request({ url: 'example' }); } });"
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pages\/home\/index\.js: 禁止的网络调用 wx\.request/);
});

test('verifier rejects bracket, destructured, and bound aliases of prohibited network APIs', async (t) => {
  const cases = [
    ["wx['request']({ url: 'local' });", /禁止的网络调用 wx\.request/],
    ['wx["uploadFile"]({});', /禁止的网络调用 wx\.uploadFile/],
    ['const { request: send } = wx; send({});', /禁止的网络调用 wx\.request/],
    ['const send = wx.uploadFile; send({});', /禁止的网络调用 wx\.uploadFile/],
    ['const send = wx.request.bind(wx); send({});', /禁止的网络调用 wx\.request/]
  ];

  for (const [source, expected] of cases) {
    await t.test(source, (t) => {
      const fixture = makeProjectFixture(t, {
        'pages/home/index.js': source
      });
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
    });
  }
});

test('verifier rejects computed wx methods, wx aliases, and global network aliases', async (t) => {
  const cases = [
    ["const method = 'request'; wx[method]({});", /禁止的网络调用 wx\.request/],
    ['const client = wx; client.uploadFile({});', /禁止的网络调用 wx\.uploadFile/],
    ['const client = wx; const method = getMethod(); client[method]({});', /禁止的动态 wx API 访问/],
    ['const send = fetch; send("local");', /禁止的网络调用 fetch/],
    ['const Socket = WebSocket; new Socket("local");', /禁止的网络调用 WebSocket/]
  ];

  for (const [source, expected] of cases) {
    await t.test(source, (t) => {
      const fixture = makeProjectFixture(t, {
        'pages/home/index.js': source
      });
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
    });
  }
});

test('verifier does not treat destructured property keys as local network bindings', async (t) => {
  const cases = [
    [
      'aliased property',
      "const invokeLocal = ({ fetch: localFetch }) => { localFetch('/local-helper'); fetch('/x'); };"
    ],
    [
      'nested aliased property',
      "const invokeLocal = ({ transport: { fetch: localFetch } }) => { localFetch('/local-helper'); fetch('/x'); };"
    ],
    [
      'defaulted aliased property',
      "const invokeLocal = ({ fetch: localFetch = (value) => value }) => { localFetch('/local-helper'); fetch('/x'); };"
    ],
    [
      'aliased property beside a rest binding',
      "const invokeLocal = ({ fetch: localFetch, ...options }) => { localFetch('/local-helper'); fetch('/x'); };"
    ]
  ];

  for (const [name, source] of cases) {
    await t.test(name, (t) => {
      const fixture = makeProjectFixture(t, {
        'pages/home/index.js': source
      });
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        /pages\/home\/index\.js: 禁止的网络调用 fetch/
      );
    });
  }
});

test('verifier recognizes nested, defaulted, and rest destructuring bindings', async (t) => {
  const cases = [
    ['shorthand', "const invokeLocal = ({ fetch }) => fetch('/local-helper');"],
    [
      'nested shorthand',
      "const invokeLocal = ({ transport: { fetch } }) => fetch('/local-helper');"
    ],
    [
      'defaulted shorthand',
      "const invokeLocal = ({ fetch = (value) => value }) => fetch('/local-helper');"
    ],
    [
      'rest binding',
      "const invokeLocal = ({ ...fetch }) => fetch('/local-helper');"
    ]
  ];

  for (const [name, source] of cases) {
    await t.test(name, (t) => {
      const fixture = makeProjectFixture(t, {
        'pages/home/index.js': source
      });
      const result = runVerifier(fixture);

      assert.equal(result.status, 0, result.stderr);
    });
  }
});

test('verifier limits lexical network-name bindings to their for-loop scope', async (t) => {
  const cases = [
    [
      'classic for with let',
      "for (let fetch = helper; false;) { fetch('/local-helper'); }"
    ],
    [
      'for-in with const',
      "for (const fetch in helpers) { fetch('/local-helper'); }"
    ],
    [
      'for-of with const',
      "for (const fetch of helpers) { fetch('/local-helper'); }"
    ],
    [
      'for-of with object destructuring',
      "for (const { fetch } of helpers) { fetch('/local-helper'); }"
    ],
    [
      'destructured default and rest bindings',
      "for (const { fetch = helper, ...rest } of helpers) { fetch('/local-helper'); }"
    ],
    [
      'nested loops without braces',
      "for (const fetch of helpers) for (const item of helpers) fetch('/local-helper');"
    ]
  ];

  for (const [name, loopSource] of cases) {
    await t.test(`${name} allows the local call`, (t) => {
      const fixture = makeProjectFixture(t, {
        'pages/home/index.js': loopSource
      });
      const result = runVerifier(fixture);

      assert.equal(result.status, 0, result.stderr);
    });
    await t.test(`${name} rejects a following global call`, (t) => {
      const fixture = makeProjectFixture(t, {
        'pages/home/index.js': `${loopSource}\nfetch('/actual-network');`
      });
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        /pages\/home\/index\.js: 禁止的网络调用 fetch/
      );
    });
  }
});

test('verifier keeps var bindings function-scoped after a for loop', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/home/index.js': [
      'function invokeLocal(helpers) {',
      "  for (var fetch of helpers) { fetch('/loop-local'); }",
      "  fetch('/function-local');",
      '}'
    ].join('\n')
  });
  const result = runVerifier(fixture);

  assert.equal(result.status, 0, result.stderr);
});

test('verifier delimits every compound for-loop body statement exactly', async (t) => {
  const cases = [
    ['if block', "if (ready) { fetch('/local'); }"],
    [
      'if else blocks',
      "if (ready) { fetch('/local-if'); } else { fetch('/local-else'); }"
    ],
    [
      'nested dangling else',
      "if (ready) if (nested) fetch('/local-nested'); else fetch('/local-inner-else'); else fetch('/local-outer-else');"
    ],
    ['while block', "while (ready) { fetch('/local'); break; }"],
    ['do while', "do { fetch('/local'); } while (ready);"],
    [
      'switch',
      "switch (mode) { case 'local': fetch('/local'); break; default: break; }"
    ],
    [
      'try catch finally',
      "try { fetch('/local-try'); } catch (error) { fetch('/local-catch'); } finally { fetch('/local-finally'); }"
    ],
    [
      'nested for',
      "for (const item of helpers) { fetch('/local'); }"
    ],
    ['labeled statement', "localLabel: if (ready) { fetch('/local'); }"],
    ['empty statement', ';'],
    ['expression statement', "fetch('/local');"],
    ['declaration statement', "var localResult = fetch('/local');"],
    ['block statement', "{ fetch('/local'); }"]
  ];

  for (const [name, body] of cases) {
    const loopSource = `for (const { fetch } of helpers) ${body}`;
    await t.test(`${name} keeps the local binding`, (t) => {
      const fixture = makeProjectFixture(t, {
        'pages/home/index.js': loopSource
      });
      const result = runVerifier(fixture);

      assert.equal(result.status, 0, result.stderr);
    });
    await t.test(`${name} ends before a following global call`, (t) => {
      const fixture = makeProjectFixture(t, {
        'pages/home/index.js': `${loopSource}\nfetch('/global');`
      });
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        /pages\/home\/index\.js: 禁止的网络调用 fetch/
      );
    });
  }
});

test('verifier delimits legal Annex-B function declarations in if branches', async (t) => {
  const cases = [
    [
      'single consequence captures the loop binding',
      [
        'for (const { fetch } of helpers)',
        "  if (ready) function legacy() { fetch('/loop-local'); }"
      ].join('\n')
    ],
    [
      'both branches keep function parameters local',
      [
        'for (const { fetch } of helpers)',
        "  if (ready) function yes(fetch) { fetch('/yes-local'); }",
        "  else function no(fetch) { fetch('/no-local'); }"
      ].join('\n')
    ],
    [
      'strict mode uses a block-scoped declaration',
      [
        "'use strict';",
        'for (const { fetch } of helpers)',
        "  if (ready) { function strictLocal(fetch) { fetch('/strict-local'); } }"
      ].join('\n')
    ]
  ];

  for (const [name, source] of cases) {
    assert.doesNotThrow(() => new Function(source), name);
    await t.test(`${name} allows shadowed calls`, (t) => {
      const fixture = makeProjectFixture(t, {
        'pages/home/index.js': source
      });
      const result = runVerifier(fixture);

      assert.equal(result.status, 0, result.stderr);
    });
    await t.test(`${name} rejects a following global call`, (t) => {
      const withGlobalCall = `${source}\nfetch('/global');`;
      assert.doesNotThrow(() => new Function(withGlobalCall), name);
      const fixture = makeProjectFixture(t, {
        'pages/home/index.js': withGlobalCall
      });
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        /pages\/home\/index\.js: 禁止的网络调用 fetch/
      );
    });
  }
});

test('verifier ignores network API words outside real JS calls and allows known safe wx UI APIs', async (t) => {
  const cases = [
    {
      name: 'shadowed local JavaScript names',
      override: {
        'pages/home/index.js': [
          "const fetch = 'local label';",
          'const WebSocket = { state: "closed" };',
          'const XMLHttpRequest = class LocalRequest {};',
          'Page({ data: { fetch, WebSocket, XMLHttpRequest } });'
        ].join('\n')
      }
    },
    {
      name: 'WXSS class names',
      override: {
        'pages/home/index.wxss': [
          '.fetch {}',
          '.WebSocket {}',
          '.XMLHttpRequest {}'
        ].join('\n')
      }
    },
    {
      name: 'shadowed arrow-function parameter',
      override: {
        'pages/home/index.js': [
          'const invokeLocal = (fetch) => {',
          "  return fetch('local value');",
          '};',
          'invokeLocal((value) => value);'
        ].join('\n')
      }
    },
    {
      name: 'statically known safe computed wx UI method',
      override: {
        'pages/home/index.js': [
          "const api = 'show' + 'Toast';",
          "wx[api]({ title: '本地提示' });"
        ].join('\n')
      }
    }
  ];

  for (const { name, override } of cases) {
    await t.test(name, (t) => {
      const fixture = makeProjectFixture(t, override);
      const result = runVerifier(fixture);

      assert.equal(result.status, 0, result.stderr);
    });
  }
});

test('verifier rejects wx aliases destructured from globalThis', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/home/index.js': [
      'const { wx: platform } = globalThis;',
      "platform.request({ url: 'local' });"
    ].join('\n')
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pages\/home\/index\.js: 禁止的网络调用 wx\.request/);
});

test('verifier rejects parenthesized globalThis computed wx aliases', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/home/index.js': [
      "const platform = (globalThis)['w' + 'x'];",
      "platform.request({ url: 'local' });"
    ].join('\n')
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pages\/home\/index\.js: 禁止的网络调用 wx\.request/);
});

test('verifier rejects constant-folded or unresolved global network access and assembled URLs', async (t) => {
  const cases = [
    {
      name: 'computed global fetch with joined URL',
      source: [
        "const send = globalThis['fe' + 'tch'];",
        "send(['https', ':', '/', '/', 'example', '.', 'com'].join(''));"
      ].join('\n'),
      expected: /禁止的网络调用 fetch|禁止的远程 URL/
    },
    {
      name: 'computed global wx request',
      source: [
        "const platform = globalThis['w' + 'x'];",
        "platform['re' + 'quest']({ url: 'local' });"
      ].join('\n'),
      expected: /禁止的网络调用 wx\.request/
    },
    {
      name: 'parenthesized globalThis alias',
      source: [
        'const root = (globalThis);',
        "const send = root['fe' + 'tch'];",
        "send('local');"
      ].join('\n'),
      expected: /禁止的网络调用 fetch/
    },
    {
      name: 'mutable globalThis alias assigned after declaration',
      source: [
        'let root;',
        'root = globalThis;',
        "root['fe' + 'tch']('local');"
      ].join('\n'),
      expected: /禁止的网络调用 fetch/
    },
    {
      name: 'mutable wx alias assigned after declaration',
      source: [
        'let platform;',
        'platform = wx;',
        "platform['re' + 'quest']({ url: 'local' });"
      ].join('\n'),
      expected: /禁止的网络调用 wx\.request/
    },
    {
      name: 'unresolved dynamic global access',
      source: [
        'const send = globalThis[getApiName()];',
        "send('local');"
      ].join('\n'),
      expected: /禁止的动态全局 API 访问/
    },
    {
      name: 'reassigned computed wx method is treated as dynamic',
      source: [
        "let method = 'localOnly';",
        "method = 'request';",
        'wx[method]({});'
      ].join('\n'),
      expected: /禁止的动态 wx API 访问/
    },
    {
      name: 'standalone joined remote URL',
      source: "const remote = ['https', ':', '/', '/', 'example', '.', 'com'].join('');",
      expected: /禁止的远程 URL/
    },
    {
      name: 'constant array joined into remote URL',
      source: [
        "const parts = ['https', ':', '/', '/', 'example', '.', 'com'];",
        "const remote = parts.join('');"
      ].join('\n'),
      expected: /禁止的远程 URL/
    }
  ];

  for (const { name, source, expected } of cases) {
    await t.test(name, (t) => {
      const fixture = makeProjectFixture(t, {
        'pages/home/index.js': source
      });
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
    });
  }
});

test('verifier rejects remote URLs assembled with computed array join members', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/home/index.js': [
      "const parts = ['https', ':', '/', '/', 'example', '.', 'com'];",
      "const remote = parts['jo' + 'in']('');"
    ].join('\n')
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pages\/home\/index\.js: 禁止的远程 URL/);
});

test('verifier rejects evidence metadata flowing into image, navigation, or WebView runtime paths', async (t) => {
  const cases = [
    {
      source: '<image src="{{rule.evidenceUrl}}" />',
      expected: /禁止将 evidenceUrl 用于运行时资源/
    },
    {
      source: '<web-view src="{{rule.evidenceUrl}}"></web-view>',
      expected: /禁止 WebView/
    },
    {
      source: '<navigator url="{{rule.evidenceUrl}}">依据</navigator>',
      expected: /禁止将 evidenceUrl 用于运行时资源/
    }
  ];

  for (const { source, expected } of cases) {
    await t.test(source, (t) => {
      const fixture = makeProjectFixture(t, {
        'pages/home/index.wxml': `${REQUIRED_FIXTURE_FILES['pages/home/index.wxml']}\n${source}`
      });
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
    });
  }

  await t.test('navigation API alias', (t) => {
    const fixture = makeProjectFixture(t, {
      'pages/home/index.js': 'const nav = wx.navigateTo; nav({ url: rule.evidenceUrl });'
    });
    const result = runVerifier(fixture);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /禁止将 evidenceUrl 用于运行时资源/);
  });

  await t.test('computed evidence key', (t) => {
    const fixture = makeProjectFixture(t, {
      'pages/home/index.js': [
        "const key = 'evidence' + 'Url';",
        'wx.navigateTo({ url: rule[key] });'
      ].join('\n')
    });
    const result = runVerifier(fixture);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /禁止将 evidenceUrl 用于运行时资源/);
  });

  await t.test('escaped evidence key', (t) => {
    const fixture = makeProjectFixture(t, {
      'pages/home/index.js': [
        "const key = 'evidence\\u0055rl';",
        'wx.navigateTo({ url: rule[key] });'
      ].join('\n')
    });
    const result = runVerifier(fixture);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /禁止将 evidenceUrl 用于运行时资源/);
  });
});

test('verifier rejects nonliteral evidence values and computed evidence propagation', async (t) => {
  const cases = [
    {
      name: 'joined unallowlisted evidence value',
      override: {
        'data/trend-rules.js': [
          'const bypassRule = {',
          '  evidenceUrl: [',
          "    'https', ':', '/', '/', 'evil', '.', 'example', '/source'",
          "  ].join('')",
          '};'
        ].join('\n')
      },
      expected: /evidenceUrl 必须是直接字符串字面量/
    },
    {
      name: 'concatenated allowlisted evidence value',
      override: {
        'data/style-rules-v2.js': [
          'const bypassRule = {',
          "  evidenceUrl: 'https://' + 'openstd.samr.gov.cn/source'",
          '};'
        ].join('\n')
      },
      expected: /evidenceUrl 必须是直接字符串字面量/
    },
    {
      name: 'computed evidence key in metadata object',
      override: {
        'data/trend-rules.js': [
          "const evidenceKey = ['evidence', 'Url'].join('');",
          'const bypassRule = {',
          "  [evidenceKey]: 'https://www.cntac.org.cn/source'",
          '};'
        ].join('\n')
      },
      expected: /evidenceUrl 必须使用直接属性键/
    },
    {
      name: 'unresolved computed evidence key and value',
      override: {
        'data/trend-rules.js': [
          'const evidenceKey = readEvidenceKey();',
          'const evidenceValue = readEvidenceValue();',
          'const bypassRule = { [evidenceKey]: evidenceValue };'
        ].join('\n')
      },
      expected: /证据文件禁止未解析的计算属性键/
    },
    {
      name: 'computed evidence import propagation to navigation',
      override: {
        'pages/home/index.js': [
          "const evidenceKey = ['evidence', 'Url'].join('');",
          "const metadata = require('../../data/trend-rules');",
          'const remote = metadata.TREND_RULES[0][evidenceKey];',
          'wx.navigateTo({ url: remote });'
        ].join('\n')
      },
      expected: /禁止导入证据元数据|禁止将 evidenceUrl 用于运行时资源/
    },
    {
      name: 'template evidence import with key-agnostic extraction to navigation',
      override: {
        'pages/home/index.js': [
          'const metadata = require(`../../data/trend-rules`);',
          'const values = Object.values(metadata.TREND_RULES[0]);',
          "const remote = values.find((value) => typeof value === 'string' && value.startsWith('https'));",
          'wx.navigateTo({ url: remote });'
        ].join('\n')
      },
      expected: /禁止导入证据元数据/
    },
    {
      name: 'aliased evidence import propagation to image',
      override: {
        'pages/home/index.js': [
          "const rules = require('../../data/style-rules-v2');",
          "const key = 'evidence' + 'Url';",
          'const remote = rules.STYLE_RULES_V2[0][key];',
          'const open = wx.previewImage;',
          'open({ urls: [remote] });'
        ].join('\n')
      },
      expected: /禁止导入证据元数据|禁止将 evidenceUrl 用于运行时资源/
    }
  ];

  for (const { name, override, expected } of cases) {
    await t.test(name, (t) => {
      const fixture = makeProjectFixture(t, override);
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
    });
  }
});

test('verifier requires both imported evidence rule families to use the safe-field projection', (t) => {
  const fixture = makeProjectFixture(t, {
    'services/rule-resolver.js': REQUIRED_FIXTURE_FILES['services/rule-resolver.js']
      .replaceAll('projectSafeRuleCandidate(candidate)', 'candidate')
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /services\/rule-resolver\.js: 证据规则必须通过安全字段投影/
  );
});

test('verifier ignores comments when proving both resolver dataflow projections', (t) => {
  const unsafeResolver = REQUIRED_FIXTURE_FILES['services/rule-resolver.js']
    .replace(
      "return resolved('stable', 'clothing', 'stable', projectSafeRuleCandidate(candidate));",
      "return resolved('stable', 'clothing', 'stable', candidate);"
    )
    .replace(
      "return resolved('trend', 'clothing', 'seasonal_trend', projectSafeRuleCandidate(candidate));",
      "return resolved('trend', 'clothing', 'seasonal_trend', candidate);"
    )
    .concat([
      '',
      '// projectSafeRuleCandidate(candidate)',
      '/* projectSafeRuleCandidate(candidate) */'
    ].join('\n'));
  const fixture = makeProjectFixture(t, {
    'services/rule-resolver.js': unsafeResolver
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /services\/rule-resolver\.js: 证据规则必须通过安全字段投影/
  );
});

test('verifier requires projection at the actual stable and trend resolver call sites', (t) => {
  const unsafeResolver = REQUIRED_FIXTURE_FILES['services/rule-resolver.js']
    .replace(
      "return resolved('stable', 'clothing', 'stable', projectSafeRuleCandidate(candidate));",
      "return resolved('stable', 'clothing', 'stable', candidate);"
    )
    .replace(
      "return resolved('trend', 'clothing', 'seasonal_trend', projectSafeRuleCandidate(candidate));",
      "return resolved('trend', 'clothing', 'seasonal_trend', candidate);"
    )
    .concat([
      '',
      "resolved('decoy-stable', 'clothing', 'stable', projectSafeRuleCandidate(candidate));",
      "resolved('decoy-trend', 'clothing', 'seasonal_trend', projectSafeRuleCandidate(candidate));"
    ].join('\n'));
  const fixture = makeProjectFixture(t, {
    'services/rule-resolver.js': unsafeResolver
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /services\/rule-resolver\.js: 证据规则必须通过安全字段投影/
  );
});

test('verifier rejects unreachable projection decoys beside unsafe resolver calls', (t) => {
  const unsafeResolver = [
    "const SAFE_RULE_RUNTIME_FIELDS = Object.freeze(['ruleId', 'scene', 'recommendation', 'techniques']);",
    'function projectSafeRuleCandidate(candidate) {',
    '  return Object.fromEntries(SAFE_RULE_RUNTIME_FIELDS.map((field) => [field, candidate[field]]));',
    '}',
    'function stableRules(profile) {',
    '  if (false) {',
    "    resolved('decoy-stable', 'clothing', 'stable', projectSafeRuleCandidate(candidate));",
    '  }',
    '  return STYLE_RULES_V2.map((candidate) => resolved(',
    '    candidate.ruleId,',
    "    'clothing',",
    "    'stable',",
    '    candidate',
    '  ));',
    '}',
    'function trendRules(profile) {',
    '  if (false) {',
    "    resolved('decoy-trend', 'clothing', 'seasonal_trend', projectSafeRuleCandidate(candidate));",
    '  }',
    '  return TREND_RULES.map((candidate) => resolved(',
    '    candidate.ruleId,',
    "    'clothing',",
    "    'seasonal_trend',",
    '    candidate',
    '  ));',
    '}'
  ].join('\n');
  const fixture = makeProjectFixture(t, {
    'services/rule-resolver.js': unsafeResolver
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /services\/rule-resolver\.js: 证据规则必须通过安全字段投影/
  );
});

test('verifier rejects parenthesized unsafe resolver calls beside safe decoys', (t) => {
  const unsafeResolver = [
    "const SAFE_RULE_RUNTIME_FIELDS = Object.freeze(['ruleId', 'scene', 'recommendation', 'techniques']);",
    'function projectSafeRuleCandidate(candidate) {',
    '  return Object.fromEntries(SAFE_RULE_RUNTIME_FIELDS.map((field) => [field, candidate[field]]));',
    '}',
    'function stableRules(profile) {',
    '  if (false) {',
    "    resolved('decoy-stable', 'clothing', 'stable', projectSafeRuleCandidate(candidate));",
    '  }',
    "  return (resolved)('stable', 'clothing', 'stable', candidate);",
    '}',
    'function trendRules(profile) {',
    '  if (false) {',
    "    resolved('decoy-trend', 'clothing', 'seasonal_trend', projectSafeRuleCandidate(candidate));",
    '  }',
    "  return (resolved)('trend', 'clothing', 'seasonal_trend', candidate);",
    '}'
  ].join('\n');
  const fixture = makeProjectFixture(t, {
    'services/rule-resolver.js': unsafeResolver
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /services\/rule-resolver\.js: 证据规则必须通过安全字段投影/
  );
});

test('verifier rejects an identity safe-rule projection implementation', (t) => {
  const identityProjection = REQUIRED_FIXTURE_FILES['services/rule-resolver.js']
    .replace(
      [
        'function projectSafeRuleCandidate(candidate) {',
        '  return Object.fromEntries(SAFE_RULE_RUNTIME_FIELDS.map((field) => [field, candidate[field]]));',
        '}'
      ].join('\n'),
      [
        'function projectSafeRuleCandidate(candidate) {',
        '  return candidate;',
        '}'
      ].join('\n')
    );
  const fixture = makeProjectFixture(t, {
    'services/rule-resolver.js': identityProjection
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /services\/rule-resolver\.js: 证据规则必须通过安全字段投影/
  );
});

test('verifier accepts a safe-rule projection with renamed values and an allowlist loop', (t) => {
  const equivalentProjection = [
    "const SAFE_RULE_RUNTIME_FIELDS = Object.freeze(['ruleId', 'scene', 'recommendation', 'techniques']);",
    'function projectSafeRuleCandidate(rule) {',
    '  const projected = {};',
    '  for (const field of SAFE_RULE_RUNTIME_FIELDS) {',
    '    if (Object.hasOwn(rule, field)) projected[field] = rule[field];',
    '  }',
    '  return Object.freeze(projected);',
    '}',
    'function stableRules() {',
    "  return resolved('stable', 'clothing', 'stable', projectSafeRuleCandidate(rule));",
    '}',
    'function trendRules() {',
    "  return resolved('trend', 'clothing', 'seasonal_trend', projectSafeRuleCandidate(rule));",
    '}'
  ].join('\n');
  const fixture = makeProjectFixture(t, {
    'services/rule-resolver.js': equivalentProjection
  });
  const result = runVerifier(fixture);

  assert.equal(result.status, 0, result.stderr);
});

test('verifier rejects safe-field projection callbacks that rewrite the field', (t) => {
  const rewrittenFieldProjection = REQUIRED_FIXTURE_FILES['services/rule-resolver.js']
    .replace(
      'return Object.fromEntries(SAFE_RULE_RUNTIME_FIELDS.map((field) => [field, candidate[field]]));',
      [
        'return Object.fromEntries(SAFE_RULE_RUNTIME_FIELDS.map((field) => (',
        "  field = Object.keys(candidate).find((key) => key.endsWith('Url')),",
        '  [field, candidate[field]]',
        ')));'
      ].join('\n')
    );
  const fixture = makeProjectFixture(t, {
    'services/rule-resolver.js': rewrittenFieldProjection
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /services\/rule-resolver\.js: 证据规则必须通过安全字段投影/
  );
});

test('verifier rejects evidenceUrl from the resolver runtime-field allowlist', (t) => {
  const fixture = makeProjectFixture(t, {
    'services/rule-resolver.js': REQUIRED_FIXTURE_FILES['services/rule-resolver.js']
      .replace("'techniques'", "'evidenceUrl'")
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /services\/rule-resolver\.js: 安全字段投影不得包含 evidenceUrl/
  );
});

test('verifier rejects model keys and client credential shapes', async (t) => {
  const cases = [
    "const token = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456';",
    "const OPENAI_API_KEY = 'secret-value';",
    "const config = { SecretId: 'AKIDexample', SecretKey: 'secret-value' };",
    "const config = { apiKey: 'provider-secret-value' };"
  ];

  for (const source of cases) {
    await t.test(source, (t) => {
      const fixture = makeProjectFixture(t, {
        'pages/home/index.js': source
      });
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /禁止的模型密钥或客户端凭据/);
    });
  }
});

test('verifier rejects remote component, plugin provider, and remote JSON URL declarations', async (t) => {
  const cases = [
    {
      override: {
        'pages/home/index.json': JSON.stringify({
          usingComponents: { remote: 'https://cdn.example.com/widget' }
        })
      },
      expected: /pages\/home\/index\.json: 禁止的远程组件引用/
    },
    {
      override: {
        'pages/home/index.json': JSON.stringify({
          usingComponents: { remote: 'plugin:\/\/vendor\/widget' }
        })
      },
      expected: /pages\/home\/index\.json: 禁止的插件组件引用/
    },
    {
      override: {
        'pages/home/index.json': JSON.stringify({
          plugins: { vendor: { version: '1.0.0', provider: 'wx123' } }
        })
      },
      expected: /pages\/home\/index\.json: 禁止的插件或服务提供方声明/
    },
    {
      override: {
        'pages/home/index.json': JSON.stringify({
          helpUrl: 'https://example.com/help'
        })
      },
      expected: /pages\/home\/index\.json: 禁止的远程 URL/
    }
  ];

  for (const { override, expected } of cases) {
    await t.test(JSON.stringify(override), (t) => {
      const fixture = makeProjectFixture(t, override);
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
    });
  }
});

test('verifier rejects remote URLs in first-party source', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/home/index.wxss': '.hero { background-image: url("https://cdn.example.com/a.png"); }'
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pages\/home\/index\.wxss: 禁止的远程 URL/);
});

test('verifier rejects prohibited judgment wording but allows the approved negative promise', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/preferences/index.wxml': '选择场景（单选）\n风格偏好（可多选）\n生成我的建议\n标准脸模板'
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pages\/preferences\/index\.wxml: 禁止用语“标准脸”/);
  assert.doesNotMatch(result.stderr, /禁止用语“颜值”/);
});

test('verifier permits persisting non-photo session report and preference values', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/capture/index.js': [
      'const session = getApp().globalData.session;',
      "wx.setStorageSync('report', session.report);",
      "wx.setStorageSync('preferences', session.preferences);"
    ].join('\n')
  });
  const result = runVerifier(fixture);

  assert.equal(result.status, 0, result.stderr);
});

test('verifier rejects an aliased photo path passed to asynchronous storage', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/capture/index.js': [
      'const selectedPath = getApp().globalData.session.photoPath;',
      "wx.setStorage({ key: 'saved-photo', data: selectedPath });"
    ].join('\n')
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pages\/capture\/index\.js: 禁止持久化照片路径/);
});

test('verifier rejects direct computed globalThis photo storage calls', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/capture/index.js': [
      "globalThis['w' + 'x']['set' + 'StorageSync'](",
      "  'photo',",
      '  getApp().globalData.session.photoPath',
      ');'
    ].join('\n')
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pages\/capture\/index\.js: 禁止持久化照片路径/);
});

test('verifier rejects photo storage after a parenthesized globalThis root', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/capture/index.js': [
      "(globalThis)['w' + 'x']['set' + 'StorageSync'](",
      "  'photo',",
      '  getApp().globalData.session.photoPath',
      ');'
    ].join('\n')
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pages\/capture\/index\.js: 禁止持久化照片路径/);
});

test('verifier rejects photo storage aliases invoked with Function.call', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/capture/index.js': [
      'const persist = wx.setStorageSync;',
      "persist.call(wx, 'photo', getApp().globalData.session.photoPath);"
    ].join('\n')
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pages\/capture\/index\.js: 禁止持久化照片路径/);
});

test('verifier rejects photo storage aliases invoked with Function.apply', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/capture/index.js': [
      'const persist = wx.setStorageSync;',
      "persist.apply(wx, ['photo', getApp().globalData.session.photoPath]);"
    ].join('\n')
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pages\/capture\/index\.js: 禁止持久化照片路径/);
});

test('verifier rejects photo paths persisted through storage aliases and bracket members', async (t) => {
  const cases = [
    {
      name: 'direct function alias',
      source: [
        'const persist = wx.setStorageSync;',
        "persist('saved-photo', getApp().globalData.session.photoPath);"
      ].join('\n')
    },
    {
      name: 'literal bracket member',
      source: [
        "wx['setStorageSync'](",
        "  'saved-photo',",
        '  getApp().globalData.session.photoPath',
        ');'
      ].join('\n')
    },
    {
      name: 'destructured asynchronous alias',
      source: [
        'const { setStorage: persist } = wx;',
        'const selectedPath = getApp().globalData.session.photoPath;',
        "persist({ key: 'saved-photo', data: selectedPath });"
      ].join('\n')
    },
    {
      name: 'bound computed member alias',
      source: [
        "const method = 'set' + 'StorageSync';",
        'const persist = wx[method].bind(wx);',
        'const selectedPath = getApp().globalData.session.photoPath;',
        "persist('saved-photo', selectedPath);"
      ].join('\n')
    },
    {
      name: 'mutable storage alias assigned after declaration',
      source: [
        'let persist;',
        "persist = wx['set' + 'StorageSync'];",
        "persist('saved-photo', getApp().globalData.session.photoPath);"
      ].join('\n')
    },
    {
      name: 'computed storage destructuring key',
      source: [
        "const { ['set' + 'StorageSync']: persist } = wx;",
        "persist('saved-photo', getApp().globalData.session.photoPath);"
      ].join('\n')
    },
    {
      name: 'computed globalThis wx storage alias',
      source: [
        "const platform = globalThis['w' + 'x'];",
        'const { setStorageSync: persist } = platform;',
        "persist('saved-photo', getApp().globalData.session.photoPath);"
      ].join('\n')
    }
  ];

  for (const { name, source } of cases) {
    await t.test(name, (t) => {
      const fixture = makeProjectFixture(t, {
        'pages/capture/index.js': source
      });
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /pages\/capture\/index\.js: 禁止持久化照片路径/);
    });
  }
});

test('verifier rejects photo paths passed to common file persistence APIs', async (t) => {
  const cases = [
    {
      name: 'wx.saveFile',
      source: [
        'const session = getApp().globalData.session;',
        'wx.saveFile({ tempFilePath: session.photoPath });'
      ].join('\n')
    },
    {
      name: 'FileSystemManager.writeFile',
      source: [
        'const files = wx.getFileSystemManager();',
        'const selectedPath = getApp().globalData.session.photoPath;',
        "files.writeFile({ filePath: `${wx.env.USER_DATA_PATH}/photo.txt`, data: selectedPath });"
      ].join('\n')
    },
    {
      name: 'FileSystemManager.copyFile',
      source: [
        'const files = wx.getFileSystemManager();',
        'const selectedPath = getApp().globalData.session.tempFilePath;',
        "files.copyFile({ srcPath: selectedPath, destPath: `${wx.env.USER_DATA_PATH}/photo.jpg` });"
      ].join('\n')
    }
  ];

  for (const { name, source } of cases) {
    await t.test(name, (t) => {
      const fixture = makeProjectFixture(t, {
        'pages/capture/index.js': source
      });
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /pages\/capture\/index\.js: 禁止持久化照片路径/);
    });
  }
});

test('verifier rejects unapproved runtime media bindings and accepts controlled local assets', async (t) => {
  const cases = [
    {
      name: 'remote-looking image field',
      markup: '<image src="{{remoteUrl}}" />',
      accepted: false
    },
    {
      name: 'remote-looking video field',
      markup: '<video src="{{media.remoteUrl}}" poster="{{posterUrl}}"></video>',
      accepted: false
    },
    {
      name: 'controlled local asset field',
      markup: '<image src="{{layer.assetPath}}" />',
      accepted: true
    },
    {
      name: 'temporary local photo field',
      markup: '<image src="{{previewPath}}" />',
      accepted: true
    },
    {
      name: 'controlled local asset fragment',
      markup: '<image src="../../assets/icons/{{result.passed ? \'check\' : \'close\'}}.svg" />',
      accepted: true
    }
  ];

  for (const { name, markup, accepted } of cases) {
    await t.test(name, (t) => {
      const fixture = makeProjectFixture(t, {
        'pages/home/index.wxml': [
          REQUIRED_FIXTURE_FILES['pages/home/index.wxml'],
          markup
        ].join('\n')
      });
      const result = runVerifier(fixture);

      if (accepted) {
        assert.equal(result.status, 0, result.stderr);
      } else {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /运行时媒体绑定必须使用受控本地资产字段/);
      }
    });
  }
});

test('verifier requires substantive JavaScript and WXML for every approved page', async (t) => {
  const cases = [
    ['pages/profile/index.js', ' \n// placeholder only\n/* no page logic */'],
    ['pages/profile/index.wxml', ' \n<!-- placeholder only -->\n']
  ];

  for (const [relative, source] of cases) {
    await t.test(relative, (t) => {
      const fixture = makeProjectFixture(t, {
        [relative]: source
      });
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        new RegExp(`${relative.replaceAll('.', '\\.').replaceAll('/', '\\/')}: 已批准页面必须包含实质内容`)
      );
    });
  }
});

test('verifier rejects missing required home content', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/home/index.wxml': REQUIRED_FIXTURE_FILES['pages/home/index.wxml']
      .replace('手动完成造型档案', '开始')
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pages\/home\/index\.wxml: 缺少静态可见内容“手动完成造型档案”/);
});

test('verifier rejects a missing report section', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/result/index.wxml': REQUIRED_FIXTURE_FILES['pages/result/index.wxml']
      .replace('配饰与眼镜', '其他')
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /pages\/result\/index\.wxml: 报告必须按批准的 12 段顺序且各出现一次/
  );
});

test('verifier rejects reordered or duplicated approved report sections', async (t) => {
  const reordered = resultMarkup
    .replace('本次由用户确认的依据', '__FIRST__')
    .replace('今日最值得先尝试的三项', '本次由用户确认的依据')
    .replace('__FIRST__', '今日最值得先尝试的三项');
  const duplicated = resultMarkup.replace('替代方案', '场合切换');
  for (const [name, markup] of [['reordered', reordered], ['duplicated', duplicated]]) {
    await t.test(name, (t) => {
      const fixture = makeProjectFixture(t, {
        'pages/result/index.wxml': `${markup}\n重新分析\n隐私与本地数据`
      });
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /pages\/result\/index\.wxml: 报告必须按批准的 12 段顺序且各出现一次/);
    });
  }
});

test('verifier requires all four native visual component quartets and result registrations', async (t) => {
  await t.test('missing native component file', (t) => {
    const fixture = makeProjectFixture(t, {
      'components/overall-look/index.wxss': null
    });
    const result = runVerifier(fixture);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /components\/overall-look\/index\.wxss: 缺少原生视觉组件文件/);
  });

  await t.test('missing result registration', (t) => {
    const config = JSON.parse(resultComponentConfig);
    delete config.usingComponents['outfit-collage'];
    const fixture = makeProjectFixture(t, {
      'pages/result/index.json': JSON.stringify(config)
    });
    const result = runVerifier(fixture);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /pages\/result\/index\.json: 缺少本地视觉组件 outfit-collage/);
  });

  await t.test('wrong visual layer order', (t) => {
    const markup = resultMarkup
      .replace('<overall-look layer="{{report.visualLayers.overall}}" />', '__OVERALL__')
      .replace('<garment-technical layer="{{report.visualLayers.technical}}" />', '<overall-look layer="{{report.visualLayers.overall}}" />')
      .replace('__OVERALL__', '<garment-technical layer="{{report.visualLayers.technical}}" />');
    const fixture = makeProjectFixture(t, {
      'pages/result/index.wxml': `${markup}\n重新分析\n隐私与本地数据`
    });
    const result = runVerifier(fixture);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /三层视觉组件必须按整体示意、单品拼贴、技术结构顺序呈现/);
  });
});

test('verifier rejects missing controlled color, garment, hair-color, and report-family fields', async (t) => {
  const cases = [
    ['color plan', 'services/report-state.js', "'screenColorDisclaimer'", /缺少受控字段 screenColorDisclaimer/],
    ['garment', 'data/garment-taxonomy.js', "'shoulderConstruction'", /缺少受控字段 shoulderConstruction/],
    ['hair color', 'data/hair-color-rules.js', "'bleachExpectation'", /缺少受控字段 bleachExpectation/],
    ['makeup family', 'services/report-state.js', "'makeup'", /缺少受控字段 makeup/],
    ['scene family', 'services/report-state.js', "'sceneTransition'", /缺少受控字段 sceneTransition/]
  ];

  for (const [name, file, field, expected] of cases) {
    await t.test(name, (t) => {
      const fixture = makeProjectFixture(t, {
        [file]: REQUIRED_FIXTURE_FILES[file].replace(field, "'removedField'")
      });
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
    });
  }
});

test('verifier rejects missing or escaping local asset paths', async (t) => {
  await t.test('missing referenced asset', (t) => {
    const fixture = makeProjectFixture(t, {
      'assets/styling/overall.svg': null
    });
    const result = runVerifier(fixture);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /assets\/styling\/overall\.svg: 引用的本地资产不存在/);
  });

  await t.test('asset traversal', (t) => {
    const fixture = makeProjectFixture(t, {
      'services/visual-layer-builder.js': REQUIRED_FIXTURE_FILES['services/visual-layer-builder.js']
        .replace('/assets/styling/overall.svg', '/assets/../outside.svg')
    });
    const result = runVerifier(fixture);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /禁止越界的本地资产路径/);
  });

  await t.test('remote reference inside SVG', (t) => {
    const fixture = makeProjectFixture(t, {
      'assets/styling/overall.svg': [
        '<svg xmlns="http://www.w3.org/2000/svg">',
        '<image href="https://cdn.example.com/look.png" />',
        '</svg>'
      ].join('')
    });
    const result = runVerifier(fixture);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /assets\/styling\/overall\.svg: 禁止的远程 URL/);
  });
});

test('verifier rejects a missing granular deletion entry point', (t) => {
  const fixture = makeProjectFixture(t, {
    'pages/settings/index.wxml': REQUIRED_FIXTURE_FILES['pages/settings/index.wxml']
      .replace('清除收藏', '收藏')
  });
  const result = runVerifier(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pages\/settings\/index\.wxml: 缺少删除入口“清除收藏”/);
});

test('verifier rejects legacy simulated-analysis files and copy', async (t) => {
  const cases = [
    {
      override: { 'services/simulated-analysis.js': 'module.exports = {};' },
      expected: /services\/simulated-analysis\.js: 禁止遗留的模拟分析模块/
    },
    {
      override: {
        'pages/processing/index.wxml': [
          REQUIRED_FIXTURE_FILES['pages/processing/index.wxml'],
          '本地演示 AI'
        ].join('\n')
      },
      expected: /禁止伪造观察或自动外貌分析/
    }
  ];

  for (const { override, expected } of cases) {
    await t.test(JSON.stringify(override), (t) => {
      const fixture = makeProjectFixture(t, override);
      const result = runVerifier(fixture);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
    });
  }
});

test('verifier accepts the deterministic local project with audited evidence metadata', () => {
  const result = verifyProject(projectRoot);

  assert.deepEqual(result.errors, []);
  assert.equal(result.pageCount, 10);
  assert.ok(result.scannedFileCount >= MINIMUM_AUDITED_FILE_COUNT);
});

test('verifier rejects simulated appearance analysis symbols in source', (t) => {
  const result = verifyProject(projectWithSource(t, 'simulateFeatures(meta);'));

  assert.ok(result.errors.some((error) => (
    error.includes('禁止伪造观察或自动外貌分析')
  )));
});

test('verifier rejects demo analysis modes and automatic attractiveness claims', async (t) => {
  for (const source of ["const mode = 'local-demo';", "const note = '自动识别颜值';"]) {
    await t.test(source, (child) => {
      const result = verifyProject(projectWithSource(child, source));

      assert.ok(result.errors.some((error) => (
        error.includes('禁止伪造观察或自动外貌分析')
      )));
    });
  }
});
