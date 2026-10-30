const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildStyleProfile,
  createDefaultPreferences
} = require('../apps/miniprogram/services/profile-contract');
const { generateReport } = require('../apps/miniprogram/services/recommendation-engine');

const NOW = '2026-07-29T00:00:00.000Z';
const GARMENT_KEYS = [
  'necklineOrCollar', 'shoulderConstruction', 'waistPlacement', 'length',
  'sleeveLength', 'trouserRise', 'legShape', 'skirtShape', 'ease',
  'materialAppearance'
];

function fixture({
  presentationMode = 'neutral',
  appearance = {},
  preferences = {},
  feedbackSummary = {}
} = {}) {
  const profile = buildStyleProfile({
    analysisMode: 'manual',
    appearance,
    feedbackSummary,
    preferences: {
      ...createDefaultPreferences(),
      presentationMode,
      scenes: ['commute'],
      desiredEffects: ['clean', 'vertical'],
      ...preferences
    }
  });
  return {
    profile,
    report: generateReport(profile, { now: NOW })
  };
}

function loadBuilder() {
  return require('../apps/miniprogram/services/visual-layer-builder').buildVisualLayers;
}

function colorBlocksFromReport(report) {
  return ['main', 'secondary', 'accent'].map((role) => ({
    name: report.colorPlan[role].name,
    hex: report.colorPlan[role].hex,
    percentage: report.colorPlan[role].percentage
  }));
}

test('four controlled presentation modes select four identity-free overall assets', () => {
  const buildVisualLayers = loadBuilder();
  const expected = {
    womenswear: '/assets/styling/overall-womenswear.svg',
    menswear: '/assets/styling/overall-menswear.svg',
    neutral: '/assets/styling/overall-neutral.svg',
    mixed: '/assets/styling/overall-mixed.svg'
  };

  for (const [presentationMode, assetPath] of Object.entries(expected)) {
    const { report, profile } = fixture({ presentationMode });
    assert.equal(buildVisualLayers(report, profile).overall.assetPath, assetPath);
  }
});

test('each visual layer supplies Chinese display copy, alt text, and a non-try-on disclaimer', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture();
  const layers = buildVisualLayers(report, profile);

  for (const layer of [layers.overall, layers.collage, layers.technical]) {
    assert.match(layer.title, /[\u4e00-\u9fff]/);
    assert.match(layer.alt, /[\u4e00-\u9fff]/);
    assert.match(layer.disclaimer, /示意|不代表|近似/);
  }
});

test('overall preserves the default controlled report color plan exactly', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture();
  const overall = buildVisualLayers(report, profile).overall;

  const expected = [
    { name: '藏青', hex: '#1F2A44', percentage: 60 },
    { name: '米白', hex: '#F4EFE6', percentage: 30 },
    { name: '砖红', hex: '#A84A3A', percentage: 10 }
  ];
  assert.deepEqual(colorBlocksFromReport(report), expected);
  assert.deepEqual(overall.colorBlocks, expected);
});

test('overall preserves a warm calibrated controlled report color plan exactly', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture({
    appearance: {
      colorCalibration: {
        whiteChoice: 'ivory',
        neutralChoice: 'warmBrown',
        accentChoice: 'brickRed'
      }
    }
  });
  const expected = [
    { name: '巧克力', hex: '#5C3828', percentage: 60 },
    { name: '米白', hex: '#F4EFE6', percentage: 30 },
    { name: '砖红', hex: '#A84A3A', percentage: 10 }
  ];

  assert.deepEqual(colorBlocksFromReport(report), expected);
  assert.deepEqual(buildVisualLayers(report, profile).overall.colorBlocks, expected);
});

test('overall preserves a cool calibrated controlled report color plan exactly', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture({
    appearance: {
      colorCalibration: {
        whiteChoice: 'pureWhite',
        neutralChoice: 'coolGray',
        accentChoice: 'berry'
      }
    }
  });
  const expected = [
    { name: '炭灰', hex: '#34363A', percentage: 60 },
    { name: '纯白', hex: '#FFFFFF', percentage: 30 },
    { name: '莓红', hex: '#9D315B', percentage: 10 }
  ];

  assert.deepEqual(colorBlocksFromReport(report), expected);
  assert.deepEqual(buildVisualLayers(report, profile).overall.colorBlocks, expected);
});

