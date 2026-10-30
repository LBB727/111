const test = require('node:test');
const assert = require('node:assert/strict');

const { COLOR_PALETTE } = require('../apps/miniprogram/data/color-palette');
const {
  GARMENT_ENUMS,
  GARMENT_TEMPLATES
} = require('../apps/miniprogram/data/garment-taxonomy');
const { SCENE_RULES } = require('../apps/miniprogram/data/scene-rules');
const { HAIR_COLOR_RULES } = require('../apps/miniprogram/data/hair-color-rules');
const { STYLE_RULES_V2 } = require('../apps/miniprogram/data/style-rules-v2');
const {
  TREND_RULES,
  isTrendRuleActive
} = require('../apps/miniprogram/data/trend-rules');
const {
  buildStyleProfile,
  createDefaultPreferences
} = require('../apps/miniprogram/services/profile-contract');

const EXPECTED_COLORS = [
  '黑色', '炭灰', '中灰', '米白', '纯白', '藏青', '牛仔蓝', '驼色', '卡其',
  '燕麦', '巧克力', '焦糖', '奶油黄', '姜黄', '杏色', '珊瑚', '番茄红',
  '砖红', '雾蓝', '宝蓝', '青绿', '薰衣草', '莓红', '酒红', '鼠尾草绿',
  '橄榄绿', '森林绿', '灰粉', '樱桃红', '金橘', '酸橙绿', '翠绿', '洋红',
  '金色', '银色', '青铜色'
];
const EXPECTED_HAIR_COLORS = [
  '自然黑', '柔黑', '黑茶色', '深茶棕', '巧克力棕', '栗棕', '焦糖棕',
  '铜棕', '红棕', '酒红棕', '冷棕', '灰棕', '蓝黑', '深橄榄棕',
  '奶茶棕', '玫瑰棕', '烟熏紫棕'
];
const SCENE_IDS = [
  'commute', 'interview', 'date', 'casual', 'party', 'travel', 'formal'
];
const COLOR_FIELDS = [
  'id', 'name', 'hex', 'family', 'temperature', 'lightnessBand',
  'chromaBand', 'roles'
];
const SCENE_FIELDS = [
  'hardConstraints', 'defaultFormality', 'basePaletteRoles', 'footwearGuidance'
];
const GARMENT_FIELDS = [
  'necklineOrCollar', 'shoulderConstruction', 'waistPlacement', 'length',
  'sleeveLength', 'trouserRise', 'legShape', 'skirtShape', 'ease',
  'materialAppearance'
];
const HAIR_FIELDS = [
  'level', 'temperature', 'applicationMethod', 'bleachExpectation',
  'maintenanceLevel', 'fadeDirection', 'scenes', 'wardrobeLinks',
  'groomingLinks', 'noDyeAlternative', 'safetyNote'
];
const STYLE_RULE_FIELDS = [
  'ruleId', 'market', 'sourceScope', 'scene', 'layer', 'validFrom',
  'expiresOn', 'requiredInputs', 'confirmedInputs', 'recommendation',
  'intendedVisualEffect', 'alternative', 'confidence', 'evidenceUrl',
  'lastReviewed'
];
const TREND_TECHNIQUE_KEYS = [
  'colorIds', 'silhouetteIds', 'materialAppearanceIds', 'hairTechniqueIds',
  'sceneTechniqueIds'
];
const STABLE_RULE_PROFILE_INPUTS = {
  'garment-vertical-open-line': {
    scenes: ['commute'],
    desiredEffects: ['vertical']
  },
  'garment-soft-horizontal-break': {
    scenes: ['commute'],
    desiredEffects: ['soft'],
    fitPreference: 'relaxed'
  },
  'garment-defined-shoulder-balance': {
    scenes: ['interview'],
    desiredEffects: ['shoulderStructure']
  },
  'garment-waist-placement-choice': {
    scenes: ['date'],
    desiredEffects: ['waistDefinition'],
    fitPreference: 'regular'
  },
  'garment-monochrome-depth': {
    scenes: ['commute'],
    desiredEffects: ['restrained']
  },
  'garment-travel-layering': {
    scenes: ['travel'],
    cityOrClimateText: '上海夏季'
  }
};
const TREND_AUDIT_EXPECTATIONS = {
  'trend-cn-lightweight-modern-chinese': {
    validFrom: '2025-02-08',
    expiresOn: '2027-02-08',
    evidenceUrl: 'https://www.cntac.org.cn/zixun/hangye/202502/t20250208_4376587.html',
    lastReviewed: '2026-07-29'
  },
  'trend-international-ss2026-color-families': {
    validFrom: '2025-09-11',
    expiresOn: '2026-08-31',
    evidenceUrl: 'https://www.pantonecn.com/articles/fashion-color-trend-report/new-york-fashion-week-spring-summer-2026',
    lastReviewed: '2026-07-29'
  }
};

function valueAtPath(profile, fieldPath) {
  return fieldPath.split('.').reduce((value, key) => value?.[key], profile);
}

function isPresent(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}

