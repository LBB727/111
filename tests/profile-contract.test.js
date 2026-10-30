const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createDefaultAppearance,
  createDefaultPreferences,
  normalizeAppearance,
  normalizePreferences,
  buildStyleProfile
} = require('../apps/miniprogram/services/profile-contract');

test('manual defaults are complete and uncertainty-safe', () => {
  const appearance = createDefaultAppearance();
  assert.equal(appearance.lineQuality, 'unknown');
  assert.equal(appearance.faceOutline, 'unknown');
  assert.equal(appearance.visibleHairColorFamily, 'unknown');
  assert.deepEqual(appearance.colorCalibration, {
    whiteChoice: 'unknown',
    neutralChoice: 'unknown',
    accentChoice: 'unknown'
  });
});

test('profile keeps chosen expression and never derives it from appearance', () => {
  const preferences = {
    ...createDefaultPreferences(),
    presentationMode: 'mixed',
    scenes: ['date']
  };
  const profile = buildStyleProfile({
    analysisMode: 'manual',
    appearance: createDefaultAppearance(),
    preferences,
    feedbackSummary: {}
  });
  assert.equal(profile.presentationMode, 'mixed');
  assert.equal(profile.confirmedAppearance.faceOutline, 'unknown');
  assert.equal(profile.analysisMode, 'manual');
});

test('normalization canonicalizes selection lists without forging invalid choices', () => {
  const preferences = normalizePreferences({
    scenes: ['travel', 'commute', 'travel', 'not-a-scene'],
    desiredEffects: ['mobility', 'clean', 'mobility'],
    stylePreferences: ['not-a-style'],
    cityOrClimateText: `  ${'a'.repeat(45)}  `,
    manualMeasurements: { heightCm: 170, waistCm: 181, inseamCm: 80 }
  });
  const appearance = normalizeAppearance({
    faceOutline: 'round',
    valueContrast: 'not-an-option',
    colorCalibration: { whiteChoice: 'ivory', accentChoice: 'invalid' }
  });

  assert.deepEqual(preferences.scenes, ['commute', 'travel']);
  assert.deepEqual(preferences.desiredEffects, ['clean', 'mobility']);
  assert.deepEqual(preferences.stylePreferences, []);
  assert.equal(preferences.cityOrClimateText, 'a'.repeat(40));
  assert.deepEqual(preferences.manualMeasurements, { heightCm: 170, inseamCm: 80 });
  assert.equal(appearance.faceOutline, 'round');
  assert.equal(appearance.valueContrast, 'unknown');
  assert.equal(appearance.colorCalibration.accentChoice, 'unknown');
  assert.deepEqual(appearance.provenance.faceOutline, { source: 'manual', userConfirmed: true });
});