test('overall composition uses final garments with chocolate, pure white, and berry roles', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture({
    appearance: {
      colorCalibration: {
        whiteChoice: 'pureWhite',
        neutralChoice: 'warmBrown',
        accentChoice: 'berry'
      }
    }
  });
  const overall = buildVisualLayers(report, profile).overall;

  assert.deepEqual(overall.garmentTemplateIds, [
    'singleBreastedBlazer',
    'crewNeckKnitTop',
    'straightTrousers'
  ]);
  assert.deepEqual(
    overall.pieces.map(({
      templateId, colorRole, colorName, hex
    }) => ({
      templateId, colorRole, colorName, hex
    })),
    [
      {
        templateId: 'singleBreastedBlazer',
        colorRole: 'main',
        colorName: '巧克力',
        hex: '#5C3828'
      },
      {
        templateId: 'crewNeckKnitTop',
        colorRole: 'secondary',
        colorName: '纯白',
        hex: '#FFFFFF'
      },
      {
        templateId: 'straightTrousers',
        colorRole: 'main',
        colorName: '巧克力',
        hex: '#5C3828'
      }
    ]
  );
  assert.deepEqual(overall.accent, {
    colorRole: 'accent',
    colorName: '莓红',
    hex: '#9D315B',
    label: '小面积点缀'
  });
  assert.equal(overall.preserveCurrent, false);
  assert.equal(overall.fitLocked, false);
});

test('overall falls back when a report color name and HEX pair is malformed', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture({
    appearance: {
      colorCalibration: {
        whiteChoice: 'pureWhite',
        neutralChoice: 'coolGray',
        accentChoice: 'berry'
      }
    }
  });
  report.colorPlan.main.hex = '#000000';

  assert.deepEqual(buildVisualLayers(report, profile).overall.colorBlocks, [
    { name: '藏青', hex: '#1F2A44', percentage: 60 },
    { name: '纯白', hex: '#FFFFFF', percentage: 30 },
    { name: '莓红', hex: '#9D315B', percentage: 10 }
  ]);
});

test('overall keeps an unconfirmed hair color as a neutral placeholder', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture();
  const overall = buildVisualLayers(report, profile).overall;

  assert.deepEqual(overall.hairColorSwatch, {
    name: '当前发色（未确认）',
    hex: '#8A8D88',
    approximate: true
  });
  assert.match(overall.focusLabel, /开襟|肩线/);
});

test('overall keeps broad preserved hair families as broad swatches', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture();
  const expectedSwatches = {
    深棕: '#3B261C',
    中棕: '#6A3828',
    浅棕: '#9A806C',
    当前其他发色: '#8A8D88'
  };

  for (const [colorName, hex] of Object.entries(expectedSwatches)) {
    report.sections.hairColor[0] = {
      ...report.sections.hairColor[0],
      action: `保留当前${colorName}发色`,
      colorName
    };
    assert.deepEqual(
      buildVisualLayers(report, profile).overall.hairColorSwatch,
      { name: colorName, hex, approximate: true }
    );
  }
});

test('collage contains three to six controlled items with usable alternatives', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture();
  const items = buildVisualLayers(report, profile).collage.items;
  const controlledVisualTypes = new Set([
    'top', 'outerwear', 'trousers', 'skirt', 'dress', 'shoes', 'bag'
  ]);

  assert.ok(items.length >= 3 && items.length <= 6);
  for (const item of items) {
    assert.match(item.id, /^item-[a-z0-9-]+$/);
    assert.match(item.assetPath, /^\/assets\/styling\/item-(?:top|outerwear|trousers|skirt|dress|shoes|bag)\.svg$/);
    assert.ok(controlledVisualTypes.has(item.visualType));
    assert.match(item.hex, /^#[0-9A-F]{6}$/);
    assert.ok(item.fitKeywords.length > 0);
    assert.match(item.alternative, /[\u4e00-\u9fff]/);
  }
});

