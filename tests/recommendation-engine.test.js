const test = require('node:test');
const assert = require('node:assert/strict');

const { COLOR_PALETTE } = require('../apps/miniprogram/data/color-palette');
const {
  buildStyleProfile,
  createDefaultPreferences
} = require('../apps/miniprogram/services/profile-contract');
const {
  generateReport
} = require('../apps/miniprogram/services/recommendation-engine');
const {
  resolveRules
} = require('../apps/miniprogram/services/rule-resolver');
const {
  applyFeedbackScores
} = require('../apps/miniprogram/services/feedback-adjuster');
const {
  summarizeFeedback
} = require('../apps/miniprogram/services/report-state');

const NOW = '2026-07-29T00:00:00.000Z';
const VISIBLE_FIELDS = [
  'id', 'family', 'action', 'reason', 'alternative', 'sceneFit'
];
const GARMENT_FIELDS = [
  'necklineOrCollar', 'shoulderConstruction', 'waistPlacement', 'length',
  'sleeveLength', 'trouserRise', 'legShape', 'skirtShape', 'ease',
  'materialAppearance'
];

function profile({ appearance = {}, preferences = {}, feedbackSummary = {} } = {}) {
  return buildStyleProfile({
    analysisMode: 'manual',
    appearance,
    preferences: {
      ...createDefaultPreferences(),
      scenes: ['commute', 'interview'],
      desiredEffects: ['clean', 'vertical'],
      stylePreferences: ['minimal'],
      ...preferences
    },
    feedbackSummary
  });
}

test('generateReport returns the deterministic RecommendationReportV2 envelope', () => {
  const input = profile();
  const first = generateReport(input, { now: NOW });
  const second = generateReport(structuredClone(input), { now: NOW });

  assert.equal(first.schemaVersion, 2);
  assert.match(first.id, /^report-v2-[0-9a-f]{8}$/);
  assert.equal(first.mode, 'local-personalized');
  assert.equal(first.generatedAt, NOW);
  assert.equal(first.ruleSetVersion, 'cn-style-2026.07');
  assert.equal(first.visualLayers, null);
  assert.equal(first.id, second.id);
  assert.deepEqual(
    first.topRecommendations.map(({ id }) => id),
    second.topRecommendations.map(({ id }) => id)
  );
  assert.deepEqual(first.sections, second.sections);
});

test('highest eligible stable payload changes concrete clothing for scene and style inputs', () => {
  const structured = generateReport(profile({
    preferences: {
      scenes: ['commute'],
      desiredEffects: ['vertical'],
      fitPreference: 'regular'
    }
  }), { now: NOW });
  const relaxed = generateReport(profile({
    preferences: {
      scenes: ['commute'],
      desiredEffects: ['soft'],
      fitPreference: 'relaxed'
    }
  }), { now: NOW });

  assert.equal(structured.sections.clothing[0].id, 'garment-commute-clean-blazer');
  assert.equal(
    structured.sections.clothing[0].action,
    '选择藏青合体肩单排扣外套，内搭米白窄圆领针织；极简层只增加一枚单一无标识几何扣件'
  );
  assert.equal(relaxed.sections.clothing[0].id, 'garment-soft-horizontal-break');
  assert.equal(
    relaxed.sections.clothing[0].action,
    '选择宽松针织开衫与宽直筒长裤，保留轻松活动余量；极简层只增加一枚单一无标识几何扣件'
  );
  assert.notDeepEqual(structured.sections.clothing[0], relaxed.sections.clothing[0]);
});

test('completed and partial A/B calibration change only confirmed color roles', () => {
  const unknown = generateReport(profile(), { now: NOW });
  const partial = generateReport(profile({
    appearance: {
      colorCalibration: {
        whiteChoice: 'pureWhite',
        neutralChoice: 'unknown',
        accentChoice: 'unknown'
      }
    }
  }), { now: NOW });
  const warm = generateReport(profile({
    appearance: {
      colorCalibration: {
        whiteChoice: 'ivory',
        neutralChoice: 'warmBrown',
        accentChoice: 'brickRed'
      }
    }
  }), { now: NOW });
  const cool = generateReport(profile({
    appearance: {
      colorCalibration: {
        whiteChoice: 'pureWhite',
        neutralChoice: 'coolGray',
        accentChoice: 'berry'
      }
    }
  }), { now: NOW });

  assert.equal(partial.colorPlan.secondary.name, '纯白');
  assert.deepEqual(partial.colorPlan.main, unknown.colorPlan.main);
  assert.deepEqual(partial.colorPlan.accent, unknown.colorPlan.accent);
  assert.deepEqual(
    [warm.colorPlan.main.name, warm.colorPlan.secondary.name, warm.colorPlan.accent.name],
    ['巧克力', '米白', '砖红']
  );
  assert.deepEqual(
    [cool.colorPlan.main.name, cool.colorPlan.secondary.name, cool.colorPlan.accent.name],
    ['炭灰', '纯白', '莓红']
  );
  assert.notDeepEqual(warm.topRecommendations[0], cool.topRecommendations[0]);
});

