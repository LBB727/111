const { RULE_SET_VERSION, SECTION_KEYS } = require('./recommendation-engine');
const { isApprovedRuleIdentity } = require('./rule-resolver');
const { STORAGE_KEYS } = require('../config/storage-keys');
const { GARMENT_TEMPLATES } = require('../data/garment-taxonomy');
const { COLOR_PALETTE } = require('../data/color-palette');
const { HAIR_COLOR_RULES } = require('../data/hair-color-rules');

const VISIBLE_FIELDS = Object.freeze([
  'id', 'family', 'action', 'reason', 'alternative', 'sceneFit'
]);
const GARMENT_FIELDS = Object.freeze([
  'necklineOrCollar', 'shoulderConstruction', 'waistPlacement', 'length',
  'sleeveLength', 'trouserRise', 'legShape', 'skirtShape', 'ease',
  'materialAppearance'
]);
const HAIR_COLOR_FIELDS = Object.freeze([
  'colorName', 'colorFamily', 'depthBand', 'toneDirection', 'applicationStyle',
  'bleachExpectation', 'maintenanceLevel', 'fadeDirection', 'wardrobeColorLinks',
  'makeupAndAccessoryLinks', 'noDyeAlternative', 'trendValidUntil', 'safetyNote'
]);
const ROOT_FIELDS = Object.freeze([
  'schemaVersion', 'id', 'mode', 'generatedAt', 'ruleSetVersion',
  'confirmedBasis', 'topRecommendations', 'colorPlan', 'outfitPlan',
  'visualLayers', 'sections', 'alternatives', 'trendMeta'
]);
const BASIS_FIELDS = Object.freeze(['key', 'label', 'value', 'source']);
const VISIBLE_RESULT_FIELDS = Object.freeze([
  ...VISIBLE_FIELDS, 'confirmedBasis', 'priority'
]);
const COLOR_FIELDS = Object.freeze(['name', 'hex', 'percentage']);
const COLOR_PLAN_FIELDS = Object.freeze([
  'main', 'secondary', 'accent', 'nearFace', 'lowerBody', 'accessories',
  'alternatives', 'reason', 'screenColorDisclaimer'
]);
const OUTFIT_PLAN_FIELDS = Object.freeze([
  'title', 'itemIds', 'overallDisclaimer'
]);
const TREND_META_FIELDS = Object.freeze([
  'enabled', 'appliedRuleIds', 'validUntil'
]);
const SECTION_EXTRA_FIELDS = Object.freeze({
  clothing: Object.freeze([
    ...GARMENT_FIELDS, 'lowIntervention', 'traditionalElements',
    'garmentTemplateIds', 'appliedRuleIds'
  ]),
  hair: Object.freeze(['lowIntervention', 'appliedRuleIds']),
  hairColor: Object.freeze([
    ...HAIR_COLOR_FIELDS, 'lowIntervention', 'appliedRuleIds'
  ]),
  makeup: Object.freeze(['skippable', 'lowIntervention', 'appliedRuleIds']),
  accessories: Object.freeze(['lowIntervention', 'appliedRuleIds']),
  sceneTransition: Object.freeze(['appliedRuleIds'])
});
const FORBIDDEN_FIELDS = new Set([
  'photoPath', 'tempFilePath', 'previewPath', 'imagePath',
  'modelObservation', 'modelAnalysis', 'modelGenerated',
  'simulatedFeatures', 'confidenceScore', 'confidenceLabel'
]);
const BANNED_WORDS = Object.freeze([
  [26174, 30333], [26174, 30246], [36974, 32905], [33080, 22823],
  [33151, 30701], [40644, 30382], [32570, 38519], [26631, 20934, 33080],
  [39068, 20540], [24180, 36731, 21270, 20998, 25968], [19985],
  [26174, 32769], [24517, 39035, 36974, 20303], [36974, 19985]
].map((codePoints) => String.fromCodePoint(...codePoints)));
const FEEDBACK_STATES = Object.freeze([
  'liked', 'not-for-me', 'owned', 'tried', 'suppress-similar'
]);
const FEEDBACK_FAMILIES = Object.freeze([
  'color', 'clothing', 'hair', 'hairColor', 'makeup', 'accessories',
  'sceneTransition', 'unknown'
]);
const WRITABLE_FEEDBACK_FAMILIES = Object.freeze(
  FEEDBACK_FAMILIES.filter((family) => family !== 'unknown')
);
const FEEDBACK_SUMMARY_FIELDS = Object.freeze({
  liked: 'likedRuleIds',
  'not-for-me': 'rejectedRuleIds',
  owned: 'ownedRuleIds',
  tried: 'triedRuleIds'
});
const PENDING_REGENERATION_KIND = 'local-feedback-regeneration-v1';
const CONTROLLED_GARMENT_TEMPLATE_IDS = new Set(
  GARMENT_TEMPLATES.map(({ id }) => id)
);
const GARMENT_TEMPLATE_BY_ID = new Map(
  GARMENT_TEMPLATES.map((template) => [template.id, template])
);
const OVERALL_FIELDS = Object.freeze([
  'title', 'alt', 'assetPath', 'garmentTemplateIds', 'pieces', 'accent',
  'preserveCurrent', 'fitLocked', 'statusLabel', 'colorBlocks',
  'hairColorSwatch', 'focusLabel', 'disclaimer'
]);
const OVERALL_PIECE_FIELDS = Object.freeze([
  'id', 'templateId', 'name', 'silhouette', 'colorRole', 'colorName', 'hex'
]);
const OVERALL_ACCENT_FIELDS = Object.freeze([
  'colorRole', 'colorName', 'hex', 'label'
]);
const HAIR_SWATCH_FIELDS = Object.freeze([
  'name', 'hex', 'approximate'
]);
const CONTROLLED_OVERALL_ASSETS = new Set([
  '/assets/styling/overall-womenswear.svg',
  '/assets/styling/overall-menswear.svg',
  '/assets/styling/overall-neutral.svg',
  '/assets/styling/overall-mixed.svg'
]);
const OVERALL_SILHOUETTE_BY_TEMPLATE_ID = Object.freeze({
  singleBreastedBlazer: 'outer-short',
  straightTrousers: 'trousers-straight',
  wideStraightTrousers: 'trousers-wide',
  relaxedCardigan: 'outer-soft',
  columnMidiSkirt: 'skirt-column',
  aLineMidiSkirt: 'skirt-a-line',
  waistDefinedShirtDress: 'dress-a-line',
  longSingleBreastedCoat: 'outer-long',
  lightweightOvershirt: 'outer-soft',
  crewNeckKnitTop: 'top'
});
const CONTROLLED_HAIR_SWATCH_HEX_BY_NAME = Object.freeze({
  自然黑: '#171514',
  柔黑: '#211E1D',
  黑茶色: '#2C211C',
  深茶棕: '#3B261C',
  巧克力棕: '#4A2C20',
  栗棕: '#6A3828',
  焦糖棕: '#8B5A32',
  铜棕: '#8C4C2B',
  红棕: '#6C2F29',
  酒红棕: '#542631',
  冷棕: '#4A403B',
  灰棕: '#71645E',
  蓝黑: '#151A24',
  深橄榄棕: '#413D2F',
  奶茶棕: '#9A806C',
  玫瑰棕: '#86636A',
  烟熏紫棕: '#5D4A55',
  深棕: '#3B261C',
  中棕: '#6A3828',
  浅棕: '#9A806C',
  当前其他发色: '#8A8D88',
  '当前发色（未确认）': '#8A8D88'
});
const CONTROLLED_HAIR_SWATCH_NAMES = new Set([
  ...HAIR_COLOR_RULES.map(({ name }) => name),
  '深棕', '中棕', '浅棕', '当前其他发色', '当前发色（未确认）'
]);
const COLLAGE_ITEM_FIELDS = Object.freeze([
  'id', 'name', 'assetPath', 'colorName', 'hex', 'visualType',
  'fitKeywords', 'alternative'
]);
const TECHNICAL_ITEM_FIELDS = Object.freeze([
  'id', 'title', 'alt', 'assetPath', 'labels'
]);
const TECHNICAL_LABEL_FIELDS = Object.freeze(['key', 'label', 'value']);
const COLLAGE_VISUAL_TYPE_BY_ASSET = Object.freeze({
  '/assets/styling/item-top.svg': 'top',
  '/assets/styling/item-outerwear.svg': 'outerwear',
  '/assets/styling/item-trousers.svg': 'trousers',
  '/assets/styling/item-skirt.svg': 'skirt',
  '/assets/styling/item-dress.svg': 'dress',
  '/assets/styling/item-shoes.svg': 'shoes',
  '/assets/styling/item-bag.svg': 'bag'
});
const CONTROLLED_TECHNICAL_ASSETS = new Set([
  '/assets/styling/technical-jacket.svg',
  '/assets/styling/technical-trousers.svg',
  '/assets/styling/technical-skirt.svg',
  '/assets/styling/technical-dress.svg'
]);
const CONTROLLED_COLOR_HEXES_BY_NAME = new Map();
for (const { name, hex, reportHex } of COLOR_PALETTE) {
  const controlledHexes = CONTROLLED_COLOR_HEXES_BY_NAME.get(name)
    || new Set();
  controlledHexes.add(hex);
  if (reportHex) controlledHexes.add(reportHex);
  CONTROLLED_COLOR_HEXES_BY_NAME.set(name, controlledHexes);
}

