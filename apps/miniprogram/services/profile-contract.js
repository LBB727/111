const { APPEARANCE_VALUES, COLOR_CALIBRATION_VALUES } = require('../config/appearance-options');
const { PREFERENCE_VALUES } = require('../config/preference-options');

const MANUAL_PROVENANCE = Object.freeze({ source: 'manual', userConfirmed: true });
const FEEDBACK_FIELDS = Object.freeze([
  'likedRuleIds', 'rejectedRuleIds', 'ownedRuleIds', 'triedRuleIds', 'suppressedFamilies'
]);
const MEASUREMENT_LIMITS = Object.freeze({
  heightCm: Object.freeze([80, 230]),
  shoulderCm: Object.freeze([0, 180]),
  bustCm: Object.freeze([0, 180]),
  waistCm: Object.freeze([0, 180]),
  hipCm: Object.freeze([0, 180]),
  inseamCm: Object.freeze([0, 130])
});

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function normalizeChoiceList(value, allowed, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  const selected = new Set(value.filter((item) => allowed.includes(item)));
  return allowed.filter((item) => selected.has(item));
}

function normalizeFeedbackList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === 'string' && item.trim()))].sort();
}

function createDefaultAppearance() {
  const appearance = {};
  for (const field of Object.keys(APPEARANCE_VALUES)) appearance[field] = 'unknown';
  appearance.colorCalibration = {};
  for (const field of Object.keys(COLOR_CALIBRATION_VALUES)) appearance.colorCalibration[field] = 'unknown';
  appearance.provenance = {};
  return appearance;
}

function createManualAppearanceDraft(profileDraft = {}) {
  void profileDraft;
  return createDefaultAppearance();
}

function createDefaultPreferences() {
  return {
    presentationMode: 'neutral',
    scenes: ['commute'],
    cityOrClimateText: '',
    activityContext: ['indoor'],
    desiredEffects: ['clean'],
    fitPreference: 'regular',
    comfortNeeds: [],
    stylingTimeMinutes: 10,
    stylePreferences: ['minimal'],
    hairColorPreference: {
      currentColor: 'unknown',
      willingness: 'no-dye',
      acceptsBleach: 'no',
      maintenanceLevel: 'low',
      workplaceRestriction: 'unknown'
    },
    budgetBand: 'moderate',
    makeupPreference: 'light',
    lockedAreas: [],
    manualMeasurements: null,
    trendEnabled: false
  };
}

function normalizeAppearance(value) {
  const source = isRecord(value) ? value : {};
  const normalized = createDefaultAppearance();

  for (const [field, allowed] of Object.entries(APPEARANCE_VALUES)) {
    const next = normalizeEnum(source[field], allowed, 'unknown');
    normalized[field] = next;
    if (next !== 'unknown') normalized.provenance[field] = { ...MANUAL_PROVENANCE };
  }

  const calibration = isRecord(source.colorCalibration) ? source.colorCalibration : {};
  for (const [field, allowed] of Object.entries(COLOR_CALIBRATION_VALUES)) {
    const next = normalizeEnum(calibration[field], allowed, 'unknown');
    normalized.colorCalibration[field] = next;
    if (next !== 'unknown') normalized.provenance.colorCalibration = { ...MANUAL_PROVENANCE };
  }

  return normalized;
}

function confirmAppearance(draft) {
  return normalizeAppearance(draft);
}