test('feedback-adjusted priorities change selected payload and Top 3 ordering', () => {
  const preferences = {
    scenes: ['commute'],
    desiredEffects: ['vertical', 'restrained'],
    hairColorPreference: {
      currentColor: 'naturalBlack',
      willingness: 'wants-dye',
      acceptsBleach: 'no',
      maintenanceLevel: 'low',
      workplaceRestriction: 'flexible'
    }
  };
  const baseline = generateReport(profile({ preferences }), { now: NOW });
  const adjusted = generateReport(profile({
    preferences,
    feedbackSummary: {
      likedRuleIds: ['garment-vertical-open-line'],
      suppressedFamilies: ['hairColor']
    }
  }), { now: NOW });

  assert.equal(baseline.sections.clothing[0].id, 'garment-monochrome-depth');
  assert.equal(adjusted.sections.clothing[0].id, 'garment-commute-clean-blazer');
  assert.deepEqual(
    baseline.topRecommendations.map(({ family }) => family),
    ['hairColor', 'color', 'clothing']
  );
  assert.deepEqual(
    adjusted.topRecommendations.map(({ family }) => family),
    ['color', 'clothing', 'hairColor']
  );
});

test('report uses controlled Chinese colors whose integer percentages total 100', () => {
  const report = generateReport(profile(), { now: NOW });
  const controlledNames = new Set(COLOR_PALETTE.map(({ name }) => name));
  const controlledPairs = new Set(COLOR_PALETTE.map(({ name, hex, reportHex }) => (
    `${name}:${reportHex || hex}`
  )));
  const roles = ['main', 'secondary', 'accent'].map((role) => report.colorPlan[role]);

  assert.deepEqual(roles.map(({ percentage }) => percentage), [60, 30, 10]);
  assert.equal(roles.reduce((sum, { percentage }) => sum + percentage, 0), 100);
  assert.ok(roles.every(({ name }) => controlledNames.has(name)));
  assert.ok(roles.every(({ name, hex }) => controlledPairs.has(`${name}:${hex}`)));
  assert.equal(
    report.colorPlan.screenColorDisclaimer,
    '屏幕色块仅为近似参考，不等同于真实布料或 Pantone 色号。'
  );
});

test('core commute garment preserves the complete approved cut structure', () => {
  const report = generateReport(profile(), { now: NOW });
  const garment = report.sections.clothing.find(
    ({ id }) => id === 'garment-commute-clean-blazer'
  );

  assert.ok(garment);
  assert.equal(
    garment.action,
    '选择藏青合体肩单排扣外套，内搭米白窄圆领针织；极简层只增加一枚单一无标识几何扣件'
  );
  assert.equal(
    garment.reason,
    '合体肩线增加清晰结构，直线开襟延伸纵向，适配通勤与正式接待。 希望呈现利落感时，保留一处清晰结构并减少无用途的堆叠。 极简偏好以低面积、可移除细节呈现，不改变场景版型与既定配色。'
  );
  assert.equal(
    garment.alternative,
    '天气偏热时改用米白有领衬衫和藏青直筒裤。 不需要装饰时，可移除几何扣件并保持纯色表面。'
  );
  assert.deepEqual(garment.sceneFit, ['commute', 'interview']);
  assert.deepEqual(
    GARMENT_FIELDS.map((field) => garment[field]),
    [
      'narrowNotchLapel', 'setInStructured', 'natural', 'hip', 'full',
      'mid', 'straight', 'notApplicable', 'regular', 'midweightWoven'
    ]
  );
});