test('default commute collage assigns palette colors by garment role', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture();
  const itemsById = Object.fromEntries(
    buildVisualLayers(report, profile).collage.items.map((item) => [
      item.id,
      item
    ])
  );

  assert.equal(
    itemsById['item-template-single-breasted-blazer'].colorName,
    '藏青'
  );
  assert.equal(
    itemsById['item-template-crew-neck-knit-top'].colorName,
    '米白'
  );
  assert.equal(
    itemsById['item-template-straight-trousers'].colorName,
    '藏青'
  );
  assert.notEqual(
    itemsById['item-template-straight-trousers'].colorName,
    '砖红'
  );
  assert.equal(itemsById['item-supporting-shoes'].colorName, '藏青');
  assert.equal(itemsById['item-supporting-bag'].colorName, '砖红');
});

test('collage item bodies carry exact default, warm, and cool calibrated colors', () => {
  const buildVisualLayers = loadBuilder();
  const cases = [
    {
      label: 'default',
      appearance: {},
      expected: {
        'item-template-single-breasted-blazer': ['outerwear', '藏青', '#1F2A44'],
        'item-template-crew-neck-knit-top': ['top', '米白', '#F4EFE6'],
        'item-template-straight-trousers': ['trousers', '藏青', '#1F2A44'],
        'item-supporting-shoes': ['shoes', '藏青', '#1F2A44'],
        'item-supporting-bag': ['bag', '砖红', '#A84A3A']
      }
    },
    {
      label: 'warm',
      appearance: {
        colorCalibration: {
          whiteChoice: 'ivory',
          neutralChoice: 'warmBrown',
          accentChoice: 'brickRed'
        }
      },
      expected: {
        'item-template-single-breasted-blazer': ['outerwear', '巧克力', '#5C3828'],
        'item-template-crew-neck-knit-top': ['top', '米白', '#F4EFE6'],
        'item-template-straight-trousers': ['trousers', '巧克力', '#5C3828'],
        'item-supporting-shoes': ['shoes', '巧克力', '#5C3828'],
        'item-supporting-bag': ['bag', '砖红', '#A84A3A']
      }
    },
    {
      label: 'cool',
      appearance: {
        colorCalibration: {
          whiteChoice: 'pureWhite',
          neutralChoice: 'coolGray',
          accentChoice: 'berry'
        }
      },
      expected: {
        'item-template-single-breasted-blazer': ['outerwear', '炭灰', '#34363A'],
        'item-template-crew-neck-knit-top': ['top', '纯白', '#FFFFFF'],
        'item-template-straight-trousers': ['trousers', '炭灰', '#34363A'],
        'item-supporting-shoes': ['shoes', '炭灰', '#34363A'],
        'item-supporting-bag': ['bag', '莓红', '#9D315B']
      }
    }
  ];

  for (const { label, appearance, expected } of cases) {
    const { report, profile } = fixture({ appearance });
    const actual = Object.fromEntries(
      buildVisualLayers(report, profile).collage.items.map((item) => [
        item.id,
        [item.visualType, item.colorName, item.hex]
      ])
    );
    assert.deepEqual(actual, expected, label);
  }
});

test('collage WXML paints controlled native shapes from item hex values', () => {
  const source = fs.readFileSync(path.join(
    __dirname,
    '../apps/miniprogram/components/outfit-collage/index.wxml'
  ), 'utf8');

  assert.match(source, /background-color:\s*\{\{item\.hex\}\}/);
  for (const visualType of [
    'top', 'outerwear', 'trousers', 'skirt', 'dress', 'shoes', 'bag'
  ]) {
    assert.match(
      source,
      new RegExp(`item\\.visualType === '${visualType}'`),
      visualType
    );
  }
  assert.doesNotMatch(
    source,
    /class="[^"]*\{\{[^}]*item\.visualType/,
    'visualType must not become a dynamic class name'
  );
  assert.doesNotMatch(
    source,
    /src="\{\{item\.(?:hex|visualType)\}\}"/,
    'controlled values must not become asset paths'
  );
  assert.match(source, /src="\{\{item\.assetPath\}\}"/);
});

test('travel visual layers follow the selected lightweight garment templates instead of the commute fallback', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture({
    preferences: {
      scenes: ['travel'],
      cityOrClimateText: '南方湿热、多步行',
      activityContext: ['longWalk'],
      desiredEffects: ['clean']
    }
  });

  assert.match(report.sections.clothing[0].action, /轻量衬衫式外层/);
  const layers = buildVisualLayers(report, profile);
  const itemNames = layers.collage.items.map(({ name }) => name);

  assert.ok(itemNames.some((name) => name.includes('轻量衬衫式外层')));
  assert.ok(itemNames.some((name) => name.includes('宽直筒长裤')));
  assert.ok(itemNames.every((name) => !name.includes('西装')));
  assert.equal(
    layers.technical.assetPath,
    '/assets/styling/technical-trousers.svg'
  );
  assert.match(layers.overall.focusLabel, /轻量|叠穿|宽直筒/);
});

