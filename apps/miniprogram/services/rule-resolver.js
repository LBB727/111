const { STYLE_RULES_V2 } = require('../data/style-rules-v2');
const { TREND_RULES, isTrendRuleActive } = require('../data/trend-rules');
const { SCENE_RULES } = require('../data/scene-rules');
const { HAIR_COLOR_RULES } = require('../data/hair-color-rules');

const PRIORITY = Object.freeze({
  request_context: 1000,
  user_preference: 800,
  confirmed_appearance: 600,
  market_norm: 400,
  stable: 300,
  seasonal_trend: 100
});
const CURRENT_HAIR_COLOR_MATCHES = Object.freeze({
  naturalBlack: Object.freeze(['naturalBlack', 'softBlack', 'blackTea']),
  deepBrown: Object.freeze(['deepTeaBrown', 'blackTea', 'chocolateBrown']),
  mediumBrown: Object.freeze(['chestnutBrown', 'chocolateBrown', 'coolBrown']),
  lightBrown: Object.freeze(['caramelBrown', 'milkTeaBrown', 'ashBrown']),
  redBrown: Object.freeze(['redBrown', 'burgundyBrown', 'chestnutBrown']),
  copper: Object.freeze(['copperBrown', 'caramelBrown', 'redBrown']),
  coolBrown: Object.freeze(['coolBrown', 'ashBrown', 'deepOliveBrown']),
  blueBlack: Object.freeze(['blueBlack', 'softBlack', 'naturalBlack'])
});
const VISIBLE_HAIR_COLOR_MATCHES = Object.freeze({
  black: CURRENT_HAIR_COLOR_MATCHES.naturalBlack,
  deepBrown: CURRENT_HAIR_COLOR_MATCHES.deepBrown,
  mediumBrown: CURRENT_HAIR_COLOR_MATCHES.mediumBrown,
  lightBrown: CURRENT_HAIR_COLOR_MATCHES.lightBrown,
  redBrown: CURRENT_HAIR_COLOR_MATCHES.redBrown,
  copper: CURRENT_HAIR_COLOR_MATCHES.copper,
  coolBrown: CURRENT_HAIR_COLOR_MATCHES.coolBrown,
  blueBlack: CURRENT_HAIR_COLOR_MATCHES.blueBlack
});
const HAIR_COLOR_SCALE = Object.freeze({
  light: Object.freeze([
    'softBlack', 'blackTea', 'ashBrown', 'milkTeaBrown', 'roseBrown',
    'caramelBrown'
  ]),
  medium: Object.freeze([
    'naturalBlack', 'deepTeaBrown', 'chocolateBrown', 'chestnutBrown',
    'coolBrown', 'deepOliveBrown'
  ]),
  strong: Object.freeze([
    'blueBlack', 'copperBrown', 'redBrown', 'burgundyBrown',
    'smokyPurpleBrown'
  ])
});
const SAFE_RULE_RUNTIME_FIELDS = Object.freeze([
  'ruleId',
  'scene',
  'recommendation',
  'techniques',
  'intendedVisualEffect',
  'alternative',
  'confidence',
  'extractionBoundary',
  'expiresOn'
]);

const PREFERENCE_RULE_IDENTITIES = Object.freeze({
  makeupNone: Object.freeze({
    id: 'preference-makeup-none',
    family: 'makeup'
  }),
  hairNoDye: Object.freeze({
    id: 'preference-hair-no-dye',
    family: 'hairColor'
  }),
  locks: Object.freeze({
    hairLength: Object.freeze({
      id: 'preference-lock-hairLength',
      family: 'hair'
    }),
    hairColor: Object.freeze({
      id: 'preference-lock-hairColor',
      family: 'hairColor'
    }),
    glasses: Object.freeze({
      id: 'preference-lock-glasses',
      family: 'accessories'
    }),
    makeup: Object.freeze({
      id: 'preference-lock-makeup',
      family: 'makeup'
    }),
    fit: Object.freeze({
      id: 'preference-lock-fit',
      family: 'clothing'
    })
  })
});
const APPEARANCE_HAIR_IDENTITY = Object.freeze({
  id: 'appearance-confirmed-hair',
  family: 'hair'
});

function contextRuleIdentity(candidate) {
  return {
    id: `context-${candidate.id}-requirements`,
    family: 'sceneTransition'
  };
}

function hairColorRuleIdentity(candidate) {
  return {
    id: `hair-color-${candidate.id}`,
    family: 'hairColor'
  };
}

const APPROVED_RULE_FAMILIES = new Map([
  ...SCENE_RULES.map(contextRuleIdentity),
  PREFERENCE_RULE_IDENTITIES.makeupNone,
  PREFERENCE_RULE_IDENTITIES.hairNoDye,
  ...Object.values(PREFERENCE_RULE_IDENTITIES.locks),
  APPEARANCE_HAIR_IDENTITY,
  ...HAIR_COLOR_RULES.map(hairColorRuleIdentity),
  ...STYLE_RULES_V2.map(({ ruleId }) => ({
    id: ruleId,
    family: 'clothing'
  })),
  ...TREND_RULES.map(({ ruleId }) => ({
    id: ruleId,
    family: 'clothing'
  }))
].map(({ id, family }) => [id, family]));