function toggleFavorite(ids, recommendationId) {
  const favorites = Array.isArray(ids) ? ids : [];
  return favorites.includes(recommendationId)
    ? favorites.filter((id) => id !== recommendationId)
    : [...favorites, recommendationId];
}

function createPendingRegeneration(profile) {
  if (!profile || profile.schemaVersion !== 2) return null;
  return {
    kind: PENDING_REGENERATION_KIND,
    profile
  };
}

function pendingRegenerationProfile(value) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.kind !== PENDING_REGENERATION_KIND
    || Object.keys(value).length !== 2
    || !value.profile
    || value.profile.schemaVersion !== 2
  ) return null;
  return value.profile;
}

function isControlledRecommendationId(value) {
  return (
    typeof value === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value)
  );
}

function approvedAppliedRuleIds(recommendation) {
  if (
    !recommendation
    || !Array.isArray(recommendation.appliedRuleIds)
    || !recommendation.appliedRuleIds.every((id) => (
      isApprovedRuleIdentity(id, recommendation.family)
    ))
  ) return [];
  return recommendation.appliedRuleIds;
}

function hasApprovedAppliedRules(recommendation) {
  return approvedAppliedRuleIds(recommendation).length > 0;
}

function normalizedUpdateTime(value, fallback) {
  return (
    typeof value === 'string'
    && !Number.isNaN(Date.parse(value))
  ) ? value : fallback;
}

