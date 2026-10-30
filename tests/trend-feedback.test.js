const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildStyleProfile,
  createDefaultPreferences
} = require('../apps/miniprogram/services/profile-contract');
const {
  generateReport
} = require('../apps/miniprogram/services/recommendation-engine');

let resolver = {};
let adjuster = {};
try {
  resolver = require('../apps/miniprogram/services/rule-resolver');
} catch {}
try {
  adjuster = require('../apps/miniprogram/services/feedback-adjuster');
} catch {}

const NOW = '2026-07-29T00:00:00.000Z';

function profile(preferences = {}, feedbackSummary = {}) {
  return buildStyleProfile({
    analysisMode: 'manual',
    preferences: {
      ...createDefaultPreferences(),
      scenes: ['formal'],
      desiredEffects: ['clean', 'newChinese'],
      stylePreferences: ['minimal', 'newChinese'],
      trendEnabled: true,
      ...preferences
    },
    feedbackSummary
  });
}

test('rule resolver and feedback adjuster expose the Task 6 interfaces', () => {
  assert.equal(typeof resolver.resolveRules, 'function');
  assert.equal(typeof adjuster.applyFeedbackScores, 'function');
});

test('request context outranks a compatible seasonal trend', () => {
  const rules = resolver.resolveRules(profile({
    scenes: ['commute'],
    hairColorPreference: {
      currentColor: 'naturalBlack',
      willingness: 'open',
      acceptsBleach: 'no',
      maintenanceLevel: 'low',
      workplaceRestriction: 'flexible'
    }
  }), { now: NOW });
  const context = rules.find(({ layer }) => layer === 'request_context');
  const trend = rules.find(({ layer }) => layer === 'seasonal_trend');

  assert.ok(context);
  assert.ok(trend);
  assert.equal(context.priority, 1000);
  assert.equal(trend.priority, 100);
  assert.ok(rules.indexOf(context) < rules.indexOf(trend));
});

test('formal reception and conservative industry context eliminate conflicting trend content', () => {
  const input = profile({
    scenes: ['formal'],
    activityContext: ['formalReception'],
    hairColorPreference: {
      currentColor: 'naturalBlack',
      willingness: 'no-dye',
      acceptsBleach: 'no',
      maintenanceLevel: 'low',
      workplaceRestriction: 'conservative'
    }
  });
  const rules = resolver.resolveRules(input, { now: NOW });
  const report = generateReport(input, { now: NOW });

  assert.ok(rules.every(({ layer }) => layer !== 'seasonal_trend'));
  assert.deepEqual(report.trendMeta.appliedRuleIds, []);
  assert.equal(report.trendMeta.validUntil, null);
  assert.deepEqual(report.sections.clothing[0].traditionalElements, []);
  assert.ok(report.sections.clothing[0].appliedRuleIds.every(
    (id) => !id.startsWith('trend-')
  ));
});

test('expired trends are excluded at resolve time', () => {
  const input = profile({
    desiredEffects: ['clean', 'vertical']
  });
  const rules = resolver.resolveRules(input, {
    now: '2028-01-01T00:00:00.000Z'
  });

  assert.ok(rules.every(({ layer }) => layer !== 'seasonal_trend'));
  assert.ok(rules.some(({ layer }) => layer === 'stable'));
  const report = generateReport(input, {
    now: '2028-01-01T00:00:00.000Z'
  });
  assert.ok(report.sections.clothing[0].appliedRuleIds.some(
    (id) => !id.startsWith('trend-')
  ));
});

test('rejecting bleach eliminates every high-lightness-dependent hair scheme', () => {
  const rules = resolver.resolveRules(profile({
    hairColorPreference: {
      currentColor: 'naturalBlack',
      willingness: 'open',
      acceptsBleach: 'no',
      maintenanceLevel: 'high',
      workplaceRestriction: 'flexible'
    }
  }), { now: NOW });
  const hairColors = rules.filter(({ family }) => family === 'hairColor');

  assert.ok(hairColors.length > 0);
  assert.ok(hairColors.every(({ candidate }) => candidate.highLightnessDependent !== true));
});

test('feedback changes only priority with the approved exact adjustments', () => {
  const rules = resolver.resolveRules(profile({
    desiredEffects: ['clean', 'vertical']
  }), { now: NOW });
  const stable = rules.find(({ id }) => id === 'garment-vertical-open-line');
  const hairColor = rules.find(({ family }) => family === 'hairColor');
  assert.ok(stable);
  assert.ok(hairColor);

  const adjusted = adjuster.applyFeedbackScores(rules, {
    likedRuleIds: [stable.id],
    ownedRuleIds: [stable.id],
    triedRuleIds: [stable.id],
    rejectedRuleIds: [hairColor.id],
    suppressedFamilies: [stable.family]
  });
  const adjustedStable = adjusted.find(({ id }) => id === stable.id);
  const adjustedHair = adjusted.find(({ id }) => id === hairColor.id);

  assert.equal(adjustedStable.priority, stable.priority + 30 + 20 + 10 - 200);
  assert.equal(adjustedHair.priority, hairColor.priority - 80);
  assert.deepEqual(
    { ...adjustedStable, priority: stable.priority },
    stable
  );
  assert.deepEqual(
    { ...adjustedHair, priority: hairColor.priority },
    hairColor
  );
  assert.deepEqual(rules.find(({ id }) => id === stable.id), stable);
});

test('missing feedback leaves priorities and ordering unchanged', () => {
  const rules = resolver.resolveRules(profile(), { now: NOW });

  assert.deepEqual(adjuster.applyFeedbackScores(rules), rules);
});
