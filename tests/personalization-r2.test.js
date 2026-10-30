const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildStyleProfile,
  createDefaultAppearance,
  createDefaultPreferences,
  normalizePreferences
} = require('../apps/miniprogram/services/profile-contract');
const {
  generateReport
} = require('../apps/miniprogram/services/recommendation-engine');
const {
  resolveRules
} = require('../apps/miniprogram/services/rule-resolver');
const {
  HAIR_COLOR_RULES
} = require('../apps/miniprogram/data/hair-color-rules');
const {
  GARMENT_TEMPLATES
} = require('../apps/miniprogram/data/garment-taxonomy');
const {
  validatePreferences
} = require('../apps/miniprogram/utils/validators');
const {
  buildVisualLayers
} = require('../apps/miniprogram/services/visual-layer-builder');
const {
  isUsableReport
} = require('../apps/miniprogram/services/report-state');

const NOW = '2026-07-29T00:00:00.000Z';

function profile({
  appearance = {},
  preferences = {},
  feedbackSummary = {}
} = {}) {
  const defaults = createDefaultPreferences();
  return buildStyleProfile({
    analysisMode: 'manual',
    appearance: {
      ...createDefaultAppearance(),
      ...appearance,
      colorCalibration: {
        ...createDefaultAppearance().colorCalibration,
        ...(appearance.colorCalibration || {})
      }
    },
    preferences: {
      ...defaults,
      ...preferences,
      hairColorPreference: {
        ...defaults.hairColorPreference,
        ...(preferences.hairColorPreference || {})
      }
    },
    feedbackSummary
  });
}