function normalizeFeedbackMap(feedbackMap, updatedAt = new Date().toISOString()) {
  if (!feedbackMap || typeof feedbackMap !== 'object' || Array.isArray(feedbackMap)) {
    return {};
  }

  const normalized = {};
  for (const [recommendationId, value] of Object.entries(feedbackMap)) {
    if (!isControlledRecommendationId(recommendationId)) continue;

    const legacyState = typeof value === 'string' ? value : '';
    const state = legacyState || value?.state;
    if (!FEEDBACK_STATES.includes(state)) continue;

    const storedId = typeof value === 'object'
      ? value?.recommendationId
      : recommendationId;
    if (storedId !== recommendationId) continue;

    const family = (
      typeof value === 'object'
      && FEEDBACK_FAMILIES.includes(value?.family)
    ) ? value.family : 'unknown';
    if (state === 'suppress-similar' && family === 'unknown') continue;
    if (
      family === 'unknown'
      && state !== 'tried'
      && state !== 'not-for-me'
    ) continue;

    normalized[recommendationId] = {
      recommendationId,
      family,
      state,
      updatedAt: normalizedUpdateTime(value?.updatedAt, updatedAt)
    };
  }
  return normalized;
}

function setFeedback(feedbackMap, recommendationId, state, family) {
  const normalized = normalizeFeedbackMap(feedbackMap);
  if (
    !isControlledRecommendationId(recommendationId)
    || !FEEDBACK_STATES.includes(state)
  ) {
    return normalized;
  }

  if (!WRITABLE_FEEDBACK_FAMILIES.includes(family)) return normalized;

  if (normalized[recommendationId]?.state === state) {
    const cancelled = { ...normalized };
    delete cancelled[recommendationId];
    return cancelled;
  }

  return {
    ...normalized,
    [recommendationId]: {
      recommendationId,
      family,
      state,
      updatedAt: new Date().toISOString()
    }
  };
}