test('controlled garment template IDs drive collage items even for a new recommendation ID', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture();
  const clothing = report.sections.clothing[0];
  clothing.id = 'garment-scene-specific-future-rule';
  clothing.garmentTemplateIds = [
    'waistDefinedShirtDress',
    'aLineMidiSkirt'
  ];
  report.outfitPlan.itemIds = [...clothing.garmentTemplateIds];

  const layers = buildVisualLayers(report, profile);
  const itemNames = layers.collage.items.map(({ name }) => name);

  assert.ok(itemNames.some((name) => name.includes('可调腰位衬衫裙')));
  assert.ok(itemNames.some((name) => name.includes('A线中长裙')));
  assert.ok(itemNames.every((name) => !name.includes('西装')));
  assert.equal(
    layers.technical.assetPath,
    '/assets/styling/technical-dress.svg'
  );
  assert.deepEqual(
    layers.technical.technicalItems.map(({ assetPath }) => assetPath),
    [
      '/assets/styling/technical-dress.svg',
      '/assets/styling/technical-skirt.svg'
    ]
  );
});

test('a standalone dress keeps its own final-template skirt annotations', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture();
  const clothing = report.sections.clothing[0];
  clothing.id = 'garment-scene-specific-dress';
  clothing.garmentTemplateIds = ['waistDefinedShirtDress'];
  report.outfitPlan.itemIds = [...clothing.garmentTemplateIds];

  const technical = buildVisualLayers(report, profile).technical;
  const annotations = Object.fromEntries(
    technical.labels.map(({ key, value }) => [key, value])
  );

  assert.deepEqual(
    technical.technicalItems.map(({ assetPath }) => assetPath),
    ['/assets/styling/technical-dress.svg']
  );
  assert.equal(annotations.waistPlacement, '可调腰位');
  assert.equal(annotations.skirtShape, 'A线');
  assert.equal(annotations.trouserRise, '不适用');
  assert.equal(annotations.legShape, '不适用');
});

test('overall distinguishes a fit lock from feedback-based low intervention', () => {
  const buildVisualLayers = loadBuilder();
  const locked = fixture({
    preferences: {
      lockedAreas: ['fit']
    }
  });
  const suppressed = fixture({
    feedbackSummary: {
      suppressedFamilies: ['clothing']
    }
  });

  const lockedOverall = buildVisualLayers(
    locked.report,
    locked.profile
  ).overall;
  assert.deepEqual(
    lockedOverall.garmentTemplateIds,
    ['preserveCurrentGarments']
  );
  assert.equal(lockedOverall.preserveCurrent, true);
  assert.equal(lockedOverall.fitLocked, true);
  assert.deepEqual(lockedOverall.pieces, []);
  assert.match(lockedOverall.statusLabel, /版型已锁定.*保留当前轮廓/);

  const suppressedOverall = buildVisualLayers(
    suppressed.report,
    suppressed.profile
  ).overall;
  assert.deepEqual(
    suppressedOverall.garmentTemplateIds,
    ['preserveCurrentGarments']
  );
  assert.equal(suppressedOverall.preserveCurrent, true);
  assert.equal(suppressedOverall.fitLocked, false);
  assert.deepEqual(suppressedOverall.pieces, []);
  assert.match(suppressedOverall.statusLabel, /低干预.*保留当前轮廓/);
});