function isApprovedRuleIdentity(id, family) {
  return APPROVED_RULE_FAMILIES.get(id) === family;
}

function valueAtPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

function isPresent(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}

function predicateMatches(profile, predicate) {
  const value = valueAtPath(profile, predicate.path);
  if (Object.hasOwn(predicate, 'includes')) {
    return Array.isArray(value) && value.includes(predicate.includes);
  }
  if (Object.hasOwn(predicate, 'equals')) return value === predicate.equals;
  return predicate.isPresent === true && isPresent(value);
}

function stableRuleMatches(profile, rule) {
  return (
    rule.scene.some((scene) => profile.scenes.includes(scene))
    && rule.requiredInputs.every((path) => isPresent(valueAtPath(profile, path)))
    && rule.confirmedInputs.every((predicate) => predicateMatches(profile, predicate))
  );
}

function hasStrictFormalRequirement(profile) {
  return (
    profile.scenes.includes('formal')
    && (
      profile.activityContext.includes('formalReception')
      || profile.hairColorPreference.workplaceRestriction === 'conservative'
    )
  );
}

function conflictsWithHardConstraints(profile, candidate, layer) {
  if (layer === 'seasonal_trend' && hasStrictFormalRequirement(profile)) {
    return true;
  }
  if (
    profile.lockedAreas.includes('fit')
    && (
      candidate.recommendation?.garmentTemplateIds?.length > 0
      || candidate.techniques?.silhouetteIds?.length > 0
    )
  ) {
    return true;
  }
  return false;
}

function resolved(id, family, layer, candidate, metadata = {}) {
  return Object.freeze({
    id,
    family,
    layer,
    priority: PRIORITY[layer],
    candidate,
    ...metadata
  });
}

function projectSafeRuleCandidate(candidate) {
  return Object.freeze(Object.fromEntries(
    SAFE_RULE_RUNTIME_FIELDS
      .filter((field) => Object.hasOwn(candidate, field))
      .map((field) => [field, candidate[field]])
  ));
}

function contextRules(profile) {
  return SCENE_RULES
    .filter(({ id }) => profile.scenes.includes(id))
    .map((candidate) => {
      const identity = contextRuleIdentity(candidate);
      return resolved(
        identity.id,
        identity.family,
        'request_context',
        candidate
      );
    });
}

function preferenceRules(profile) {
  const rules = [];
  if (profile.makeupPreference === 'none') {
    const identity = PREFERENCE_RULE_IDENTITIES.makeupNone;
    rules.push(resolved(
      identity.id,
      identity.family,
      'user_preference',
      Object.freeze({ skippable: true })
    ));
  }
  if (
    profile.hairColorPreference.willingness === 'no-dye'
    || profile.lockedAreas.includes('hairColor')
  ) {
    const identity = PREFERENCE_RULE_IDENTITIES.hairNoDye;
    rules.push(resolved(
      identity.id,
      identity.family,
      'user_preference',
      Object.freeze({ noDye: true })
    ));
  }
  for (const area of profile.lockedAreas) {
    const identity = PREFERENCE_RULE_IDENTITIES.locks[area];
    if (identity) {
      rules.push(resolved(
        identity.id,
        identity.family,
        'user_preference',
        Object.freeze({ lockedArea: area })
      ));
    }
  }
  return rules;
}

function appearanceRules(profile) {
  const appearance = profile.confirmedAppearance || {};
  const knownHairFields = ['hairLength', 'hairTexture', 'visibleHairVolume'];
  if (!knownHairFields.some((field) => appearance[field] !== 'unknown')) return [];
  return [resolved(
    APPEARANCE_HAIR_IDENTITY.id,
    APPEARANCE_HAIR_IDENTITY.family,
    'confirmed_appearance',
    appearance
  )];
}

function stableRules(profile) {
  return STYLE_RULES_V2
    .filter((rule) => stableRuleMatches(profile, rule))
    .filter((rule) => !conflictsWithHardConstraints(profile, rule, 'stable'))
    .map((candidate) => resolved(
      candidate.ruleId,
      'clothing',
      'stable',
      projectSafeRuleCandidate(candidate)
    ));
}

function calibrationDirection(calibration = {}) {
  const warm = [
    calibration.whiteChoice === 'ivory',
    calibration.neutralChoice === 'warmBrown',
    calibration.accentChoice === 'brickRed'
  ].filter(Boolean).length;
  const cool = [
    calibration.whiteChoice === 'pureWhite',
    calibration.neutralChoice === 'coolGray',
    calibration.accentChoice === 'berry'
  ].filter(Boolean).length;
  if (warm > cool) return 'warm';
  if (cool > warm) return 'cool';
  return 'neutral';
}

function candidateTemperature(candidate) {
  if (candidate.temperature.toLowerCase().includes('warm')) return 'warm';
  if (candidate.temperature.toLowerCase().includes('cool')) return 'cool';
  return 'neutral';
}