function createFeedbackRecommendationRegistry(report) {
  const recommendations = new Map();
  const seenIds = new Set();
  if (
    !report?.sections
    || typeof report.sections !== 'object'
    || Array.isArray(report.sections)
  ) {
    return { valid: false, recommendations };
  }

  for (const [sectionKey, group] of Object.entries(report.sections)) {
    if (!SECTION_KEYS.includes(sectionKey) || !Array.isArray(group)) {
      return { valid: false, recommendations: new Map() };
    }
    for (const recommendation of group) {
      if (
        !isControlledRecommendationId(recommendation?.id)
        || recommendation.family !== sectionKey
        || seenIds.has(recommendation.id)
        || !Array.isArray(recommendation.appliedRuleIds)
        || !recommendation.appliedRuleIds.every((id) => (
          isApprovedRuleIdentity(id, recommendation.family)
        ))
      ) {
        return { valid: false, recommendations: new Map() };
      }
      seenIds.add(recommendation.id);
      if (recommendation.appliedRuleIds.length === 0) continue;
      recommendations.set(recommendation.id, recommendation);
    }
  }
  return { valid: true, recommendations };
}

function summarizeFeedback(feedbackMap, report) {
  const summary = {
    likedRuleIds: [],
    rejectedRuleIds: [],
    ownedRuleIds: [],
    triedRuleIds: [],
    suppressedFamilies: []
  };

  const registry = createFeedbackRecommendationRegistry(report);
  if (!registry.valid) return summary;
  const currentRecommendations = registry.recommendations;
  for (const record of Object.values(normalizeFeedbackMap(feedbackMap))) {
    const recommendation = currentRecommendations.get(record.recommendationId);
    if (!recommendation) continue;
    const appliedRuleIds = approvedAppliedRuleIds(recommendation);
    if (appliedRuleIds.length === 0) continue;
    if (record.state === 'suppress-similar') {
      if (!summary.suppressedFamilies.includes(recommendation.family)) {
        summary.suppressedFamilies.push(recommendation.family);
      }
      continue;
    }
    const field = FEEDBACK_SUMMARY_FIELDS[record.state];
    for (const ruleId of appliedRuleIds) {
      if (field && !summary[field].includes(ruleId)) {
        summary[field].push(ruleId);
      }
    }
  }
  return summary;
}

function expiryTimestamp(validUntil) {
  if (typeof validUntil !== 'string') return Number.NaN;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(validUntil);
  return Date.parse(dateOnly ? `${validUntil}T23:59:59.999Z` : validUntil);
}

function removeExpiredReport(storage, now) {
  if (
    !storage
    || typeof storage.get !== 'function'
    || typeof storage.remove !== 'function'
  ) {
    return { expired: false, removed: false };
  }
  const stored = storage.get(STORAGE_KEYS.REPORT, null);
  if (!stored?.ok) return { expired: false, removed: false };

  const trend = stored.value?.trendMeta;
  const nowTimestamp = Date.parse(
    now instanceof Date ? now.toISOString() : now
  );
  const expiresAt = expiryTimestamp(trend?.validUntil);
  const allAppliedTrendsExpired = (
    trend?.enabled === true
    && Array.isArray(trend.appliedRuleIds)
    && trend.appliedRuleIds.length > 0
    && Number.isFinite(nowTimestamp)
    && Number.isFinite(expiresAt)
    && nowTimestamp > expiresAt
  );
  if (!allAppliedTrendsExpired) {
    return { expired: false, removed: false };
  }

  const result = storage.remove(STORAGE_KEYS.REPORT);
  return { expired: true, removed: result?.ok === true };
}

function persistProfile(storage, profile) {
  if (!storage || typeof storage.set !== 'function') {
    return { ok: false };
  }
  return storage.set(STORAGE_KEYS.PROFILE, profile);
}

