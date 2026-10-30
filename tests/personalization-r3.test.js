const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildStyleProfile,
  createDefaultAppearance,
  createDefaultPreferences
} = require('../apps/miniprogram/services/profile-contract');
const {
  generateReport
} = require('../apps/miniprogram/services/recommendation-engine');
const {
  resolveRules
} = require('../apps/miniprogram/services/rule-resolver');

const NOW = '2026-07-30T00:00:00.000Z';

function profile({
  appearance = {},
  preferences = {},
  feedbackSummary = {}
} = {}) {
  const defaultAppearance = createDefaultAppearance();
  const defaultPreferences = createDefaultPreferences();
  return buildStyleProfile({
    analysisMode: 'manual',
    appearance: {
      ...defaultAppearance,
      ...appearance,
      colorCalibration: {
        ...defaultAppearance.colorCalibration,
        ...(appearance.colorCalibration || {})
      }
    },
    preferences: {
      ...defaultPreferences,
      ...preferences,
      hairColorPreference: {
        ...defaultPreferences.hairColorPreference,
        ...(preferences.hairColorPreference || {})
      }
    },
    feedbackSummary
  });
}

function visible(item) {
  return `${item.action}|${item.reason}|${item.alternative}`;
}

test('formal and travel receive separate executable transitions with truthful scene coverage', () => {
  const input = profile({
    preferences: {
      scenes: ['formal', 'travel'],
      desiredEffects: ['clean']
    }
  });
  const report = generateReport(input, { now: NOW });
  const transitions = Object.fromEntries(
    report.sections.sceneTransition.map((item) => [item.sceneFit[0], item])
  );

  assert.equal(report.sections.sceneTransition.length, 2);
  assert.deepEqual(Object.keys(transitions).sort(), ['formal', 'travel']);
  assert.deepEqual(transitions.formal.sceneFit, ['formal']);
  assert.deepEqual(transitions.travel.sceneFit, ['travel']);
  assert.match(visible(transitions.formal), /正式活动.*邀请函.*藏青单排扣外套/s);
  assert.match(visible(transitions.travel), /旅行.*天气.*步行.*轻量衬衫式外层/s);
  assert.deepEqual(report.sections.clothing[0].sceneFit, [input.scenes[0]]);
});

test('manual color calibration keeps the color action, reason, id, and alternatives aligned', () => {
  const report = generateReport(profile({
    appearance: {
      colorCalibration: {
        whiteChoice: 'pureWhite',
        neutralChoice: 'coolGray',
        accentChoice: 'berry'
      }
    }
  }), { now: NOW });
  const plan = report.colorPlan;
  const color = report.topRecommendations.find(({ family }) => family === 'color');
  const selectedNames = [
    plan.main.name,
    plan.secondary.name,
    plan.accent.name
  ];

  assert.deepEqual(selectedNames, ['炭灰', '纯白', '莓红']);
  assert.equal(color.id, 'rec-color-charcoal-pureWhite-berry');
  for (const name of selectedNames) {
    assert.match(color.action, new RegExp(name));
    assert.match(color.reason, new RegExp(name));
  }
  assert.match(color.action, /60\/30\/10/);
  assert.ok(plan.alternatives.every((name) => !selectedNames.includes(name)));
  assert.equal(
    color.alternative,
    `用${plan.alternatives[0]}替代${plan.main.name}。`
  );
  assert.doesNotMatch(color.alternative, /用炭灰替代炭灰/);
});

test('confirmed short-straight-low and long-coily-high hair produce different safe 10-minute plans', () => {
  const short = generateReport(profile({
    appearance: {
      hairLength: 'short',
      hairTexture: 'straight',
      visibleHairVolume: 'low'
    },
    preferences: { stylingTimeMinutes: 10 }
  }), { now: NOW }).sections.hair[0];
  const long = generateReport(profile({
    appearance: {
      hairLength: 'long',
      hairTexture: 'coily',
      visibleHairVolume: 'high'
    },
    preferences: { stylingTimeMinutes: 10 }
  }), { now: NOW }).sections.hair[0];
  const shortVisible = visible(short);
  const longVisible = visible(long);

  assert.match(short.action, /10 分钟.*短发.*直发.*低发量/s);
  assert.match(long.action, /10 分钟.*长发.*紧密卷曲.*高发量/s);
  assert.match(short.reason, /短发.*低发量.*轻量/s);
  assert.match(long.reason, /紧密卷曲.*保留原有卷簇.*分区/s);
  assert.match(short.alternative, /指腹.*分缝/);
  assert.match(long.alternative, /卷簇.*低位束发/);
  assert.notEqual(shortVisible, longVisible);
  assert.doesNotMatch(longVisible, /强行拉直|反复高温/);
});

test('no-dye preserves broad brown families without inventing a more specific shade', () => {
  const cases = [
    {
      currentColor: 'deepBrown',
      expectedName: '深棕',
      expectedDepth: 'dark',
      excluded: /深茶棕|黑茶色|巧克力棕/
    },
    {
      currentColor: 'mediumBrown',
      expectedName: '中棕',
      expectedDepth: 'medium',
      excluded: /栗棕|巧克力棕|冷棕/
    },
    {
      currentColor: 'lightBrown',
      expectedName: '浅棕',
      expectedDepth: 'light',
      excluded: /焦糖棕|奶茶棕|灰棕/
    }
  ];

  for (const {
    currentColor,
    expectedName,
    expectedDepth,
    excluded
  } of cases) {
    const hairColor = generateReport(profile({
      preferences: {
        hairColorPreference: {
          currentColor,
          willingness: 'no-dye'
        }
      }
    }), { now: NOW }).sections.hairColor[0];

    assert.equal(hairColor.id, `hair-color-preserve-${currentColor}`);
    assert.equal(hairColor.colorName, expectedName);
    assert.equal(hairColor.colorFamily, currentColor);
    assert.equal(hairColor.depthBand, expectedDepth);
    assert.equal(hairColor.toneDirection, 'neutral');
    assert.match(hairColor.action, new RegExp(`保留当前${expectedName}发色`));
    assert.doesNotMatch(JSON.stringify(hairColor), excluded);
    assert.equal(hairColor.applicationStyle, 'preserveCurrent');
    assert.equal(hairColor.bleachExpectation, 'no');
  }
});

