const CONSENT_REASON = '请确认已年满 18 周岁';
const PHOTO_CONSENT_REASON = '请完成年龄、本人照片和本地处理确认';
const CONFIRMED_FEATURE_VALUES = Object.freeze({
  line: Object.freeze(['soft', 'balanced', 'defined', 'unknown']),
  value: Object.freeze(['light', 'medium', 'deep', 'unknown']),
  temperature: Object.freeze(['warm', 'neutral', 'cool', 'unknown']),
  presence: Object.freeze(['light', 'medium', 'strong', 'unknown']),
  contrast: Object.freeze(['low', 'medium', 'high', 'unknown'])
});
const { PREFERENCE_VALUES } = require('../config/preferences');
const { APPEARANCE_VALUES, COLOR_CALIBRATION_VALUES } = require('../config/appearance-options');
const { PREFERENCE_VALUES: STYLE_PROFILE_PREFERENCE_VALUES } = require('../config/preference-options');

function validateConsent(form = {}, mode = 'photo') {
  const valid = mode === 'manual'
    ? form.adult === true
    : form.adult === true && form.ownPhoto === true && form.photoProcessing === true;

  return { valid, reason: valid ? '' : (mode === 'manual' ? CONSENT_REASON : PHOTO_CONSENT_REASON) };
}