function persistReport(storage, report) {
  if (!storage || typeof storage.set !== 'function') {
    return { ok: false };
  }
  return storage.set(STORAGE_KEYS.REPORT, report);
}

function isNonemptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasUniqueIds(recommendations) {
  return new Set(recommendations.map(({ id }) => id)).size === recommendations.length;
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === expectedKeys.length
    && expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}

function isBasisItem(item) {
  return (
    hasExactKeys(item, BASIS_FIELDS)
    && BASIS_FIELDS.every((field) => isNonemptyString(item[field]))
  );
}

function isVisibleRecommendation(item, expectedFamily) {
  return Boolean(
    item
    && typeof item === 'object'
    && VISIBLE_FIELDS.every((field) => (
      field === 'sceneFit'
        ? Array.isArray(item.sceneFit) && item.sceneFit.length > 0
        : isNonemptyString(item[field])
    ))
    && (!expectedFamily || item.family === expectedFamily)
  );
}

function hasExpectedRecommendationShape(item, family) {
  const expectedKeys = family
    ? [...VISIBLE_RESULT_FIELDS, ...SECTION_EXTRA_FIELDS[family]]
    : VISIBLE_RESULT_FIELDS;
  return (
    hasExactKeys(item, expectedKeys)
    && Array.isArray(item.confirmedBasis)
    && item.confirmedBasis.length > 0
    && item.confirmedBasis.every(isBasisItem)
    && Number.isFinite(item.priority)
    && (
      !family
      || (
        Array.isArray(item.appliedRuleIds)
        && item.appliedRuleIds.every((id) => (
          isApprovedRuleIdentity(id, item.family)
        ))
      )
    )
  );
}

function hasCompleteGarment(item) {
  return (
    GARMENT_FIELDS.every((field) => isNonemptyString(item[field]))
    && hasControlledGarmentTemplateIds(item.garmentTemplateIds)
  );
}

function hasControlledGarmentTemplateIds(value) {
  return (
    Array.isArray(value)
    && value.length > 0
    && value.every((id) => (
      isNonemptyString(id) && CONTROLLED_GARMENT_TEMPLATE_IDS.has(id)
    ))
  );
}

function hasCompleteHairColor(item) {
  return HAIR_COLOR_FIELDS.every((field) => (
    field === 'trendValidUntil'
      ? item[field] === null || isNonemptyString(item[field])
      : ['wardrobeColorLinks', 'makeupAndAccessoryLinks'].includes(field)
        ? Array.isArray(item[field]) && item[field].length > 0
        : isNonemptyString(item[field])
  ));
}