function profileMatchesStableRule(profile, rule) {
  const matchesScene = rule.scene.some((scene) => profile.scenes.includes(scene));
  const hasRequiredInputs = rule.requiredInputs.every((fieldPath) => (
    isPresent(valueAtPath(profile, fieldPath))
  ));
  const hasConfirmedInputs = rule.confirmedInputs.every((predicate) => {
    const value = valueAtPath(profile, predicate.path);
    if (Object.hasOwn(predicate, 'includes')) {
      return Array.isArray(value) && value.includes(predicate.includes);
    }
    if (Object.hasOwn(predicate, 'equals')) return value === predicate.equals;
    if (predicate.isPresent === true) return isPresent(value);
    return false;
  });
  return matchesScene && hasRequiredInputs && hasConfirmedInputs;
}

test('color palette exposes the complete controlled everyday-color set', () => {
  assert.deepEqual(COLOR_PALETTE.map(({ name }) => name), EXPECTED_COLORS);
  assert.equal(new Set(COLOR_PALETTE.map(({ id }) => id)).size, EXPECTED_COLORS.length);
  assert.ok(COLOR_PALETTE.every((color) => (
    COLOR_FIELDS.every((field) => Object.hasOwn(color, field))
    && /^#[0-9A-F]{6}$/.test(color.hex)
    && Array.isArray(color.roles)
    && color.roles.length > 0
  )));
  assert.deepEqual(
    COLOR_PALETTE.find(({ id }) => id === 'navy'),
    {
      id: 'navy',
      name: '藏青',
      hex: '#1F2A44',
      family: 'blue',
      temperature: 'cool',
      lightnessBand: 'deep',
      chromaBand: 'muted',
      roles: ['main', 'secondary', 'nearFace', 'lowerBody']
    }
  );
});

test('all seven Mainland-China scene defaults expose actionable constraints', () => {
  assert.deepEqual(SCENE_RULES.map(({ id }) => id), SCENE_IDS);
  assert.ok(SCENE_RULES.every((scene) => (
    scene.market === 'CN'
    && SCENE_FIELDS.every((field) => Object.hasOwn(scene, field))
    && scene.hardConstraints.length > 0
    && scene.basePaletteRoles.length > 0
    && scene.footwearGuidance.length > 0
  )));
  assert.equal(
    SCENE_RULES.find(({ id }) => id === 'date').defaultExposure,
    'activityAndPreferenceFirst'
  );
  assert.equal(
    SCENE_RULES.find(({ id }) => id === 'formal').invitationRequirementsFirst,
    true
  );
});

test('garment templates use controlled cut fields for visual and activity effects', () => {
  assert.ok(Object.keys(GARMENT_ENUMS).length >= GARMENT_FIELDS.length);
  assert.ok(GARMENT_TEMPLATES.length >= 8);
  assert.ok(GARMENT_TEMPLATES.every((template) => (
    GARMENT_FIELDS.every((field) => Object.hasOwn(template, field))
    && GARMENT_FIELDS.every((field) => GARMENT_ENUMS[field].includes(template[field]))
    && template.intendedVisualEffect.length > 0
    && template.activityGuidance.length > 0
  )));
});

test('garment categories use notApplicable instead of invented anatomy fields', () => {
  const lowerBody = GARMENT_TEMPLATES.filter(({ category }) => category === 'lowerBody');
  const upperOrOnePiece = GARMENT_TEMPLATES.filter(({ category }) => (
    ['outerLayer', 'top', 'onePiece'].includes(category)
  ));

  assert.ok(['necklineOrCollar', 'shoulderConstruction', 'sleeveLength'].every((field) => (
    GARMENT_ENUMS[field].includes('notApplicable')
  )));
  assert.ok(lowerBody.every((template) => (
    template.necklineOrCollar === 'notApplicable'
    && template.shoulderConstruction === 'notApplicable'
    && template.sleeveLength === 'notApplicable'
  )));
  assert.ok(upperOrOnePiece.every((template) => (
    template.necklineOrCollar !== 'notApplicable'
    && template.shoulderConstruction !== 'notApplicable'
    && template.sleeveLength !== 'notApplicable'
    && template.trouserRise === 'notApplicable'
    && template.legShape === 'notApplicable'
  )));
  assert.ok(lowerBody.every((template) => (
    (template.legShape === 'notApplicable') !== (template.skirtShape === 'notApplicable')
  )));
});

test('hair-color rules expose the exact controlled set and safe decision metadata', () => {
  assert.deepEqual(HAIR_COLOR_RULES.map(({ name }) => name), EXPECTED_HAIR_COLORS);
  assert.ok(HAIR_COLOR_RULES.every((rule) => (
    HAIR_FIELDS.every((field) => Object.hasOwn(rule, field))
    && ['no', 'possible', 'professionalAssessment'].includes(rule.bleachExpectation)
    && rule.noDyeAlternative.trim().length > 0
    && rule.safetyNote === '请遵循产品标签，并由专业发型师评估当前发底；本建议不提供操作配方。'
  )));
  assert.deepEqual(
    HAIR_COLOR_RULES
      .filter(({ priorityWhenWorkRestrictionUnknown }) => priorityWhenWorkRestrictionUnknown)
      .map(({ name }) => name),
    ['自然黑', '黑茶色', '深茶棕', '巧克力棕']
  );
  assert.ok(HAIR_COLOR_RULES.some(({ highLightnessDependent }) => highLightnessDependent));
  assert.ok(HAIR_COLOR_RULES.some(({ highLightnessDependent }) => !highLightnessDependent));
});