test('an unknown locked or no-dye hair color stays explicitly unknown instead of becoming black tea', () => {
  const hairColor = generateReport(profile({
    appearance: { visibleHairColorFamily: 'unknown' },
    preferences: {
      hairColorPreference: {
        currentColor: 'unknown',
        willingness: 'no-dye'
      },
      lockedAreas: ['hairColor']
    }
  }), { now: NOW }).sections.hairColor[0];

  assert.equal(hairColor.id, 'hair-color-preserve-unknown');
  assert.equal(hairColor.colorName, '当前发色（未确认）');
  assert.equal(hairColor.colorFamily, 'unknown');
  assert.match(hairColor.action, /保持当前发色/);
  assert.doesNotMatch(JSON.stringify(hairColor), /黑茶/);
  assert.equal(hairColor.applicationStyle, 'preserveCurrent');
  assert.equal(hairColor.bleachExpectation, 'no');
});

test('unknown workplace restrictions rank conservative-priority hair colors first', () => {
  const input = profile({
    preferences: {
      scenes: ['date'],
      hairColorPreference: {
        currentColor: 'unknown',
        willingness: 'wants-dye',
        acceptsBleach: 'yes',
        maintenanceLevel: 'high',
        workplaceRestriction: 'unknown'
      }
    }
  });
  const candidates = resolveRules(input, { now: NOW }).filter(
    ({ family, candidate }) => family === 'hairColor' && candidate.name
  );
  const firstNonPriority = candidates.findIndex(
    ({ candidate }) => candidate.priorityWhenWorkRestrictionUnknown !== true
  );
  const lastPriority = candidates.findLastIndex(
    ({ candidate }) => candidate.priorityWhenWorkRestrictionUnknown === true
  );
  const selected = generateReport(input, { now: NOW }).sections.hairColor[0];

  assert.ok(candidates.length > 0);
  assert.equal(candidates[0].candidate.priorityWhenWorkRestrictionUnknown, true);
  assert.ok(firstNonPriority === -1 || lastPriority < firstNonPriority);
  assert.equal(selected.id, `hair-color-${candidates[0].candidate.id}`);
});

test('acceptsBleach no removes every possible-bleach candidate before selection', () => {
  const input = profile({
    preferences: {
      scenes: ['date'],
      hairColorPreference: {
        currentColor: 'redBrown',
        willingness: 'wants-dye',
        acceptsBleach: 'no',
        maintenanceLevel: 'high',
        workplaceRestriction: 'flexible'
      }
    }
  });
  const candidates = resolveRules(input, { now: NOW }).filter(
    ({ family, candidate }) => family === 'hairColor' && candidate.name
  );
  const selected = generateReport(input, { now: NOW }).sections.hairColor[0];

  assert.ok(candidates.length > 0);
  assert.ok(candidates.every(
    ({ candidate }) => candidate.bleachExpectation !== 'possible'
  ));
  assert.notEqual(selected.bleachExpectation, 'possible');
});

test('light and defined makeup use distinct steps linked to the final clothing and hair colors', () => {
  const reportFor = (makeupPreference) => generateReport(profile({
    appearance: {
      colorCalibration: {
        whiteChoice: 'pureWhite',
        neutralChoice: 'warmBrown',
        accentChoice: 'berry'
      }
    },
    preferences: {
      makeupPreference,
      hairColorPreference: {
        currentColor: 'redBrown',
        willingness: 'no-dye'
      }
    }
  }), { now: NOW });
  const lightReport = reportFor('light');
  const definedReport = reportFor('defined');
  const light = lightReport.sections.makeup[0];
  const defined = definedReport.sections.makeup[0];

  assert.equal(light.id, 'makeup-light-soft-focus');
  assert.equal(defined.id, 'makeup-defined-single-focus');
  assert.match(light.action, /淡妆.*轻薄|轻薄.*淡妆/);
  assert.match(defined.action, /明确重点.*眼部|明确重点.*唇色/);
  assert.notEqual(visible(light), visible(defined));

  for (const report of [lightReport, definedReport]) {
    const makeup = report.sections.makeup[0];
    const linkedNames = [
      report.sections.hairColor[0].colorName,
      report.colorPlan.main.name,
      report.colorPlan.secondary.name,
      report.colorPlan.accent.name
    ];
    for (const name of linkedNames) {
      assert.match(visible(makeup), new RegExp(name));
    }
    assert.doesNotMatch(visible(makeup), /黑茶色、藏青和米白/);
  }
});

test('a locked confirmed none glasses state says to remain without glasses or frames', () => {
  const accessories = generateReport(profile({
    appearance: { glassesState: 'none' },
    preferences: { lockedAreas: ['glasses'] }
  }), { now: NOW }).sections.accessories[0];

  assert.match(visible(accessories), /保持不佩戴眼镜/);
  assert.doesNotMatch(visible(accessories), /保持现有眼镜|保持镜框|不改变镜框/);
  assert.equal(accessories.lowIntervention, true);
});