function hasForbiddenContent(value) {
  if (typeof value === 'string') {
    const pathLike = (
      /(?:wxfile|file):\/\//i.test(value)
      || /(?:^|[\s("'`])(?:[A-Za-z]:[\\/]|\\\\)[^\s"'`]+/.test(value)
      || /(?:^|[\s("'`])\/(?:home|Users|tmp|var\/tmp|private\/tmp|mnt|data|storage|sdcard|opt|etc|root|usr|workspace)(?:\/|$)/i.test(value)
      || /%(?:TEMP|TMP)%[\\/]/i.test(value)
      || /(?:^|[\s("'`])(?:[^\\/\s"'`:]+[\\/])+(?:[^\\/\s"'`:]+\.)[A-Za-z0-9]{1,10}(?:$|[\s)"'`,.;!?，。；！？])/i.test(value)
      || /(?:^|[\s("'`])(?:\.{1,2}[\\/]|(?:images?|temp|tmp)[\\/])[^\s"'`]+\.(?:jpe?g|png|webp|gif|bmp|heic|avif)(?:$|[\s)"'`])/i.test(value)
    );
    return (
      BANNED_WORDS.some((word) => value.includes(word))
      || pathLike
    );
  }
  if (Array.isArray(value)) return value.some(hasForbiddenContent);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) => (
    FORBIDDEN_FIELDS.has(key) || hasForbiddenContent(nested)
  ));
}

function hasValidColorPlan(colorPlan) {
  if (!hasExactKeys(colorPlan, COLOR_PLAN_FIELDS)) return false;
  const roles = ['main', 'secondary', 'accent'].map((role) => colorPlan[role]);
  return (
    roles.every((color) => (
      hasExactKeys(color, COLOR_FIELDS)
      && isNonemptyString(color.name)
      && /^#[0-9A-F]{6}$/.test(color.hex)
      && Number.isInteger(color.percentage)
      && color.percentage > 0
    ))
    && roles.reduce((sum, { percentage }) => sum + percentage, 0) === 100
    && ['nearFace', 'lowerBody', 'accessories', 'alternatives'].every((field) => (
      Array.isArray(colorPlan[field])
      && colorPlan[field].every(isNonemptyString)
    ))
    && isNonemptyString(colorPlan.reason)
    && isNonemptyString(colorPlan.screenColorDisclaimer)
  );
}

function hasChineseText(value) {
  return isNonemptyString(value) && /[\u3400-\u9FFF]/.test(value);
}

function hasValidOverallColorBlocks(colorBlocks, colorPlan) {
  return (
    Array.isArray(colorBlocks)
    && colorBlocks.length === 3
    && colorBlocks.every((color, index) => (
      hasExactKeys(color, COLOR_FIELDS)
      && isNonemptyString(color.name)
      && /^#[0-9A-F]{6}$/.test(color.hex)
      && Number.isInteger(color.percentage)
      && ['main', 'secondary', 'accent'].some((role, roleIndex) => (
        roleIndex === index
        && color.name === colorPlan[role].name
        && color.hex === colorPlan[role].hex
        && color.percentage === colorPlan[role].percentage
      ))
    ))
  );
}

function hasValidOverallHairSwatch(swatch) {
  return (
    hasExactKeys(swatch, HAIR_SWATCH_FIELDS)
    && CONTROLLED_HAIR_SWATCH_NAMES.has(swatch.name)
    && Object.hasOwn(CONTROLLED_HAIR_SWATCH_HEX_BY_NAME, swatch.name)
    && swatch.hex === CONTROLLED_HAIR_SWATCH_HEX_BY_NAME[swatch.name]
    && swatch.approximate === true
  );
}

function kebabId(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function hasValidOverallPiece(piece, templateId, colorPlan) {
  const template = GARMENT_TEMPLATE_BY_ID.get(templateId);
  const silhouette = OVERALL_SILHOUETTE_BY_TEMPLATE_ID[templateId];
  const colorRole = template?.category === 'top' ? 'secondary' : 'main';
  const color = colorPlan?.[colorRole];
  return (
    hasExactKeys(piece, OVERALL_PIECE_FIELDS)
    && Boolean(template)
    && isNonemptyString(silhouette)
    && piece.id === `overall-piece-${kebabId(templateId)}`
    && piece.templateId === templateId
    && piece.name === template.name
    && piece.silhouette === silhouette
    && piece.colorRole === colorRole
    && piece.colorName === color?.name
    && piece.hex === color?.hex
  );
}

function hasValidOverallComposition(overall, colorPlan) {
  const templateIds = overall?.garmentTemplateIds;
  const pieces = overall?.pieces;
  if (
    !Array.isArray(templateIds)
    || templateIds.length < 1
    || templateIds.length > 3
    || new Set(templateIds).size !== templateIds.length
    || !templateIds.every((id) => CONTROLLED_GARMENT_TEMPLATE_IDS.has(id))
    || !Array.isArray(pieces)
    || typeof overall.preserveCurrent !== 'boolean'
    || typeof overall.fitLocked !== 'boolean'
  ) {
    return false;
  }

  const preserveCurrent = templateIds.includes('preserveCurrentGarments');
  if (overall.preserveCurrent !== preserveCurrent) return false;
  if (preserveCurrent) {
    if (templateIds.length !== 1 || pieces.length !== 0) return false;
  } else {
    if (
      overall.fitLocked
      || pieces.length !== templateIds.length
      || new Set(pieces.map((piece) => piece?.id)).size !== pieces.length
      || !pieces.every((piece, index) => (
        hasValidOverallPiece(piece, templateIds[index], colorPlan)
      ))
    ) {
      return false;
    }
  }

  const expectedStatus = preserveCurrent
    ? overall.fitLocked
      ? '版型已锁定 · 保留当前轮廓'
      : '低干预 · 保留当前轮廓'
    : '按最终单品构图';
  return overall.statusLabel === expectedStatus;
}

function hasValidOverallAccent(accent, colorPlan) {
  return (
    hasExactKeys(accent, OVERALL_ACCENT_FIELDS)
    && accent.colorRole === 'accent'
    && accent.colorName === colorPlan?.accent?.name
    && accent.hex === colorPlan?.accent?.hex
    && accent.label === '小面积点缀'
  );
}

function hasValidOverall(overall, colorPlan) {
  if (!hasExactKeys(overall, OVERALL_FIELDS)) return false;
  const expectedAlt = overall.preserveCurrent
    ? '低干预保留当前服装轮廓，仅展示可撤回的配色层次'
    : '无五官中性人物展示最终服装轮廓与配色比例';
  return (
    overall.title === '整体造型示意'
    && overall.alt === expectedAlt
    && CONTROLLED_OVERALL_ASSETS.has(overall.assetPath)
    && hasValidOverallComposition(overall, colorPlan)
    && hasValidOverallAccent(overall.accent, colorPlan)
    && hasValidOverallColorBlocks(overall.colorBlocks, colorPlan)
    && hasValidOverallHairSwatch(overall.hairColorSwatch)
    && hasChineseText(overall.focusLabel)
    && overall.disclaimer ===
      '整体与版型示意，不代表实际试穿、尺码或贴合效果。发色色块为屏幕近似参考。'
  );
}

function hasControlledPlanColor(item, colorPlan) {
  const controlledHexes = CONTROLLED_COLOR_HEXES_BY_NAME.get(
    item?.colorName
  );
  if (!controlledHexes?.has(item?.hex)) return false;
  return ['main', 'secondary', 'accent'].some((role) => (
    colorPlan?.[role]?.name === item.colorName
    && colorPlan[role].hex === item.hex
  ));
}

function isValidCollageItem(item, colorPlan) {
  const expectedVisualType = COLLAGE_VISUAL_TYPE_BY_ASSET[item?.assetPath];
  return (
    hasExactKeys(item, COLLAGE_ITEM_FIELDS)
    && isControlledRecommendationId(item.id)
    && isNonemptyString(item.name)
    && isNonemptyString(expectedVisualType)
    && item.visualType === expectedVisualType
    && hasControlledPlanColor(item, colorPlan)
    && Array.isArray(item.fitKeywords)
    && item.fitKeywords.length > 0
    && item.fitKeywords.every(isNonemptyString)
    && isNonemptyString(item.alternative)
  );
}

function hasValidTechnicalLabels(labels) {
  if (
    !Array.isArray(labels)
    || labels.length === 0
    || labels.length > GARMENT_FIELDS.length
  ) {
    return false;
  }
  const keys = new Set();
  return labels.every((entry) => {
    if (
      !hasExactKeys(entry, TECHNICAL_LABEL_FIELDS)
      || !GARMENT_FIELDS.includes(entry.key)
      || keys.has(entry.key)
      || !hasChineseText(entry.label)
      || !hasChineseText(entry.value)
    ) {
      return false;
    }
    keys.add(entry.key);
    return true;
  });
}

function isValidTechnicalItem(item) {
  return (
    hasExactKeys(item, TECHNICAL_ITEM_FIELDS)
    && isControlledRecommendationId(item.id)
    && isNonemptyString(item.title)
    && isNonemptyString(item.alt)
    && CONTROLLED_TECHNICAL_ASSETS.has(item.assetPath)
    && hasValidTechnicalLabels(item.labels)
  );
}

function hasValidTechnicalItems(items) {
  return (
    Array.isArray(items)
    && items.length >= 1
    && items.length <= 2
    && new Set(items.map((item) => item?.id)).size === items.length
    && items.every(isValidTechnicalItem)
  );
}

function hasValidVisualLayers(visualLayers, colorPlan) {
  if (!hasExactKeys(visualLayers, ['overall', 'collage', 'technical'])) return false;
  const { overall, collage, technical } = visualLayers;
  const hasDisplayCopy = (layer) => (
    isNonemptyString(layer?.title)
    && isNonemptyString(layer?.alt)
    && isNonemptyString(layer?.disclaimer)
  );

  return Boolean(
    hasValidOverall(overall, colorPlan)
    && hasDisplayCopy(collage)
    && Array.isArray(collage.items)
    && collage.items.length >= 3
    && collage.items.length <= 6
    && collage.items.every((item) => isValidCollageItem(item, colorPlan))
    && hasUniqueIds(collage.items)
    && hasDisplayCopy(technical)
    && CONTROLLED_TECHNICAL_ASSETS.has(technical.assetPath)
    && Array.isArray(technical.labels)
    && technical.labels.length === GARMENT_FIELDS.length
    && GARMENT_FIELDS.every((key) => technical.labels.some((entry) => (
      entry.key === key
      && isNonemptyString(entry.label)
      && isNonemptyString(entry.value)
    )))
    && hasValidTechnicalItems(technical.technicalItems)
  );
}

function isUsableReport(report) {
  if (!hasExactKeys(report, ROOT_FIELDS)) return false;
  if (report.schemaVersion !== 2) return false;
  if (report.mode !== 'local-personalized') return false;
  if (report.ruleSetVersion !== RULE_SET_VERSION) return false;
  if (!isNonemptyString(report.id)) return false;
  if (!isNonemptyString(report.generatedAt) || Number.isNaN(Date.parse(report.generatedAt))) {
    return false;
  }
  if (
    !Array.isArray(report.confirmedBasis)
    || report.confirmedBasis.length === 0
    || !report.confirmedBasis.every(isBasisItem)
  ) {
    return false;
  }
  if (
    !Array.isArray(report.topRecommendations)
    || report.topRecommendations.length !== 3
    || !hasUniqueIds(report.topRecommendations)
    || !report.topRecommendations.every((item) => (
      isVisibleRecommendation(item)
      && hasExpectedRecommendationShape(item)
    ))
  ) return false;
  if (!hasValidColorPlan(report.colorPlan)) return false;
  if (
    !hasExactKeys(report.outfitPlan, OUTFIT_PLAN_FIELDS)
    || !isNonemptyString(report.outfitPlan.title)
    || !hasControlledGarmentTemplateIds(report.outfitPlan.itemIds)
    || !isNonemptyString(report.outfitPlan.overallDisclaimer)
  ) return false;
  if (!hasValidVisualLayers(report.visualLayers, report.colorPlan)) return false;
  if (!Array.isArray(report.alternatives)) return false;
  if (
    !hasExactKeys(report.trendMeta, TREND_META_FIELDS)
    || typeof report.trendMeta.enabled !== 'boolean'
    || !Array.isArray(report.trendMeta.appliedRuleIds)
    || !report.trendMeta.appliedRuleIds.every((id) => (
      isApprovedRuleIdentity(id, 'clothing')
    ))
    || !(
      report.trendMeta.validUntil === null
      || isNonemptyString(report.trendMeta.validUntil)
    )
  ) return false;
  if (!report.sections || typeof report.sections !== 'object') return false;

  const sectionKeys = Object.keys(report.sections);
  if (
    sectionKeys.length !== SECTION_KEYS.length
    || !SECTION_KEYS.every((key) => (
      Object.hasOwn(report.sections, key)
      && Array.isArray(report.sections[key])
      && report.sections[key].length > 0
      && hasUniqueIds(report.sections[key])
      && report.sections[key].every((item) => (
        isVisibleRecommendation(item, key)
        && hasExpectedRecommendationShape(item, key)
      ))
    ))
  ) return false;
  if (!createFeedbackRecommendationRegistry(report).valid) return false;
  if (!report.sections.clothing.every(hasCompleteGarment)) return false;
  if (!report.sections.hairColor.every(hasCompleteHairColor)) return false;
  if (hasForbiddenContent(report)) return false;
  return true;
}

module.exports = {
  FEEDBACK_FAMILIES,
  FEEDBACK_STATES,
  createFeedbackRecommendationRegistry,
  hasApprovedAppliedRules,
  createPendingRegeneration,
  pendingRegenerationProfile,
  toggleFavorite,
  setFeedback,
  summarizeFeedback,
  normalizeFeedbackMap,
  removeExpiredReport,
  persistProfile,
  persistReport,
  isUsableReport
};