function normalizeMeasurements(value) {
  if (!isRecord(value)) return null;
  const normalized = {};
  for (const [field, [minimum, maximum]] of Object.entries(MEASUREMENT_LIMITS)) {
    if (Number.isFinite(value[field]) && value[field] >= minimum && value[field] <= maximum) {
      normalized[field] = value[field];
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function normalizePreferences(value) {
  const source = isRecord(value) ? value : {};
  const defaults = createDefaultPreferences();
  const hairColor = isRecord(source.hairColorPreference) ? source.hairColorPreference : {};

  return {
    presentationMode: normalizeEnum(source.presentationMode, PREFERENCE_VALUES.presentationMode, defaults.presentationMode),
    scenes: normalizeChoiceList(source.scenes, PREFERENCE_VALUES.scene, defaults.scenes),
    cityOrClimateText: typeof source.cityOrClimateText === 'string'
      ? source.cityOrClimateText.trim().slice(0, 40)
      : defaults.cityOrClimateText,
    activityContext: normalizeChoiceList(source.activityContext, PREFERENCE_VALUES.activityContext, defaults.activityContext),
    desiredEffects: normalizeChoiceList(source.desiredEffects, PREFERENCE_VALUES.desiredEffects, defaults.desiredEffects),
    fitPreference: normalizeEnum(source.fitPreference, PREFERENCE_VALUES.fitPreference, defaults.fitPreference),
    comfortNeeds: normalizeChoiceList(source.comfortNeeds, PREFERENCE_VALUES.comfortNeeds, defaults.comfortNeeds),
    stylingTimeMinutes: normalizeEnum(source.stylingTimeMinutes, PREFERENCE_VALUES.stylingTimeMinutes, defaults.stylingTimeMinutes),
    stylePreferences: normalizeChoiceList(source.stylePreferences, PREFERENCE_VALUES.stylePreferences, defaults.stylePreferences),
    hairColorPreference: {
      currentColor: normalizeEnum(hairColor.currentColor, PREFERENCE_VALUES.currentHairColor, defaults.hairColorPreference.currentColor),
      willingness: normalizeEnum(hairColor.willingness, PREFERENCE_VALUES.hairColorWillingness, defaults.hairColorPreference.willingness),
      acceptsBleach: normalizeEnum(hairColor.acceptsBleach, PREFERENCE_VALUES.acceptsBleach, defaults.hairColorPreference.acceptsBleach),
      maintenanceLevel: normalizeEnum(hairColor.maintenanceLevel, PREFERENCE_VALUES.maintenanceLevel, defaults.hairColorPreference.maintenanceLevel),
      workplaceRestriction: normalizeEnum(hairColor.workplaceRestriction, PREFERENCE_VALUES.workplaceRestriction, defaults.hairColorPreference.workplaceRestriction)
    },
    budgetBand: normalizeEnum(source.budgetBand, PREFERENCE_VALUES.budgetBand, defaults.budgetBand),
    makeupPreference: normalizeEnum(source.makeupPreference, PREFERENCE_VALUES.makeupPreference, defaults.makeupPreference),
    lockedAreas: normalizeChoiceList(source.lockedAreas, PREFERENCE_VALUES.lockedAreas, defaults.lockedAreas),
    manualMeasurements: normalizeMeasurements(source.manualMeasurements),
    trendEnabled: typeof source.trendEnabled === 'boolean' ? source.trendEnabled : defaults.trendEnabled
  };
}

function buildStyleProfile({ analysisMode, appearance, preferences, feedbackSummary } = {}) {
  const normalizedPreferences = normalizePreferences(preferences);
  const normalizedFeedback = {};
  const feedback = isRecord(feedbackSummary) ? feedbackSummary : {};
  for (const field of FEEDBACK_FIELDS) normalizedFeedback[field] = normalizeFeedbackList(feedback[field]);

  return {
    schemaVersion: 2,
    analysisMode: analysisMode === 'photo' ? 'photo' : 'manual',
    ...normalizedPreferences,
    confirmedAppearance: normalizeAppearance(appearance),
    feedbackSummary: normalizedFeedback
  };
}

module.exports = {
  createDefaultAppearance,
  createManualAppearanceDraft,
  confirmAppearance,
  createDefaultPreferences,
  normalizeAppearance,
  normalizePreferences,
  buildStyleProfile,
  MEASUREMENT_LIMITS
};