function validatePreferences(form = {}) {
  if (isStyleProfilePreferences(form)) return validateStyleProfilePreferences(form);
  const values = form && typeof form === 'object' ? form : {};
  const errors = {};

  if (!PREFERENCE_VALUES.scene.includes(values.scene)) errors.scene = '请选择使用场景';
  if (
    !Array.isArray(values.styles)
    || values.styles.length === 0
    || values.styles.some((value) => !PREFERENCE_VALUES.styles.includes(value))
  ) {
    errors.styles = '请至少选择一种风格偏好';
  }
  if (!PREFERENCE_VALUES.budget.includes(values.budget)) errors.budget = '请选择预算范围';
  if (!PREFERENCE_VALUES.makeup.includes(values.makeup)) errors.makeup = '请选择妆容接受度';
  if (
    !Array.isArray(values.doNotChange)
    || values.doNotChange.some((value) => !PREFERENCE_VALUES.doNotChange.includes(value))
  ) {
    errors.doNotChange = '请重新选择暂不改变的项目';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyAllowedValues(value, allowed) {
  return Array.isArray(value) && value.every((item) => allowed.includes(item));
}

function hasSelectedAllowedValues(value, allowed) {
  return hasOnlyAllowedValues(value, allowed) && value.length > 0;
}

function validateAppearance(value = {}) {
  const values = isRecord(value) ? value : {};
  const errors = {};

  for (const [field, allowed] of Object.entries(APPEARANCE_VALUES)) {
    if (!allowed.includes(values[field])) errors[field] = 'Invalid appearance option';
  }

  const calibration = isRecord(values.colorCalibration) ? values.colorCalibration : {};
  for (const [field, allowed] of Object.entries(COLOR_CALIBRATION_VALUES)) {
    if (!allowed.includes(calibration[field])) {
      errors[`colorCalibration.${field}`] = 'Invalid color calibration option';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

function validateStyleProfilePreferences(value = {}) {
  const values = isRecord(value) ? value : {};
  const errors = {};
  const options = STYLE_PROFILE_PREFERENCE_VALUES;

  if (!options.presentationMode.includes(values.presentationMode)) errors.presentationMode = '请选择呈现方式';
  if (!hasSelectedAllowedValues(values.scenes, options.scene)) errors.scenes = '请至少选择一个场景';
  if (
    typeof values.cityOrClimateText !== 'string'
    || values.cityOrClimateText.trim().length > 40
  ) {
    errors.cityOrClimateText = '城市或气候说明不超过 40 个字';
  }
  if (!hasSelectedAllowedValues(values.activityContext, options.activityContext)) errors.activityContext = '请至少选择一种活动环境';
  if (!hasSelectedAllowedValues(values.desiredEffects, options.desiredEffects)) errors.desiredEffects = '请至少选择一种希望呈现的感觉';
  if (!options.fitPreference.includes(values.fitPreference)) errors.fitPreference = '请选择常穿松量';
  if (!hasOnlyAllowedValues(values.comfortNeeds, options.comfortNeeds)) errors.comfortNeeds = '请重新选择舒适需求';
  if (!options.stylingTimeMinutes.includes(values.stylingTimeMinutes)) errors.stylingTimeMinutes = '请选择每天造型时间';
  if (!hasSelectedAllowedValues(values.stylePreferences, options.stylePreferences)) errors.stylePreferences = '请至少选择一种风格偏好';
  if (!options.budgetBand.includes(values.budgetBand)) errors.budgetBand = '请选择预算范围';
  if (!options.makeupPreference.includes(values.makeupPreference)) errors.makeupPreference = '请选择妆容偏好';
  if (!hasOnlyAllowedValues(values.lockedAreas, options.lockedAreas)) errors.lockedAreas = '请重新选择不希望改变的项目';
  if (typeof values.trendEnabled !== 'boolean') errors.trendEnabled = '请选择是否尝试流行趋势';

  const hairColor = isRecord(values.hairColorPreference) ? values.hairColorPreference : {};
  if (!options.currentHairColor.includes(hairColor.currentColor)) {
    errors['hairColorPreference.currentColor'] = '请选择当前发色';
  }
  if (!options.hairColorWillingness.includes(hairColor.willingness)) {
    errors['hairColorPreference.willingness'] = '请选择染发意愿';
  }
  if (!options.acceptsBleach.includes(hairColor.acceptsBleach)) {
    errors['hairColorPreference.acceptsBleach'] = '请选择是否接受专业漂发评估';
  }
  if (!options.maintenanceLevel.includes(hairColor.maintenanceLevel)) {
    errors['hairColorPreference.maintenanceLevel'] = '请选择发色维护成本';
  }
  if (!options.workplaceRestriction.includes(hairColor.workplaceRestriction)) {
    errors['hairColorPreference.workplaceRestriction'] = '请选择工作环境对发色的限制';
  }

  if (values.manualMeasurements !== null && values.manualMeasurements !== undefined) {
    if (!isRecord(values.manualMeasurements)) {
      errors.manualMeasurements = '请重新填写可选尺寸';
    } else {
      const limits = {
        heightCm: [80, 230],
        shoulderCm: [0, 180],
        bustCm: [0, 180],
        waistCm: [0, 180],
        hipCm: [0, 180],
        inseamCm: [0, 130]
      };
      const labels = {
        heightCm: '身高',
        shoulderCm: '肩宽',
        bustCm: '胸围',
        waistCm: '腰围',
        hipCm: '臀围',
        inseamCm: '内侧裤长'
      };
      for (const [field, [minimum, maximum]] of Object.entries(limits)) {
        if (
          Object.prototype.hasOwnProperty.call(values.manualMeasurements, field)
          && (!Number.isFinite(values.manualMeasurements[field])
            || values.manualMeasurements[field] < minimum
            || values.manualMeasurements[field] > maximum)
        ) {
          errors[`manualMeasurements.${field}`] = `${labels[field]}请输入 ${minimum}–${maximum} cm`;
        }
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

function isStyleProfilePreferences(values) {
  return isRecord(values) && (
    Object.prototype.hasOwnProperty.call(values, 'presentationMode')
    || Object.prototype.hasOwnProperty.call(values, 'scenes')
    || Object.prototype.hasOwnProperty.call(values, 'stylePreferences')
  );
}

function isManualProvenance(value) {
  return isRecord(value) && value.source === 'manual' && value.userConfirmed === true;
}

function isConfirmedAppearanceV2(features) {
  if (!isRecord(features) || !isRecord(features.colorCalibration) || !isRecord(features.provenance)) {
    return false;
  }
  const expectedKeys = [...Object.keys(APPEARANCE_VALUES), 'colorCalibration', 'provenance'];
  if (Object.keys(features).length !== expectedKeys.length || !expectedKeys.every((key) => (
    Object.prototype.hasOwnProperty.call(features, key)
  ))) return false;
  if (!validateAppearance(features).valid) return false;

  for (const field of Object.keys(APPEARANCE_VALUES)) {
    if (features[field] !== 'unknown' && !isManualProvenance(features.provenance[field])) return false;
  }
  for (const field of Object.keys(COLOR_CALIBRATION_VALUES)) {
    if (
      features.colorCalibration[field] !== 'unknown'
      && !isManualProvenance(features.provenance.colorCalibration)
    ) return false;
  }
  return true;
}

function validateConfirmedFeatures(features) {
  if (isConfirmedAppearanceV2(features)) return { valid: true };
  if (!features || typeof features !== 'object' || Array.isArray(features)) {
    return { valid: false };
  }

  const requiredKeys = Object.keys(CONFIRMED_FEATURE_VALUES);
  const actualKeys = Object.keys(features);
  const hasExactKeys = (
    actualKeys.length === requiredKeys.length
    && requiredKeys.every((key) => Object.prototype.hasOwnProperty.call(features, key))
  );
  const hasAllowedValues = (
    hasExactKeys
    && requiredKeys.every((key) => CONFIRMED_FEATURE_VALUES[key].includes(features[key]))
  );

  return { valid: hasExactKeys && hasAllowedValues };
}

module.exports = {
  validateConsent,
  validateAppearance,
  validatePreferences,
  validateConfirmedFeatures
};