function candidateLevel(candidate) {
  const values = String(candidate.level).match(/\d+/g)?.map(Number) || [3];
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function orderedMatchScore(candidateId, matches, exactScore, relatedScore) {
  const index = matches.indexOf(candidateId);
  if (index === 0) return exactScore;
  return index > 0 ? Math.max(relatedScore - ((index - 1) * 4), 0) : 0;
}

function contrastScore(candidate, contrast) {
  const ideal = { low: 6, medium: 4, high: 2 }[contrast];
  if (!ideal) return 0;
  return Math.max(12 - Math.round(Math.abs(candidateLevel(candidate) - ideal) * 4), 0);
}

function hairColorMatchScore(profile, candidate) {
  const preference = profile.hairColorPreference;
  const appearance = profile.confirmedAppearance || {};
  const currentMatches = CURRENT_HAIR_COLOR_MATCHES[preference.currentColor] || [];
  const visibleMatches = VISIBLE_HAIR_COLOR_MATCHES[
    appearance.visibleHairColorFamily
  ] || [];
  const direction = calibrationDirection(appearance.colorCalibration);
  const temperature = candidateTemperature(candidate);
  let score = 0;

  score += orderedMatchScore(candidate.id, currentMatches, 80, 36);
  score += orderedMatchScore(candidate.id, visibleMatches, 60, 28);
  if (direction !== 'neutral') {
    score += temperature === direction ? 20 : temperature === 'neutral' ? 6 : 0;
  }
  score += contrastScore(candidate, appearance.valueContrast);
  if (HAIR_COLOR_SCALE[appearance.visualScale]?.includes(candidate.id)) {
    score += 10;
  }
  if (candidate.maintenanceLevel === preference.maintenanceLevel) score += 6;
  if (
    preference.willingness === 'no-dye'
    || profile.lockedAreas.includes('hairColor')
  ) {
    if (candidate.id === 'blackTea') score += 200;
    else if (candidate.id === 'naturalBlack') score += 100;
  }
  return score;
}

function hairColorRules(profile) {
  const preference = profile.hairColorPreference;
  const maintenanceRank = { low: 0, medium: 1, high: 2 };
  return HAIR_COLOR_RULES
    .map((candidate, catalogOrder) => ({ candidate, catalogOrder }))
    .filter(({ candidate }) => (
      candidate.scenes.some((scene) => profile.scenes.includes(scene))
    ))
    .filter(({ candidate }) => (
      preference.acceptsBleach !== 'no'
      || (
        candidate.highLightnessDependent !== true
        && candidate.bleachExpectation !== 'possible'
      )
    ))
    .filter(({ candidate }) => (
      preference.workplaceRestriction !== 'conservative'
      || candidate.priorityWhenWorkRestrictionUnknown === true
    ))
    .filter(({ candidate }) => (
      maintenanceRank[candidate.maintenanceLevel]
      <= maintenanceRank[preference.maintenanceLevel]
    ))
    .map(({ candidate, catalogOrder }) => {
      const identity = hairColorRuleIdentity(candidate);
      return resolved(
        identity.id,
        identity.family,
        'market_norm',
        candidate,
        {
          matchScore: hairColorMatchScore(profile, candidate),
          catalogOrder,
          workRestrictionPriority: (
            preference.workplaceRestriction === 'unknown'
            && candidate.priorityWhenWorkRestrictionUnknown === true
          )
        }
      );
    });
}

function trendRules(profile, now) {
  if (profile.trendEnabled !== true) return [];
  const referenceDate = now.slice(0, 10);
  return TREND_RULES
    .filter((rule) => (
      rule.scene.some((scene) => profile.scenes.includes(scene))
      && isTrendRuleActive(rule, referenceDate)
    ))
    .filter((rule) => !conflictsWithHardConstraints(
      profile,
      rule,
      'seasonal_trend'
    ))
    .map((candidate) => resolved(
      candidate.ruleId,
      'clothing',
      'seasonal_trend',
      projectSafeRuleCandidate(candidate)
    ));
}

function compareRules(first, second) {
  const priorityDifference = second.priority - first.priority;
  if (priorityDifference !== 0) return priorityDifference;
  if (
    first.family === 'hairColor'
    && second.family === 'hairColor'
    && Number.isFinite(first.matchScore)
    && Number.isFinite(second.matchScore)
  ) {
    return (
      Number(second.workRestrictionPriority)
        - Number(first.workRestrictionPriority)
      || second.matchScore - first.matchScore
      || first.catalogOrder - second.catalogOrder
    );
  }
  return first.id.localeCompare(second.id);
}

function resolveRules(profile, { now } = {}) {
  if (!profile || profile.schemaVersion !== 2) return [];
  const generatedAt = new Date(now || Date.now()).toISOString();
  return [
    ...contextRules(profile),
    ...preferenceRules(profile),
    ...appearanceRules(profile),
    ...hairColorRules(profile),
    ...stableRules(profile),
    ...trendRules(profile, generatedAt)
  ].sort(compareRules);
}

module.exports = {
  PRIORITY,
  compareRules,
  isApprovedRuleIdentity,
  resolveRules
};