test('preserve-current garment guidance stays low intervention in every visual layer', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture();
  const clothing = report.sections.clothing[0];
  Object.assign(clothing, {
    id: 'garment-feedback-low-intervention',
    lowIntervention: true,
    garmentTemplateIds: ['preserveCurrentGarments'],
    necklineOrCollar: 'preserveCurrent',
    shoulderConstruction: 'preserveCurrent',
    waistPlacement: 'preserveCurrent',
    length: 'preserveCurrent',
    sleeveLength: 'preserveCurrent',
    trouserRise: 'preserveCurrent',
    legShape: 'preserveCurrent',
    skirtShape: 'preserveCurrent',
    ease: 'preserveCurrent',
    materialAppearance: 'preserveCurrent'
  });
  report.outfitPlan.itemIds = ['preserveCurrentGarments'];

  const layers = buildVisualLayers(report, profile);
  assert.deepEqual(
    layers.collage.items.map(({ name }) => name),
    ['保持现有上装', '保持现有下装', '可省略的小面积配饰']
  );
  assert.match(layers.overall.focusLabel, /保留当前版型/);
  assert.ok(layers.technical.labels.every(({ value }) => value === '保持当前'));
  assert.equal(layers.technical.technicalItems.length, 1);
  assert.equal(
    layers.technical.technicalItems[0].assetPath,
    '/assets/styling/technical-jacket.svg'
  );
  assert.ok(
    layers.technical.technicalItems[0].labels
      .every(({ value }) => value === '保持当前')
  );
});

test('every controlled report hair color keeps its own approximate swatch', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture();
  const expectedSwatches = {
    自然黑: '#171514',
    柔黑: '#211E1D',
    黑茶色: '#2C211C',
    深茶棕: '#3B261C',
    巧克力棕: '#4A2C20',
    栗棕: '#6A3828',
    焦糖棕: '#8B5A32',
    铜棕: '#8C4C2B',
    红棕: '#6C2F29',
    酒红棕: '#542631',
    冷棕: '#4A403B',
    灰棕: '#71645E',
    蓝黑: '#151A24',
    深橄榄棕: '#413D2F',
    奶茶棕: '#9A806C',
    玫瑰棕: '#86636A',
    烟熏紫棕: '#5D4A55'
  };

  for (const [colorName, hex] of Object.entries(expectedSwatches)) {
    report.sections.hairColor[0] = {
      ...report.sections.hairColor[0],
      id: `hair-color-${colorName}`,
      action: `选择${colorName}`,
      colorName,
      lowIntervention: false
    };
    assert.deepEqual(
      buildVisualLayers(report, profile).overall.hairColorSwatch,
      { name: colorName, hex, approximate: true }
    );
  }
});

test('a no-dye recommendation always keeps the natural black swatch', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture();
  report.sections.hairColor[0] = {
    ...report.sections.hairColor[0],
    id: 'hair-color-blackTea',
    action: '保留自然黑并用柔顺光泽整理',
    colorName: '黑茶色',
    lowIntervention: true
  };

  assert.deepEqual(
    buildVisualLayers(report, profile).overall.hairColorSwatch,
    { name: '自然黑', hex: '#171514', approximate: true }
  );
});

test('technical layer exposes every garment annotation for WXML rendering', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture();
  const layers = buildVisualLayers(report, profile);
  const technical = layers.technical;
  const annotations = Object.fromEntries(
    technical.labels.map(({ key, value }) => [key, value])
  );
  const lowerAnnotations = Object.fromEntries(
    technical.technicalItems[1].labels.map(({ key, value }) => [key, value])
  );

  assert.equal(technical.assetPath, '/assets/styling/technical-trousers.svg');
  assert.deepEqual(technical.labels.map(({ key }) => key), GARMENT_KEYS);
  assert.ok(technical.labels.every(({ label, value }) => (
    /[\u4e00-\u9fff]/.test(label) && /[\u4e00-\u9fff]/.test(value)
  )));
  assert.deepEqual(
    technical.technicalItems.map(({ id, title, assetPath }) => ({
      id, title, assetPath
    })),
    [
      {
        id: 'technical-single-breasted-blazer',
        title: '单排扣西装外套',
        assetPath: '/assets/styling/technical-jacket.svg'
      },
      {
        id: 'technical-straight-trousers',
        title: '直筒长裤',
        assetPath: '/assets/styling/technical-trousers.svg'
      }
    ]
  );
  assert.equal(annotations.trouserRise, '中腰');
  assert.equal(annotations.legShape, '直筒');
  assert.equal(lowerAnnotations.trouserRise, '中腰');
  assert.equal(lowerAnnotations.legShape, '直筒');
  assert.ok(
    layers.collage.items
      .find(({ id }) => id === 'item-template-straight-trousers')
      .fitKeywords.includes('中腰')
  );
});

