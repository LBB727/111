const test = require('node:test');
const assert = require('node:assert/strict');

const { validateConsent, validateAppearance, validatePreferences, validateConfirmedFeatures } = require('../apps/miniprogram/utils/validators');
const { inspectPhoto } = require('../apps/miniprogram/services/photo-quality');
const { PHOTO_LIMITS } = require('../apps/miniprogram/config/constants');
const {
  createDefaultAppearance,
  createDefaultPreferences,
  createManualAppearanceDraft,
  confirmAppearance
} = require('../apps/miniprogram/services/profile-contract');

test('photo inspection reports only deterministic file facts', () => {
  const result = inspectPhoto({
    decoded: true,
    width: 1080,
    height: 1440,
    size: 1200000,
    type: 'image/jpeg'
  });

  assert.deepEqual(result.checks.map((item) => item.key), [
    'decode', 'resolution', 'aspect', 'size', 'format'
  ]);
  assert.ok(result.checks.every((item) => item.simulated !== true));
  assert.equal(Object.hasOwn(result, 'featureDraft'), false);
});

test('photo inspection requires an explicit successful decode outcome', () => {
  const result = inspectPhoto({
    width: 1080,
    height: 1440,
    size: 1200000,
    type: 'image/jpeg'
  });

  assert.equal(result.passed, false);
  assert.equal(result.checks.find((item) => item.key === 'decode').status, 'fail');
  assert.equal(result.issues[0].key, 'decode');
});

test('manual appearance confirmation keeps unknown defaults and marks selections as manual', () => {
  const draft = createManualAppearanceDraft({ presentationMode: 'neutral' });
  draft.lineQuality = 'sharp';
  draft.colorCalibration.whiteChoice = 'ivory';

  const confirmed = confirmAppearance(draft);

  assert.equal(confirmed.lineQuality, 'sharp');
  assert.equal(confirmed.faceOutline, 'unknown');
  assert.equal(confirmed.colorCalibration.whiteChoice, 'ivory');
  assert.deepEqual(confirmed.provenance.lineQuality, { source: 'manual', userConfirmed: true });
  assert.deepEqual(confirmed.provenance.colorCalibration, { source: 'manual', userConfirmed: true });
  assert.equal(confirmed.provenance.faceOutline, undefined);
});

test('processing accepts a complete manually confirmed V2 appearance', () => {
  const confirmed = confirmAppearance({
    ...createManualAppearanceDraft(),
    visualScale: 'strong'
  });

  assert.deepEqual(validateConfirmedFeatures(confirmed), { valid: true });
});

test('undersized images are rejected with a concrete issue', () => {
  const result = inspectPhoto({
    decoded: true,
    width: 320,
    height: 320,
    size: 200000,
    type: 'image/jpeg'
  });

  assert.equal(result.passed, false);
  assert.equal(result.issues[0].key, 'resolution');
});

test('photo inspection rejects failed decoding, invalid aspect ratios, oversized files, and unsupported formats', () => {
  const result = inspectPhoto({
    decoded: false,
    width: 1200,
    height: 400,
    size: 11 * 1024 * 1024,
    type: 'image/gif'
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.issues.map((issue) => issue.key), ['decode', 'resolution', 'aspect', 'size', 'format']);
});

test('photo size issue follows injected frozen limits without mutating defaults', () => {
  const limits = Object.freeze({ ...PHOTO_LIMITS, maxBytes: 2 * 1024 * 1024 });
  const result = inspectPhoto({
    decoded: true,
    width: 1080,
    height: 1440,
    size: 11 * 1024 * 1024,
    type: 'image/jpeg'
  }, limits);

  assert.equal(result.issues.find((issue) => issue.key === 'size').key, 'size');
  assert.equal(Object.isFrozen(PHOTO_LIMITS), true);
});

test('consent requires every explicit local-processing confirmation', () => {
  assert.equal(validateConsent({ adult: true, ownPhoto: true, photoProcessing: true }).valid, true);
  assert.equal(validateConsent({ adult: true, ownPhoto: false, photoProcessing: true }).valid, false);
});

test('v2 validators reject invalid enums and measurements', () => {
  const appearance = validateAppearance({ ...createDefaultAppearance(), lineQuality: 'blurred' });
  const preferences = validatePreferences({
    ...createDefaultPreferences(),
    presentationMode: 'other',
    manualMeasurements: { heightCm: 250, waistCm: 70 }
  });

  assert.equal(appearance.valid, false);
  assert.ok(appearance.errors.lineQuality);
  assert.equal(preferences.valid, false);
  assert.ok(preferences.errors.presentationMode);
  assert.ok(preferences.errors['manualMeasurements.heightCm']);
});

test('style preferences accept an omitted city or climate note', () => {
  const results = ['', '   '].map((cityOrClimateText) => (
    validatePreferences({
      ...createDefaultPreferences(),
      cityOrClimateText
    })
  ));

  assert.deepEqual(results.map((result) => result.valid), [true, true]);
});

test('style preferences reject a city or climate note longer than 40 characters', () => {
  const result = validatePreferences({
    ...createDefaultPreferences(),
    cityOrClimateText: '城'.repeat(41)
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.cityOrClimateText);
});

test('complete style preferences require selected scenes, effects, valid fit, time, and hair-color fields', () => {
  const validForm = {
    presentationMode: 'neutral',
    scenes: ['commute'],
    cityOrClimateText: '上海，夏季湿热',
    activityContext: ['indoor', 'longWalk'],
    desiredEffects: ['clean', 'vertical'],
    fitPreference: 'regular',
    comfortNeeds: ['breathable'],
    stylingTimeMinutes: 10,
    stylePreferences: ['minimal'],
    hairColorPreference: {
      currentColor: 'naturalBlack',
      willingness: 'no-dye',
      acceptsBleach: 'no',
      maintenanceLevel: 'low',
      workplaceRestriction: 'conservative'
    },
    budgetBand: 'moderate',
    makeupPreference: 'none',
    lockedAreas: ['hairLength'],
    manualMeasurements: null,
    trendEnabled: false
  };

  assert.equal(validatePreferences(validForm).valid, true);

  const invalid = validatePreferences({
    ...validForm,
    scenes: [],
    desiredEffects: [],
    fitPreference: 'loose',
    stylingTimeMinutes: 15,
    hairColorPreference: { ...validForm.hairColorPreference, currentColor: undefined }
  });

  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.scenes);
  assert.ok(invalid.errors.desiredEffects);
  assert.ok(invalid.errors.fitPreference);
  assert.ok(invalid.errors.stylingTimeMinutes);
  assert.ok(invalid.errors['hairColorPreference.currentColor']);
});