function kebabId(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

test('confirmed core appearance fields appear in the shared manual basis', () => {
  const report = generateReport(profile({
    appearance: {
      lineQuality: 'soft',
      faceOutline: 'round',
      valueContrast: 'low',
      visualScale: 'light',
      visibleGarmentSilhouette: 'relaxed'
    }
  }), { now: NOW });

  assert.deepEqual(
    report.confirmedBasis.filter(({ key }) => [
      'lineQuality',
      'faceOutline',
      'valueContrast',
      'visualScale',
      'visibleGarmentSilhouette'
    ].includes(key)),
    [
      { key: 'lineQuality', label: '线条感', value: '柔和', source: 'manual' },
      {
        key: 'faceOutline',
        label: '脸部外轮廓',
        value: '圆润',
        source: 'manual'
      },
      {
        key: 'valueContrast',
        label: '明暗对比',
        value: '低',
        source: 'manual'
      },
      {
        key: 'visualScale',
        label: '视觉量感',
        value: '轻盈',
        source: 'manual'
      },
      {
        key: 'visibleGarmentSilhouette',
        label: '当前服装轮廓',
        value: '宽松',
        source: 'manual'
      }
    ]
  );
  assert.ok(Object.values(report.sections).flat().every(
    ({ confirmedBasis }) => confirmedBasis === report.confirmedBasis
  ));
});

test('each confirmed core appearance field changes visible non-judgmental guidance', () => {
  const cases = [
    {
      field: 'lineQuality',
      first: 'soft',
      second: 'sharp',
      section: 'clothing',
      firstText: '柔和过渡',
      secondText: '清晰边界'
    },
    {
      field: 'faceOutline',
      first: 'round',
      second: 'angular',
      section: 'hair',
      firstText: '自然侧分',
      secondText: '柔和弧度'
    },
    {
      field: 'valueContrast',
      first: 'low',
      second: 'high',
      section: 'clothing',
      firstText: '相邻明度',
      secondText: '深浅层次'
    },
    {
      field: 'visualScale',
      first: 'light',
      second: 'strong',
      section: 'clothing',
      firstText: '小面积细节',
      secondText: '单一清楚焦点'
    },
    {
      field: 'visibleGarmentSilhouette',
      first: 'relaxed',
      second: 'fittedCut',
      section: 'clothing',
      firstText: '宽松轮廓作为试搭起点',
      secondText: '合体轮廓作为试搭起点'
    }
  ];

  for (const {
    field, first, second, section, firstText, secondText
  } of cases) {
    const firstRecommendation = generateReport(profile({
      appearance: { [field]: first }
    }), { now: NOW }).sections[section][0];
    const secondRecommendation = generateReport(profile({
      appearance: { [field]: second }
    }), { now: NOW }).sections[section][0];
    const firstVisible = [
      firstRecommendation.action,
      firstRecommendation.reason,
      firstRecommendation.alternative
    ].join(' ');
    const secondVisible = [
      secondRecommendation.action,
      secondRecommendation.reason,
      secondRecommendation.alternative
    ].join(' ');

    assert.match(firstVisible, new RegExp(firstText), `${field}:first`);
    assert.match(secondVisible, new RegExp(secondText), `${field}:second`);
    assert.notEqual(firstVisible, secondVisible, field);
    assert.doesNotMatch(
      `${firstVisible}${secondVisible}`,
      /显瘦|遮肉|缺陷|最适合|一定|必须/,
      field
    );
  }
});

test('all seven scenes produce their own actionable capsule and matching templates', () => {
  const cases = [
    {
      scene: 'commute',
      sceneText: /单位着装要求/,
      mainColor: '藏青',
      garmentTemplateIds: [
        'singleBreastedBlazer', 'crewNeckKnitTop', 'straightTrousers'
      ]
    },
    {
      scene: 'interview',
      sceneText: /公司着装要求/,
      mainColor: '炭灰',
      garmentTemplateIds: [
        'singleBreastedBlazer', 'crewNeckKnitTop', 'straightTrousers'
      ]
    },
    {
      scene: 'date',
      sceneText: /活动类型/,
      mainColor: '巧克力',
      garmentTemplateIds: [
        'relaxedCardigan', 'crewNeckKnitTop', 'straightTrousers'
      ]
    },
    {
      scene: 'casual',
      sceneText: /复用现有衣物/,
      mainColor: '牛仔蓝',
      garmentTemplateIds: ['crewNeckKnitTop', 'wideStraightTrousers']
    },
    {
      scene: 'party',
      sceneText: /工作聚会.*私人派对/,
      mainColor: '藏青',
      garmentTemplateIds: [
        'singleBreastedBlazer', 'crewNeckKnitTop', 'straightTrousers'
      ]
    },
    {
      scene: 'travel',
      sceneText: /天气.*步行/,
      mainColor: '卡其',
      garmentTemplateIds: [
        'lightweightOvershirt', 'crewNeckKnitTop', 'wideStraightTrousers'
      ]
    },
    {
      scene: 'formal',
      sceneText: /邀请函/,
      mainColor: '藏青',
      garmentTemplateIds: [
        'singleBreastedBlazer', 'crewNeckKnitTop', 'straightTrousers'
      ]
    }
  ];
  const sceneActions = [];

  for (const {
    scene, sceneText, mainColor, garmentTemplateIds
  } of cases) {
    const report = generateReport(profile({
      preferences: {
        scenes: [scene],
        desiredEffects: ['clean'],
        cityOrClimateText: ''
      }
    }), { now: NOW });
    const clothing = report.sections.clothing[0];
    const sceneRecommendation = report.sections.sceneTransition[0];

    sceneActions.push(sceneRecommendation.action);
    assert.match(sceneRecommendation.action, sceneText, scene);
    assert.ok(sceneRecommendation.sceneFit.includes(scene), scene);
    assert.ok(clothing.sceneFit.includes(scene), scene);
    assert.deepEqual(clothing.garmentTemplateIds, garmentTemplateIds, scene);
    assert.deepEqual(report.outfitPlan.itemIds, garmentTemplateIds, scene);
    assert.equal(report.colorPlan.main.name, mainColor, scene);
  }

  assert.equal(new Set(sceneActions).size, cases.length);
});

test('stable clothing rules report the selected supported scene instead of commute residue', () => {
  for (const scene of ['date', 'formal']) {
    const clothing = generateReport(profile({
      preferences: {
        scenes: [scene],
        desiredEffects: ['vertical']
      }
    }), { now: NOW }).sections.clothing[0];

    assert.deepEqual(clothing.sceneFit, [scene]);
  }
});

test('hair guidance honors 5, 10, and 20 minute budgets without overstating time', () => {
  const actions = [];

  for (const minutes of [5, 10, 20]) {
    const hair = generateReport(profile({
      appearance: {
        hairLength: 'shoulder',
        hairTexture: 'wavy',
        visibleHairVolume: 'high'
      },
      preferences: { stylingTimeMinutes: minutes }
    }), { now: NOW }).sections.hair[0];

    actions.push(hair.action);
    assert.match(hair.action, new RegExp(`${minutes} 分钟`), String(minutes));
    for (const other of [5, 10, 20].filter((value) => value !== minutes)) {
      assert.doesNotMatch(
        hair.action,
        new RegExp(`${other} 分钟`),
        `${minutes} != ${other}`
      );
    }
  }

  assert.equal(new Set(actions).size, 3);
});

test('hair guidance distinguishes controlled humid and dry climate hints', () => {
  const appearance = {
    hairLength: 'shoulder',
    hairTexture: 'wavy',
    visibleHairVolume: 'high'
  };
  const humid = generateReport(profile({
    appearance,
    preferences: { cityOrClimateText: '广州潮湿' }
  }), { now: NOW }).sections.hair[0];
  const dry = generateReport(profile({
    appearance,
    preferences: { cityOrClimateText: '北京干燥' }
  }), { now: NOW }).sections.hair[0];
  const humidVisible = `${humid.action}${humid.reason}${humid.alternative}`;
  const dryVisible = `${dry.action}${dry.reason}${dry.alternative}`;

  assert.match(humidVisible, /潮湿环境/);
  assert.match(dryVisible, /干燥环境/);
  assert.notEqual(humidVisible, dryVisible);
});

test('hair-color eligibility intersects the current scene before selection', () => {
  for (const scene of [
    'commute', 'interview', 'date', 'casual', 'party', 'travel', 'formal'
  ]) {
    const input = profile({
      preferences: {
        scenes: [scene],
        hairColorPreference: {
          willingness: 'wants-dye',
          acceptsBleach: 'yes',
          maintenanceLevel: 'high',
          workplaceRestriction: 'flexible'
        }
      }
    });
    const candidates = resolveRules(input, { now: NOW }).filter(
      ({ family, candidate }) => family === 'hairColor' && candidate.name
    );
    const recommendation = generateReport(input, { now: NOW })
      .sections.hairColor[0];
    const selectedCandidate = HAIR_COLOR_RULES.find(
      ({ name }) => name === recommendation.colorName
    );

    assert.ok(candidates.length > 0, scene);
    assert.ok(candidates.every(({ candidate }) => (
      candidate.scenes.includes(scene)
    )), scene);
    assert.ok(selectedCandidate, scene);
    assert.deepEqual(recommendation.sceneFit, selectedCandidate.scenes, scene);
    assert.ok(recommendation.sceneFit.includes(scene), scene);
  }
});

test('hair-color scoring prefers the confirmed current or visible color family', () => {
  const sharedPreferences = {
    scenes: ['party'],
    hairColorPreference: {
      willingness: 'wants-dye',
      acceptsBleach: 'yes',
      maintenanceLevel: 'high',
      workplaceRestriction: 'flexible'
    }
  };
  const currentRed = generateReport(profile({
    appearance: { visibleHairColorFamily: 'unknown' },
    preferences: {
      ...sharedPreferences,
      hairColorPreference: {
        ...sharedPreferences.hairColorPreference,
        currentColor: 'redBrown'
      }
    }
  }), { now: NOW }).sections.hairColor[0];
  const visibleBlueBlack = generateReport(profile({
    appearance: { visibleHairColorFamily: 'blueBlack' },
    preferences: {
      ...sharedPreferences,
      hairColorPreference: {
        ...sharedPreferences.hairColorPreference,
        currentColor: 'unknown'
      }
    }
  }), { now: NOW }).sections.hairColor[0];

  assert.equal(currentRed.id, 'hair-color-redBrown');
  assert.equal(visibleBlueBlack.id, 'hair-color-blueBlack');
});

test('hair-color scoring uses calibration and contrast-scale direction', () => {
  const sharedPreferences = {
    scenes: ['date'],
    hairColorPreference: {
      currentColor: 'unknown',
      willingness: 'wants-dye',
      acceptsBleach: 'yes',
      maintenanceLevel: 'high',
      workplaceRestriction: 'flexible'
    }
  };
  const warm = generateReport(profile({
    appearance: {
      valueContrast: 'medium',
      visualScale: 'medium',
      colorCalibration: {
        whiteChoice: 'ivory',
        neutralChoice: 'warmBrown',
        accentChoice: 'brickRed'
      }
    },
    preferences: sharedPreferences
  }), { now: NOW }).sections.hairColor[0];
  const cool = generateReport(profile({
    appearance: {
      valueContrast: 'medium',
      visualScale: 'medium',
      colorCalibration: {
        whiteChoice: 'pureWhite',
        neutralChoice: 'coolGray',
        accentChoice: 'berry'
      }
    },
    preferences: sharedPreferences
  }), { now: NOW }).sections.hairColor[0];
  const light = generateReport(profile({
    appearance: {
      valueContrast: 'low',
      visualScale: 'light'
    },
    preferences: sharedPreferences
  }), { now: NOW }).sections.hairColor[0];
  const strong = generateReport(profile({
    appearance: {
      valueContrast: 'high',
      visualScale: 'strong'
    },
    preferences: sharedPreferences
  }), { now: NOW }).sections.hairColor[0];

  assert.equal(warm.id, 'hair-color-chestnutBrown');
  assert.equal(cool.id, 'hair-color-coolBrown');
  assert.equal(light.id, 'hair-color-roseBrown');
  assert.equal(strong.id, 'hair-color-blueBlack');
});

test('explicitly empty required choices stay empty and fail validation', () => {
  const input = {
    ...createDefaultPreferences(),
    activityContext: [],
    desiredEffects: []
  };
  const normalized = normalizePreferences(input);
  const built = buildStyleProfile({
    analysisMode: 'manual',
    preferences: input
  });

  assert.deepEqual(normalized.activityContext, []);
  assert.deepEqual(normalized.desiredEffects, []);
  assert.deepEqual(built.activityContext, []);
  assert.deepEqual(built.desiredEffects, []);
  assert.equal(validatePreferences(normalized).valid, false);
  assert.ok(validatePreferences(normalized).errors.activityContext);
  assert.ok(validatePreferences(normalized).errors.desiredEffects);
  assert.equal(
    generateReport(built, { now: NOW }).confirmedBasis.some(
      ({ key }) => key === 'desiredEffects'
    ),
    false
  );
});

test('presentation mode constrains waist-definition templates without changing explicit modes', () => {
  const expectedByMode = {
    womenswear: ['waistDefinedShirtDress'],
    menswear: ['singleBreastedBlazer', 'straightTrousers'],
    neutral: ['singleBreastedBlazer', 'straightTrousers'],
    mixed: ['crewNeckKnitTop', 'aLineMidiSkirt']
  };

  for (const [presentationMode, expected] of Object.entries(expectedByMode)) {
    const input = profile({
      preferences: {
        presentationMode,
        scenes: ['date'],
        desiredEffects: ['waistDefinition'],
        fitPreference: 'regular'
      }
    });
    const report = generateReport(input, { now: NOW });
    const clothing = report.sections.clothing[0];
    const templates = clothing.garmentTemplateIds.map((id) => (
      GARMENT_TEMPLATES.find((template) => template.id === id)
    ));
    const layers = buildVisualLayers(report, input);
    const hasOnePieceAndSkirt = (
      templates.some(({ category }) => category === 'onePiece')
      && templates.some(({ category }) => category === 'lowerBody')
    );

    assert.deepEqual(clothing.garmentTemplateIds, expected, presentationMode);
    assert.deepEqual(report.outfitPlan.itemIds, expected, presentationMode);
    assert.deepEqual(
      layers.overall.garmentTemplateIds,
      expected,
      presentationMode
    );
    assert.deepEqual(
      layers.collage.items
        .filter(({ id }) => id.startsWith('item-template-'))
        .map(({ id }) => id),
      expected.map((id) => `item-template-${kebabId(id)}`),
      presentationMode
    );
    assert.deepEqual(
      layers.technical.technicalItems.map(({ id }) => id),
      expected.map((id) => `technical-${kebabId(id)}`),
      presentationMode
    );
    assert.ok(templates.every(Boolean), presentationMode);
    assert.equal(hasOnePieceAndSkirt, false, presentationMode);
    assert.doesNotMatch(clothing.action, /衬衫裙与A线中长裙/, presentationMode);
    if (presentationMode === 'womenswear') {
      assert.match(clothing.alternative, /A线中长裙/, presentationMode);
    }
    if (presentationMode === 'mixed') {
      assert.match(clothing.alternative, /可调腰位衬衫裙/, presentationMode);
    }
    if (['menswear', 'neutral'].includes(presentationMode)) {
      assert.ok(templates.every(({ category, skirtShape }) => (
        category !== 'onePiece' && skirtShape === 'notApplicable'
      )), presentationMode);
      assert.doesNotMatch(clothing.action, /裙|连衣/, presentationMode);
    }
  }
});

test('new Chinese trend keeps a complete capsule after every presentation conversion', () => {
  for (const presentationMode of ['womenswear', 'menswear', 'neutral', 'mixed']) {
    const input = profile({
      preferences: {
        presentationMode,
        scenes: ['commute'],
        desiredEffects: ['newChinese'],
        stylePreferences: ['newChinese'],
        trendEnabled: true
      }
    });
    const report = generateReport(input, { now: NOW });
    const clothing = report.sections.clothing[0];
    const templates = clothing.garmentTemplateIds.map((id) => (
      GARMENT_TEMPLATES.find((template) => template.id === id)
    ));
    const categories = templates.map(({ category }) => category);
    const hasCompleteCapsule = (
      categories.includes('onePiece')
      || (
        categories.some((category) => ['outerLayer', 'top'].includes(category))
        && categories.includes('lowerBody')
      )
    );
    const layers = buildVisualLayers(report, input);

    assert.equal(clothing.id, 'trend-cn-lightweight-modern-chinese');
    assert.ok(templates.every(Boolean), presentationMode);
    assert.equal(hasCompleteCapsule, true, presentationMode);
    assert.equal(
      categories.includes('onePiece') && categories.includes('lowerBody'),
      false,
      presentationMode
    );
    assert.deepEqual(
      layers.overall.garmentTemplateIds,
      clothing.garmentTemplateIds,
      presentationMode
    );
    assert.ok(layers.technical.technicalItems.length > 0, presentationMode);
    if (['menswear', 'neutral'].includes(presentationMode)) {
      assert.ok(categories.includes('lowerBody'), presentationMode);
      assert.doesNotMatch(clothing.action, /裙|连衣/, presentationMode);
    }
  }
});

test('garment template ids describe the actual capsule, fit lock, and outfit title', () => {
  const controlledIds = new Set(GARMENT_TEMPLATES.map(({ id }) => id));
  const vertical = generateReport(profile({
    preferences: {
      scenes: ['date'],
      desiredEffects: ['vertical']
    }
  }), { now: NOW });
  const locked = generateReport(profile({
    preferences: {
      scenes: ['commute'],
      desiredEffects: ['vertical'],
      lockedAreas: ['fit']
    }
  }), { now: NOW });

  assert.deepEqual(vertical.sections.clothing[0].garmentTemplateIds, [
    'singleBreastedBlazer', 'crewNeckKnitTop', 'straightTrousers'
  ]);
  assert.deepEqual(
    vertical.outfitPlan.itemIds,
    vertical.sections.clothing[0].garmentTemplateIds
  );
  assert.equal(vertical.outfitPlan.title, vertical.sections.clothing[0].action);
  assert.doesNotMatch(vertical.outfitPlan.title, /通勤/);
  assert.deepEqual(
    locked.sections.clothing[0].garmentTemplateIds,
    ['preserveCurrentGarments']
  );
  assert.deepEqual(locked.outfitPlan.itemIds, ['preserveCurrentGarments']);
  assert.ok([
    ...vertical.sections.clothing[0].garmentTemplateIds,
    ...locked.sections.clothing[0].garmentTemplateIds
  ].every((id) => controlledIds.has(id)));
});

test('no-dye and hair-color locks preserve a confirmed current or visible family', () => {
  const cases = [
    {
      label: 'confirmed current color',
      appearance: { visibleHairColorFamily: 'blueBlack' },
      hairColorPreference: {
        currentColor: 'redBrown',
        willingness: 'no-dye'
      },
      lockedAreas: [],
      expectedId: 'hair-color-redBrown',
      expectedName: '红棕'
    },
    {
      label: 'confirmed visible color',
      appearance: { visibleHairColorFamily: 'redBrown' },
      hairColorPreference: {
        currentColor: 'unknown',
        willingness: 'open'
      },
      lockedAreas: ['hairColor'],
      expectedId: 'hair-color-redBrown',
      expectedName: '红棕'
    }
  ];

  for (const {
    label,
    appearance,
    hairColorPreference,
    lockedAreas,
    expectedId,
    expectedName
  } of cases) {
    const recommendation = generateReport(profile({
      appearance,
      preferences: {
        scenes: ['formal'],
        hairColorPreference,
        lockedAreas
      }
    }), { now: NOW }).sections.hairColor[0];

    assert.equal(recommendation.id, expectedId, label);
    assert.equal(recommendation.colorName, expectedName, label);
    assert.match(recommendation.action, new RegExp(expectedName), label);
    assert.match(recommendation.action, /保留|保持/, label);
    assert.equal(recommendation.lowIntervention, true, label);
    assert.ok(recommendation.sceneFit.includes('formal'), label);
  }
});

test('each color-calibration answer independently overrides only its matching color role', () => {
  const unknown = generateReport(profile(), { now: NOW }).colorPlan;
  const cases = [
    {
      field: 'whiteChoice',
      value: 'pureWhite',
      role: 'secondary',
      expected: '纯白'
    },
    {
      field: 'neutralChoice',
      value: 'warmBrown',
      role: 'main',
      expected: '巧克力'
    },
    {
      field: 'accentChoice',
      value: 'berry',
      role: 'accent',
      expected: '莓红'
    }
  ];

  for (const { field, value, role, expected } of cases) {
    const calibrated = generateReport(profile({
      appearance: { colorCalibration: { [field]: value } }
    }), { now: NOW }).colorPlan;

    assert.equal(calibrated[role].name, expected, field);
    for (const untouched of ['main', 'secondary', 'accent'].filter(
      (candidate) => candidate !== role
    )) {
      assert.deepEqual(calibrated[untouched], unknown[untouched], `${field}:${untouched}`);
    }
  }
});

test('makeup lock preserves none, light, and defined habits without rewriting them as no-makeup', () => {
  const expectations = {
    none: /不化妆|跳过彩妆/,
    light: /淡妆/,
    defined: /明确重点/
  };

  for (const [makeupPreference, expected] of Object.entries(expectations)) {
    const makeup = generateReport(profile({
      preferences: {
        makeupPreference,
        lockedAreas: ['makeup']
      }
    }), { now: NOW }).sections.makeup[0];
    const visible = `${makeup.action}${makeup.reason}${makeup.alternative}`;

    assert.match(visible, expected, makeupPreference);
    assert.equal(makeup.lowIntervention, true, makeupPreference);
    if (makeupPreference !== 'none') {
      assert.doesNotMatch(visible, /不化妆选择|完全跳过彩妆/, makeupPreference);
    }
  }
});

test('comfort, fit, optional measurements, and budget each change visible guidance', () => {
  const reportFor = (preferences) => generateReport(profile({
    preferences: {
      scenes: ['commute'],
      desiredEffects: ['clean'],
      ...preferences
    }
  }), { now: NOW });
  const visibleClothing = (report) => {
    const item = report.sections.clothing[0];
    return `${item.action}${item.reason}${item.alternative}`;
  };

  const breathable = reportFor({ comfortNeeds: ['breathable'] });
  const stretch = reportFor({ comfortNeeds: ['stretch'] });
  assert.match(visibleClothing(breathable), /透气/);
  assert.match(visibleClothing(stretch), /弹力|伸展/);
  assert.notEqual(visibleClothing(breathable), visibleClothing(stretch));

  const fitted = reportFor({ fitPreference: 'fitted' });
  const oversized = reportFor({ fitPreference: 'oversized' });
  assert.equal(fitted.sections.clothing[0].ease, 'close');
  assert.equal(oversized.sections.clothing[0].ease, 'relaxed');
  assert.notEqual(visibleClothing(fitted), visibleClothing(oversized));

  const noMeasurements = reportFor({ manualMeasurements: null });
  const withMeasurements = reportFor({
    manualMeasurements: { heightCm: 170, shoulderCm: 42 }
  });
  assert.doesNotMatch(
    visibleClothing(noMeasurements),
    /推荐(?:你)?(?:穿)?[SML]码|推荐尺码为|建议尺码为/
  );
  assert.match(visibleClothing(withMeasurements), /实物尺码表|试穿/);
  assert.doesNotMatch(
    visibleClothing(withMeasurements),
    /推荐(?:你)?(?:穿)?[SML]码|推荐尺码为|建议尺码为/
  );
  assert.notEqual(visibleClothing(noMeasurements), visibleClothing(withMeasurements));

  const lowBudget = reportFor({ budgetBand: 'low' });
  const premiumBudget = reportFor({ budgetBand: 'premium' });
  assert.match(visibleClothing(lowBudget), /复用已有|预算/);
  assert.match(visibleClothing(premiumBudget), /面料|做工/);
  assert.notEqual(visibleClothing(lowBudget), visibleClothing(premiumBudget));
});

test('activity contexts and priority desired effects change actionable visible guidance', () => {
  const activityExpectations = {
    indoor: /可穿脱|室内/,
    outdoor: /天气|外层/,
    longWalk: /长时间步行|鞋底|步幅/,
    seated: /久坐|坐下/
  };
  const activityVisible = new Set();

  for (const [activityContext, expected] of Object.entries(activityExpectations)) {
    const scene = generateReport(profile({
      preferences: { activityContext: [activityContext] }
    }), { now: NOW }).sections.sceneTransition[0];
    const visible = `${scene.action}${scene.reason}${scene.alternative}`;
    activityVisible.add(visible);
    assert.match(visible, expected, activityContext);
  }
  assert.equal(activityVisible.size, Object.keys(activityExpectations).length);

  const effectExpectations = {
    clean: /清晰|利落/,
    relaxed: /松弛|活动余量/,
    mobility: /抬臂|步幅|坐下/,
    lessCling: /贴身|余量/,
    lowerVolume: /下装|宽直筒|A 线/
  };
  const effectVisible = new Set();

  for (const [desiredEffect, expected] of Object.entries(effectExpectations)) {
    const clothing = generateReport(profile({
      preferences: { desiredEffects: [desiredEffect] }
    }), { now: NOW }).sections.clothing[0];
    const visible = `${clothing.action}${clothing.reason}${clothing.alternative}`;
    effectVisible.add(visible);
    assert.match(visible, expected, desiredEffect);
  }
  assert.equal(effectVisible.size, Object.keys(effectExpectations).length);
});

test('multi-scene recommendations retain all actual scene and activity evidence', () => {
  const report = generateReport(profile({
    preferences: {
      presentationMode: 'mixed',
      scenes: ['commute', 'travel'],
      cityOrClimateText: '杭州，潮湿',
      activityContext: ['outdoor', 'longWalk'],
      desiredEffects: ['clean']
    }
  }), { now: NOW });
  const basis = Object.fromEntries(
    report.confirmedBasis.map(({ key, value }) => [key, value])
  );
  const clothing = report.sections.clothing[0];

  assert.match(basis.scene, /通勤/);
  assert.match(basis.scene, /旅行/);
  assert.match(basis.presentationMode, /混搭/);
  assert.match(basis.activityContext, /户外/);
  assert.match(basis.activityContext, /长时间步行/);
  assert.ok(clothing.sceneFit.includes('travel'));
  assert.ok(Object.values(report.sections).flat().every(
    ({ confirmedBasis }) => confirmedBasis === report.confirmedBasis
  ));
});

test('rejected clothing does not reappear unchanged and suppressed clothing becomes low intervention', () => {
  const baselineProfile = profile({
    preferences: {
      scenes: ['commute'],
      desiredEffects: ['vertical']
    }
  });
  const baseline = generateReport(baselineProfile, { now: NOW });
  const baselineClothing = baseline.sections.clothing[0];
  const visible = ({ action, reason, alternative }) => (
    `${action}|${reason}|${alternative}`
  );
  const rejectedProfile = profile({
    preferences: {
      scenes: ['commute'],
      desiredEffects: ['vertical']
    },
    feedbackSummary: {
      rejectedRuleIds: ['garment-vertical-open-line']
    }
  });
  const rejected = generateReport(rejectedProfile, { now: NOW });
  const suppressedProfile = profile({
    preferences: {
      scenes: ['commute'],
      desiredEffects: ['vertical']
    },
    feedbackSummary: {
      suppressedFamilies: ['clothing']
    }
  });
  const suppressed = generateReport(suppressedProfile, { now: NOW });

  assert.notEqual(visible(rejected.sections.clothing[0]), visible(baselineClothing));
  assert.doesNotMatch(
    rejected.sections.clothing[0].appliedRuleIds.join(' '),
    /garment-vertical-open-line/
  );
  assert.equal(suppressed.sections.clothing[0].lowIntervention, true);
  assert.deepEqual(
    suppressed.sections.clothing[0].garmentTemplateIds,
    ['preserveCurrentGarments']
  );
  assert.notEqual(visible(suppressed.sections.clothing[0]), visible(baselineClothing));

  suppressed.visualLayers = buildVisualLayers(suppressed, suppressedProfile);
  assert.equal(isUsableReport(suppressed), true);
});

const SUPPRESSED_FAMILY_CASES = [
  {
    family: 'hair',
    input: {
      appearance: {
        faceOutline: 'round',
        hairLength: 'shoulder',
        hairTexture: 'straight',
        visibleHairVolume: 'medium'
      },
      preferences: { lockedAreas: ['hairLength'] }
    },
    expected: /根据你的反馈.*保留当前发型/,
    excluded: /自然侧分/
  },
  {
    family: 'hairColor',
    input: {
      preferences: {
        hairColorPreference: {
          currentColor: 'redBrown',
          willingness: 'no-dye'
        },
        lockedAreas: ['hairColor']
      }
    },
    expected: /根据你的反馈.*(?:保留|保持)当前发色/,
    expectedColorName: '红棕'
  },
  {
    family: 'makeup',
    input: {
      preferences: {
        makeupPreference: 'none',
        lockedAreas: ['makeup']
      }
    },
    expected: /根据你的反馈.*不再提供妆容方案.*不化妆/,
    excluded: /豆沙玫瑰/
  },
  {
    family: 'accessories',
    input: {
      appearance: { glassesState: 'visible' },
      preferences: { lockedAreas: ['glasses'] }
    },
    expected: /根据你的反馈.*保持当前眼镜与配饰状态/
  },
  {
    family: 'sceneTransition',
    input: {},
    expected: /根据你的反馈.*不再给出同类场景胶囊方案.*沿用当前组合.*单位着装要求/
  }
];

for (const {
  family,
  input,
  expected,
  excluded,
  expectedColorName
} of SUPPRESSED_FAMILY_CASES) {
  test(`suppressed ${family} replaces its current card with controlled low-intervention guidance`, () => {
    const visible = ({ action, reason, alternative }) => (
      `${action}|${reason}|${alternative}`
    );
    const baselineProfile = profile(input);
    const suppressedProfile = profile({
      ...input,
      feedbackSummary: { suppressedFamilies: [family] }
    });
    const baseline = generateReport(baselineProfile, { now: NOW });
    const suppressed = generateReport(suppressedProfile, { now: NOW });
    const baselineItem = baseline.sections[family][0];
    const suppressedItem = suppressed.sections[family][0];

    assert.ok(baselineItem.appliedRuleIds.length > 0, family);
    assert.notEqual(visible(suppressedItem), visible(baselineItem), family);
    assert.match(visible(suppressedItem), expected, family);
    if (excluded) assert.doesNotMatch(visible(suppressedItem), excluded, family);
    assert.deepEqual(suppressedItem.appliedRuleIds, [], family);
    if (family !== 'sceneTransition') {
      assert.equal(suppressedItem.lowIntervention, true, family);
    }
    if (family === 'hairColor') {
      assert.equal(suppressedItem.colorName, expectedColorName);
      assert.equal(suppressedItem.applicationStyle, 'preserveCurrent');
      assert.equal(suppressedItem.bleachExpectation, 'no');
    }
    if (family === 'makeup') assert.equal(suppressedItem.skippable, true);

    suppressed.visualLayers = buildVisualLayers(suppressed, suppressedProfile);
    if (family === 'hairColor') {
      assert.equal(
        suppressed.visualLayers.overall.hairColorSwatch.name,
        expectedColorName
      );
    }
    assert.equal(isUsableReport(suppressed), true, family);
  });
}