test('technical WXML renders final garment groups and keeps legacy fallback bindings', () => {
  const source = fs.readFileSync(path.join(
    __dirname,
    '../apps/miniprogram/components/garment-technical/index.wxml'
  ), 'utf8');

  assert.match(source, /wx:for="\{\{layer\.technicalItems\}\}"/);
  assert.match(source, /\{\{technicalItem\.title\}\}/);
  assert.match(source, /src="\{\{technicalItem\.assetPath\}\}"/);
  assert.match(source, /wx:for="\{\{technicalItem\.labels\}\}"/);
  assert.match(source, /\{\{annotation\.label\}\}/);
  assert.match(source, /\{\{annotation\.value\}\}/);
  assert.match(source, /src="\{\{layer\.assetPath\}\}"/);
  assert.match(source, /wx:for="\{\{layer\.labels\}\}"/);
});

test('menswear and neutral conversions use final trouser templates throughout technical visuals', () => {
  const buildVisualLayers = loadBuilder();

  for (const presentationMode of ['menswear', 'neutral']) {
    const { report, profile } = fixture({
      presentationMode,
      preferences: {
        scenes: ['date'],
        desiredEffects: ['waistDefinition'],
        fitPreference: 'regular'
      }
    });
    const clothing = report.sections.clothing[0];
    const layers = buildVisualLayers(report, profile);
    const annotations = Object.fromEntries(
      layers.technical.labels.map(({ key, value }) => [key, value])
    );

    assert.deepEqual(
      clothing.garmentTemplateIds,
      ['singleBreastedBlazer', 'straightTrousers'],
      presentationMode
    );
    assert.equal(
      layers.technical.assetPath,
      '/assets/styling/technical-trousers.svg',
      presentationMode
    );
    assert.deepEqual(
      layers.technical.technicalItems.map(({ assetPath }) => assetPath),
      [
        '/assets/styling/technical-jacket.svg',
        '/assets/styling/technical-trousers.svg'
      ],
      presentationMode
    );
    assert.equal(annotations.trouserRise, '中腰', presentationMode);
    assert.equal(annotations.legShape, '直筒', presentationMode);
    assert.equal(annotations.skirtShape, '不适用', presentationMode);
    assert.match(layers.overall.focusLabel, /开襟|肩线/, presentationMode);
    assert.match(layers.overall.focusLabel, /直筒/, presentationMode);
    assert.doesNotMatch(
      layers.overall.focusLabel,
      /渐进|裙摆/,
      presentationMode
    );
  }
});

test('final trouser templates correct stale skirt annotations', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture({
    presentationMode: 'neutral',
    preferences: {
      scenes: ['date'],
      desiredEffects: ['waistDefinition'],
      fitPreference: 'regular'
    }
  });
  const clothing = report.sections.clothing[0];
  Object.assign(clothing, {
    trouserRise: 'notApplicable',
    legShape: 'notApplicable',
    skirtShape: 'aLine'
  });
  const annotations = Object.fromEntries(
    buildVisualLayers(report, profile).technical.labels.map(({
      key, value
    }) => [key, value])
  );

  assert.equal(annotations.trouserRise, '中腰');
  assert.equal(annotations.legShape, '直筒');
  assert.equal(annotations.skirtShape, '不适用');
});

test('unknown or hostile IDs fall back without ever becoming asset paths', () => {
  const buildVisualLayers = loadBuilder();
  const { report, profile } = fixture();
  profile.presentationMode = '../../tmp/portrait.png';
  report.sections.clothing[0].id = '/tmp/portrait.png';
  report.sections.clothing[0].action = '任意安全说明';
  report.sections.hairColor[0].id = 'file:///tmp/hair.png';

  const layers = buildVisualLayers(report, profile);
  assert.equal(layers.overall.assetPath, '/assets/styling/overall-neutral.svg');
  assert.ok(layers.collage.items.every(({ assetPath }) => assetPath.startsWith('/assets/styling/item-')));
  assert.ok(layers.collage.items.every(({ visualType }) => (
    ['top', 'outerwear', 'trousers', 'skirt', 'dress', 'shoes', 'bag']
      .includes(visualType)
  )));
  assert.ok(layers.collage.items.every(({ hex }) => /^#[0-9A-F]{6}$/.test(hex)));
  assert.match(layers.technical.assetPath, /^\/assets\/styling\/technical-/);
  assert.doesNotMatch(JSON.stringify(layers), /tmp|file:|\.\.\//);
});