test('default unknown hair color stays unconfirmed with safe no-dye structure', () => {
  const report = generateReport(profile(), { now: NOW });
  const hairColor = report.sections.hairColor.find(
    ({ id }) => id === 'hair-color-preserve-unknown'
  );

  assert.ok(hairColor);
  assert.equal(hairColor.colorName, '当前发色（未确认）');
  assert.equal(hairColor.bleachExpectation, 'no');
  assert.equal(hairColor.maintenanceLevel, 'low');
  assert.equal(
    hairColor.noDyeAlternative,
    '保持当前发色，只整理分缝与发尾'
  );
  assert.match(hairColor.safetyNote, /宽泛发色范围|不推断具体/);
  assert.doesNotMatch(JSON.stringify(hairColor), /黑茶/);
});

test('default no-dye advice traces the preference that drives its visible action', () => {
  const input = profile();
  const report = generateReport(input, { now: NOW });
  const recommendation = report.sections.hairColor[0];
  const rule = resolveRules(input, { now: NOW }).find(
    ({ id }) => id === 'preference-hair-no-dye'
  );

  assert.equal(
    recommendation.action,
    '保持当前发色，只整理分缝与发丝光泽'
  );
  assert.deepEqual(
    recommendation.appliedRuleIds,
    ['preference-hair-no-dye']
  );
  assert.equal(recommendation.priority, 800);
  assert.equal(recommendation.priority, rule.priority);
});

test('visible preference overrides retain each actual rule contributor', () => {
  const hair = generateReport(profile({
    appearance: { hairLength: 'shoulder' },
    preferences: { lockedAreas: ['hairLength'] }
  }), { now: NOW }).sections.hair[0];
  assert.deepEqual(hair.appliedRuleIds, [
    'preference-lock-hairLength',
    'appearance-confirmed-hair'
  ]);

  const makeup = generateReport(profile({
    preferences: {
      makeupPreference: 'none',
      lockedAreas: ['makeup']
    }
  }), { now: NOW }).sections.makeup[0];
  assert.deepEqual(makeup.appliedRuleIds, [
    'preference-lock-makeup',
    'preference-makeup-none'
  ]);

  const hairColor = generateReport(profile({
    preferences: {
      hairColorPreference: {
        ...createDefaultPreferences().hairColorPreference,
        willingness: 'open'
      },
      lockedAreas: ['hairColor']
    }
  }), { now: NOW }).sections.hairColor[0];
  assert.deepEqual(hairColor.appliedRuleIds, [
    'preference-hair-no-dye',
    'preference-lock-hairColor'
  ]);
});

test('six sections stay nonempty and every visible recommendation is explainable', () => {
  const report = generateReport(profile(), { now: NOW });

  assert.deepEqual(
    Object.keys(report.sections),
    ['clothing', 'hair', 'hairColor', 'makeup', 'accessories', 'sceneTransition']
  );
  assert.ok(Object.values(report.sections).every((section) => section.length > 0));
  assert.ok(Object.values(report.sections).flat().every((recommendation) => (
    VISIBLE_FIELDS.every((field) => Object.hasOwn(recommendation, field))
    && Array.isArray(recommendation.sceneFit)
    && recommendation.sceneFit.length > 0
    && Array.isArray(recommendation.appliedRuleIds)
  )));
});

test('every feedback-visible family traces all four states to real eligible rules', () => {
  const cases = [
    {
      family: 'clothing',
      input: profile({
        preferences: { desiredEffects: ['vertical'] }
      })
    },
    {
      family: 'hair',
      input: profile({
        appearance: { hairLength: 'shoulder' }
      })
    },
    {
      family: 'hairColor',
      input: profile()
    },
    {
      family: 'makeup',
      input: profile({
        preferences: { makeupPreference: 'none' }
      })
    },
    {
      family: 'accessories',
      input: profile({
        preferences: { lockedAreas: ['glasses'] }
      })
    },
    {
      family: 'sceneTransition',
      input: profile()
    }
  ];
  const fields = {
    liked: 'likedRuleIds',
    'not-for-me': 'rejectedRuleIds',
    owned: 'ownedRuleIds',
    tried: 'triedRuleIds'
  };
  const adjustments = {
    liked: 30,
    'not-for-me': -80,
    owned: 20,
    tried: 10
  };

  for (const { family, input } of cases) {
    const report = generateReport(input, { now: NOW });
    const recommendation = report.sections[family][0];
    const rules = resolveRules(input, { now: NOW });

    assert.ok(
      Array.isArray(recommendation.appliedRuleIds)
      && recommendation.appliedRuleIds.length > 0,
      family
    );
    assert.ok(recommendation.appliedRuleIds.every((id) => (
      rules.some((rule) => rule.id === id && rule.family === family)
    )), family);

    for (const [state, field] of Object.entries(fields)) {
      const summary = summarizeFeedback({
        [recommendation.id]: {
          recommendationId: recommendation.id,
          family,
          state,
          updatedAt: NOW
        }
      }, report);
      assert.deepEqual(summary[field], recommendation.appliedRuleIds, `${family}:${state}`);

      const adjusted = applyFeedbackScores(rules, summary);
      for (const ruleId of recommendation.appliedRuleIds) {
        const before = rules.find(({ id }) => id === ruleId);
        const after = adjusted.find(({ id }) => id === ruleId);
        assert.equal(
          after.priority,
          before.priority + adjustments[state],
          `${family}:${state}:${ruleId}`
        );
      }
    }
  }
});