test('stable styling rules carry the auditable V2 contract and controlled references', () => {
  const colorIds = new Set(COLOR_PALETTE.map(({ id }) => id));
  const garmentIds = new Set(GARMENT_TEMPLATES.map(({ id }) => id));

  assert.ok(STYLE_RULES_V2.length >= 6);
  assert.ok(STYLE_RULES_V2.every((rule) => (
    STYLE_RULE_FIELDS.every((field) => Object.hasOwn(rule, field))
    && rule.market === 'CN'
    && rule.layer === 'stable'
    && rule.expiresOn === null
    && rule.recommendation.colorIds.every((id) => colorIds.has(id))
    && rule.recommendation.garmentTemplateIds.every((id) => garmentIds.has(id))
  )));
  assert.deepEqual(
    STYLE_RULES_V2.find(({ ruleId }) => ruleId === 'garment-vertical-open-line'),
    {
      ruleId: 'garment-vertical-open-line',
      market: 'CN',
      sourceScope: 'CN',
      scene: ['commute', 'interview', 'date', 'formal'],
      layer: 'stable',
      validFrom: '2026-01-01',
      expiresOn: null,
      requiredInputs: ['desiredEffects'],
      confirmedInputs: [{ path: 'desiredEffects', includes: 'vertical' }],
      recommendation: {
        colorIds: ['navy', 'ivory', 'brickRed'],
        garmentTemplateIds: [
          'singleBreastedBlazer', 'crewNeckKnitTop', 'straightTrousers'
        ]
      },
      intendedVisualEffect: '延伸纵向线条',
      alternative: '用相近明度上下装替代长外层',
      confidence: 'high',
      evidenceUrl: 'https://openstd.samr.gov.cn/',
      lastReviewed: '2026-07-29'
    }
  );
});

test('every stable rule matches at least one normalized StyleProfileV2', () => {
  assert.equal(
    Object.keys(STABLE_RULE_PROFILE_INPUTS).length,
    STYLE_RULES_V2.length
  );

  for (const rule of STYLE_RULES_V2) {
    const preferences = STABLE_RULE_PROFILE_INPUTS[rule.ruleId];
    assert.ok(preferences, `missing valid profile fixture for ${rule.ruleId}`);
    const profile = buildStyleProfile({
      analysisMode: 'manual',
      preferences: {
        ...createDefaultPreferences(),
        ...preferences
      }
    });
    assert.equal(
      profileMatchesStableRule(profile, rule),
      true,
      `${rule.ruleId} is unreachable from normalized StyleProfileV2`
    );
  }
});

test('trend rules stay time bounded, source audited, and limited to composable techniques', () => {
  assert.deepEqual(new Set(TREND_RULES.map(({ sourceScope }) => sourceScope)), new Set([
    'CN',
    'international'
  ]));
  assert.ok(TREND_RULES.every((rule) => (
    rule.layer === 'trend'
    && /^\d{4}-\d{2}-\d{2}$/.test(rule.validFrom)
    && /^\d{4}-\d{2}-\d{2}$/.test(rule.expiresOn)
    && typeof rule.evidenceUrl === 'string'
    && rule.evidenceUrl.startsWith('https://')
    && /^\d{4}-\d{2}-\d{2}$/.test(rule.lastReviewed)
    && rule.source.title.length > 0
    && rule.source.publishedOn.length > 0
    && rule.source.evidenceUrl === rule.evidenceUrl
    && Object.keys(rule.techniques).every((key) => TREND_TECHNIQUE_KEYS.includes(key))
    && Object.isFrozen(rule)
    && Object.isFrozen(rule.scene)
    && Object.isFrozen(rule.source)
    && Object.isFrozen(rule.techniques)
    && Object.values(rule.techniques).every(Object.isFrozen)
    && !Object.hasOwn(rule, 'images')
    && !Object.hasOwn(rule, 'people')
    && !Object.hasOwn(rule, 'modelLooks')
  )));
  assert.deepEqual(
    Object.fromEntries(TREND_RULES.map((rule) => [
      rule.ruleId,
      {
        validFrom: rule.validFrom,
        expiresOn: rule.expiresOn,
        evidenceUrl: rule.evidenceUrl,
        lastReviewed: rule.lastReviewed
      }
    ])),
    TREND_AUDIT_EXPECTATIONS
  );
  assert.equal(
    TREND_RULES.find(({ sourceScope }) => sourceScope === 'CN').expiresOn,
    '2027-02-08'
  );
  assert.equal(
    TREND_RULES.find(({ sourceScope }) => sourceScope === 'international').expiresOn,
    '2026-08-31'
  );
  assert.equal(isTrendRuleActive(TREND_RULES[0], '2026-07-29'), true);
  assert.equal(isTrendRuleActive(TREND_RULES[0], '2028-01-01'), false);
});
