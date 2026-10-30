const test = require('node:test');
const assert = require('node:assert/strict');

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
  GARMENT_TEMPLATES
} = require('../apps/miniprogram/data/garment-taxonomy');

const NOW = '2026-07-30T00:00:00.000Z';

function reportFor(preferences = {}, feedbackSummary = {}) {
  return generateReport(buildStyleProfile({
    analysisMode: 'manual',
    preferences: {
      ...createDefaultPreferences(),
      scenes: ['commute'],
      desiredEffects: ['clean', 'vertical'],
      stylePreferences: ['minimal'],
      ...preferences
    },
    feedbackSummary
  }), { now: NOW });
}

function clothingText(report) {
  const { action, reason, alternative } = report.sections.clothing[0];
  return `${action}｜${reason}｜${alternative}`;
}

test('each selected style is confirmed and adds unique concrete clothing guidance', () => {
  const cases = [
    ['minimal', '极简', /单一无标识几何扣件/],
    ['classic', '经典', /素面窄幅皮带/],
    ['natural', '自然', /哑光棉麻纹理/],
    ['warm', '温暖', /驼色或青铜色/],
    ['vintage', '复古', /仿古金属扣/],
    ['newChinese', '新中式', /盘扣扣袢|窄幅织纹/],
    ['lightOutdoor', '轻户外', /轻量尼龙小包/]
  ];
  const signatures = [];

  for (const [style, label, signature] of cases) {
    const report = reportFor({ stylePreferences: [style] });
    const clothing = report.sections.clothing[0];
    const styleBasis = clothing.confirmedBasis.find(
      ({ key }) => key === 'stylePreferences'
    );
    const visibleText = clothingText(report);

    assert.equal(styleBasis?.value, label, style);
    assert.match(visibleText, signature, style);
    signatures.push(visibleText);
  }

  assert.equal(new Set(signatures).size, cases.length);
});

test('multiple styles combine in canonical order and stay deterministic', () => {
  const first = reportFor({
    stylePreferences: ['lightOutdoor', 'minimal', 'warm']
  });
  const second = reportFor({
    stylePreferences: ['warm', 'lightOutdoor', 'minimal']
  });
  const clothing = first.sections.clothing[0];
  const styleBasis = clothing.confirmedBasis.find(
    ({ key }) => key === 'stylePreferences'
  );
  const visibleText = clothingText(first);

  assert.equal(styleBasis?.value, '极简、温暖、轻户外');
  assert.deepEqual(first.sections.clothing, second.sections.clothing);
  assert.ok(
    visibleText.indexOf('单一无标识几何扣件')
      < visibleText.indexOf('驼色或青铜色')
  );
  assert.ok(
    visibleText.indexOf('驼色或青铜色')
      < visibleText.indexOf('轻量尼龙小包')
  );
});

test('fit lock, feedback suppression, and strict formal context outrank style overlays', () => {
  const preferences = {
    stylePreferences: ['warm', 'newChinese'],
    desiredEffects: ['clean', 'newChinese']
  };
  const locked = reportFor({
    ...preferences,
    lockedAreas: ['fit']
  }).sections.clothing[0];
  const suppressed = reportFor(preferences, {
    suppressedFamilies: ['clothing']
  }).sections.clothing[0];
  const formal = reportFor({
    ...preferences,
    scenes: ['formal'],
    activityContext: ['formalReception'],
    hairColorPreference: {
      ...createDefaultPreferences().hairColorPreference,
      workplaceRestriction: 'conservative'
    },
    trendEnabled: true
  }).sections.clothing[0];

  assert.equal(locked.id, 'garment-fit-preserving-low-intervention');
  assert.equal(suppressed.id, 'garment-feedback-low-intervention');
  for (const clothing of [locked, suppressed, formal]) {
    assert.deepEqual(clothing.traditionalElements, []);
    assert.doesNotMatch(
      `${clothing.action}${clothing.reason}${clothing.alternative}`,
      /驼色或青铜色|盘扣扣袢|窄幅织纹/
    );
  }
});

test('a conservative hair-color workplace limit does not erase non-work clothing styles', () => {
  const cases = [
    ['minimal', /单一无标识几何扣件/],
    ['vintage', /仿古金属扣/],
    ['natural', /哑光棉麻纹理/]
  ];
  const visibleGuidance = [];

  for (const [style, signature] of cases) {
    const report = reportFor({
      scenes: ['casual'],
      activityContext: ['indoor'],
      stylePreferences: [style],
      hairColorPreference: {
        ...createDefaultPreferences().hairColorPreference,
        workplaceRestriction: 'conservative'
      }
    });
    const text = clothingText(report);

    assert.match(text, signature, style);
    visibleGuidance.push(text);
  }

  assert.equal(new Set(visibleGuidance).size, cases.length);
});