test('Top 3 has unique ids and three distinct recommendation families', () => {
  const report = generateReport(profile(), { now: NOW });

  assert.equal(report.topRecommendations.length, 3);
  assert.equal(new Set(report.topRecommendations.map(({ id }) => id)).size, 3);
  assert.equal(new Set(report.topRecommendations.map(({ family }) => family)).size, 3);
});

test('makeupPreference none produces only skippable no-makeup guidance', () => {
  const report = generateReport(profile({
    preferences: { makeupPreference: 'none' }
  }), { now: NOW });

  assert.ok(report.sections.makeup.every(({ skippable }) => skippable === true));
  assert.ok(report.sections.makeup.every(({ action, alternative }) => (
    /不化妆|跳过/.test(`${action}${alternative}`)
  )));
});

test('locked areas produce explicit low-intervention alternatives', () => {
  const report = generateReport(profile({
    preferences: { lockedAreas: ['hairLength', 'glasses', 'fit'] }
  }), { now: NOW });

  assert.ok(report.sections.hair.every(({ lowIntervention }) => lowIntervention === true));
  assert.ok(report.sections.accessories.every(({ lowIntervention }) => lowIntervention === true));
  assert.ok(report.sections.clothing.every(({ lowIntervention }) => lowIntervention === true));
  assert.ok([
    ...report.sections.hair,
    ...report.sections.accessories,
    ...report.sections.clothing
  ].every(({ alternative }) => /保持|不改变|低干预/.test(alternative)));
});

test('fit lock preserves the current garment structure with a traceable lock rule', () => {
  const report = generateReport(profile({
    preferences: {
      scenes: ['commute'],
      desiredEffects: ['vertical'],
      lockedAreas: ['fit']
    }
  }), { now: NOW });
  const clothing = report.sections.clothing[0];

  assert.equal(clothing.id, 'garment-fit-preserving-low-intervention');
  assert.equal(
    clothing.action,
    '保持现有版型与服装结构，仅调整配色、配饰或可移除外层'
  );
  assert.equal(
    clothing.reason,
    '已锁定版型调整，因此不改变肩线、腰位、松量、衣长或下装轮廓。'
  );
  assert.equal(
    clothing.alternative,
    '保持现有版型且不增加外层时，只用现有单品的藏青/米白配色和小面积配饰调整。'
  );
  assert.ok(GARMENT_FIELDS.every((field) => clothing[field] === 'preserveCurrent'));
  assert.deepEqual(clothing.appliedRuleIds, ['preference-lock-fit']);
  assert.equal(clothing.lowIntervention, true);
  assert.doesNotMatch(clothing.action, /合体肩|单排扣|直筒裤/);
  assert.ok(report.topRecommendations.some((item) => (
    item.family === 'clothing'
    && item.action === clothing.action
    && item.priority === clothing.priority
  )));
});

test('unknown appearance inputs stay safe and non-assertive', () => {
  const report = generateReport(profile(), { now: NOW });
  const unknownSensitive = [
    ...report.sections.hair,
    ...report.sections.accessories
  ];

  assert.ok(unknownSensitive.every(({ reason }) => /未确认|可以|优先/.test(reason)));
  assert.ok(unknownSensitive.every(({ action }) => !/一定|必须|最适合/.test(action)));
});

test('new Chinese styling uses no more than two optional traditional elements', () => {
  const report = generateReport(profile({
    preferences: {
      desiredEffects: ['clean', 'newChinese'],
      stylePreferences: ['minimal', 'newChinese'],
      trendEnabled: true
    }
  }), { now: NOW });

  const elements = report.sections.clothing.flatMap(
    ({ traditionalElements = [] }) => traditionalElements
  );
  assert.ok(elements.length <= 2);
});