test('non-work conservative-hair styles combine canonically and deterministically', () => {
  const preferences = {
    scenes: ['casual'],
    activityContext: ['indoor'],
    hairColorPreference: {
      ...createDefaultPreferences().hairColorPreference,
      workplaceRestriction: 'conservative'
    }
  };
  const first = reportFor({
    ...preferences,
    stylePreferences: ['vintage', 'natural', 'minimal']
  });
  const second = reportFor({
    ...preferences,
    stylePreferences: ['natural', 'minimal', 'vintage']
  });
  const text = clothingText(first);

  assert.deepEqual(first.sections.clothing, second.sections.clothing);
  assert.ok(
    text.indexOf('单一无标识几何扣件')
      < text.indexOf('哑光棉麻纹理')
  );
  assert.ok(
    text.indexOf('哑光棉麻纹理')
      < text.indexOf('仿古金属扣')
  );
});

test('non-work clothing styles remain visible while conservative hair-color filtering stays active', () => {
  const preferences = {
    ...createDefaultPreferences(),
    scenes: ['casual'],
    activityContext: ['indoor'],
    stylePreferences: ['vintage'],
    hairColorPreference: {
      currentColor: 'unknown',
      willingness: 'wants-dye',
      acceptsBleach: 'yes',
      maintenanceLevel: 'high',
      workplaceRestriction: 'conservative'
    }
  };
  const input = buildStyleProfile({
    analysisMode: 'manual',
    preferences
  });
  const report = generateReport(input, { now: NOW });
  const conservativeHairRules = resolveRules(input, { now: NOW })
    .filter(({ family }) => family === 'hairColor');
  const flexibleInput = buildStyleProfile({
    analysisMode: 'manual',
    preferences: {
      ...preferences,
      hairColorPreference: {
        ...preferences.hairColorPreference,
        workplaceRestriction: 'flexible'
      }
    }
  });
  const flexibleHairRules = resolveRules(flexibleInput, { now: NOW })
    .filter(({ family }) => family === 'hairColor');

  assert.match(clothingText(report), /仿古金属扣/);
  assert.ok(conservativeHairRules.length > 0);
  assert.ok(conservativeHairRules.every(
    ({ candidate }) => candidate.priorityWhenWorkRestrictionUnknown === true
  ));
  assert.ok(flexibleHairRules.some(
    ({ candidate }) => candidate.priorityWhenWorkRestrictionUnknown !== true
  ));
  assert.ok(report.sections.hairColor[0].appliedRuleIds.every((id) => (
    conservativeHairRules.some((rule) => rule.id === id)
  )));
});

test('formal reception and conservative work scenes still outrank clothing overlays', () => {
  const strictCases = [
    {
      scenes: ['formal'],
      activityContext: ['indoor'],
      workplaceRestriction: 'flexible'
    },
    {
      scenes: ['casual'],
      activityContext: ['formalReception'],
      workplaceRestriction: 'flexible'
    },
    {
      scenes: ['commute'],
      activityContext: ['indoor'],
      workplaceRestriction: 'conservative'
    },
    {
      scenes: ['interview'],
      activityContext: ['indoor'],
      workplaceRestriction: 'conservative'
    }
  ];

  for (const strictCase of strictCases) {
    const report = reportFor({
      scenes: strictCase.scenes,
      activityContext: strictCase.activityContext,
      stylePreferences: ['minimal', 'vintage', 'natural'],
      hairColorPreference: {
        ...createDefaultPreferences().hairColorPreference,
        workplaceRestriction: strictCase.workplaceRestriction
      }
    });

    assert.doesNotMatch(
      clothingText(report),
      /单一无标识几何扣件|仿古金属扣|哑光棉麻纹理/,
      `${strictCase.scenes[0]}:${strictCase.activityContext[0]}`
    );
  }
});

test('explicit new Chinese styling survives vertical and soft stable garment rules', () => {
  for (const desiredEffects of [['vertical'], ['soft']]) {
    const clothing = reportFor({
      desiredEffects,
      stylePreferences: ['newChinese'],
      trendEnabled: false
    }).sections.clothing[0];
    const visibleText = `${clothing.action}${clothing.reason}${clothing.alternative}`;

    assert.ok(clothing.appliedRuleIds.every((id) => !id.startsWith('trend-')));
    assert.ok(clothing.traditionalElements.length >= 1);
    assert.ok(clothing.traditionalElements.length <= 2);
    assert.match(visibleText, /现代新中式/);
    assert.match(visibleText, /盘扣扣袢|窄幅织纹/);
    assert.doesNotMatch(visibleText, /当季|季节趋势|流行趋势/);
  }
});

test('bold and vintage desired effects add controlled visible guidance', () => {
  const bold = reportFor({
    desiredEffects: ['bold']
  });
  const vintage = reportFor({
    desiredEffects: ['vintage']
  });

  assert.match(clothingText(bold), /10% 强调色集中在一处/);
  assert.match(clothingText(vintage), /仿古金属扣或素面复古表/);
  assert.notEqual(clothingText(bold), clothingText(vintage));
});

test('core garment rise comes from the straight-trouser template', () => {
  const clothing = reportFor().sections.clothing[0];
  const trouser = GARMENT_TEMPLATES.find(({ id }) => id === 'straightTrousers');

  assert.ok(clothing.garmentTemplateIds.includes(trouser.id));
  assert.equal(trouser.trouserRise, 'mid');
  assert.equal(clothing.trouserRise, trouser.trouserRise);
});
