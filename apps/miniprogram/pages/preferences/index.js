const { validatePreferences } = require('../../utils/validators');
const { nextRequiredRoute } = require('../../utils/flow-state');
const { safeNavigate } = require('../../utils/navigation');
const {
  createDefaultPreferences,
  normalizePreferences,
  buildStyleProfile
} = require('../../services/profile-contract');
const {
  DESIRED_EFFECT_LABELS,
  STYLE_PROFILE_CHOICE_GROUPS
} = require('../../config/preference-options');
const { CHOICE_GROUPS } = require('../../config/preferences');

const DEFAULT_FORM = Object.freeze(createDefaultPreferences());
const UNKNOWN_SUMMARY_LABEL = '暂不确定';
const PRESENTATION_MODE_LABELS = Object.freeze({
  womenswear: '女装',
  menswear: '男装',
  neutral: '中性',
  mixed: '混搭'
});
const SCENE_LABELS = Object.freeze(Object.fromEntries(
  CHOICE_GROUPS.scene.map(({ value, label }) => [value, label])
));
const ACTIVITY_CONTEXT_LABELS = Object.freeze({
  indoor: '室内',
  outdoor: '户外',
  longWalk: '长时间步行',
  seated: '久坐',
  formalReception: '正式接待'
});
const MEASUREMENT_FIELDS = Object.freeze([
  Object.freeze({ key: 'shoulderCm', label: '肩宽（cm）' }),
  Object.freeze({ key: 'bustCm', label: '胸围（cm）' }),
  Object.freeze({ key: 'waistCm', label: '腰围（cm）' }),
  Object.freeze({ key: 'hipCm', label: '臀围（cm）' }),
  Object.freeze({ key: 'heightCm', label: '身高（cm）' }),
  Object.freeze({ key: 'inseamCm', label: '内侧裤长（cm）' })
]);

function copyForm(form = DEFAULT_FORM) {
  const source = form || DEFAULT_FORM;
  return {
    ...source,
    scenes: [...(source.scenes || [])],
    activityContext: [...(source.activityContext || [])],
    desiredEffects: [...(source.desiredEffects || [])],
    comfortNeeds: [...(source.comfortNeeds || [])],
    stylePreferences: [...(source.stylePreferences || [])],
    lockedAreas: [...(source.lockedAreas || [])],
    hairColorPreference: { ...(source.hairColorPreference || {}) },
    manualMeasurements: source.manualMeasurements ? { ...source.manualMeasurements } : null
  };
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function copyOptionalProfileField(draft, key) {
  if (!hasOwn(draft, key)) return { present: false, value: null };
  const value = draft[key];
  return {
    present: true,
    value: value && typeof value === 'object'
      ? JSON.parse(JSON.stringify(value))
      : value
  };
}

function createDraftContext(profileDraft = {}) {
  return {
    fitPreference: copyOptionalProfileField(profileDraft, 'fitPreference'),
    manualMeasurements: copyOptionalProfileField(profileDraft, 'manualMeasurements')
  };
}

function optionalFieldChanged(profileDraft, context, key) {
  if (!context || !context[key]) return false;
  const current = copyOptionalProfileField(profileDraft, key);
  return current.present !== context[key].present
    || JSON.stringify(current.value) !== JSON.stringify(context[key].value);
}

function mergeDrafts(saved, pending, profileDraft, context) {
  const merged = { ...saved, ...pending, ...profileDraft };
  if (!pending || !context) return merged;

  ['fitPreference', 'manualMeasurements'].forEach((key) => {
    if (!optionalFieldChanged(profileDraft, context, key)) return;
    if (hasOwn(profileDraft, key)) merged[key] = profileDraft[key];
    else delete merged[key];
  });
  return merged;
}

function replaceWithProfile(wxApi, onFailure) {
  const url = '/pages/profile/index';
  let fallbackStarted = false;
  const fallback = () => {
    if (fallbackStarted) return;
    fallbackStarted = true;
    try {
      wxApi.redirectTo({ url, fail: onFailure });
    } catch (error) {
      onFailure();
    }
  };

  try {
    if (typeof wxApi.reLaunch === 'function') {
      wxApi.reLaunch({ url, fail: fallback });
      return;
    }
  } catch (error) {
    fallback();
    return;
  }
  fallback();
}

function summaryLabel(labels, value) {
  if (typeof value !== 'string' || value.length === 0) return '';
  return labels[value] || UNKNOWN_SUMMARY_LABEL;
}

function summaryList(labels, values) {
  if (!Array.isArray(values)) return '';
  return values
    .map((value) => summaryLabel(labels, value))
    .filter(Boolean)
    .join('、');
}

function createSummary(draft = {}) {
  return [
    ['呈现方式', summaryLabel(PRESENTATION_MODE_LABELS, draft.presentationMode)],
    ['场景', summaryList(SCENE_LABELS, draft.scenes)],
    ['城市或气候', draft.cityOrClimateText],
    ['活动情况', summaryList(ACTIVITY_CONTEXT_LABELS, draft.activityContext)],
    ['希望呈现', summaryList(DESIRED_EFFECT_LABELS, draft.desiredEffects)]
  ].filter(([, value]) => Boolean(value)).map(([label, value]) => ({ label, value }));
}

function displayErrors(errors = {}) {
  return {
    hairColorErrors: { currentColor: errors['hairColorPreference.currentColor'] || '' },
    measurementErrors: Object.fromEntries(MEASUREMENT_FIELDS.map(({ key }) => [
      key,
      errors[`manualMeasurements.${key}`] || ''
    ]))
  };
}

Page({
  data: {
    form: copyForm(),
    errors: {},
    ...displayErrors(),
    choiceGroups: STYLE_PROFILE_CHOICE_GROUPS,
    measurementFields: MEASUREMENT_FIELDS,
    summary: []
  },

  onLoad() {
    this._navigating = false;
    this._draftActive = false;
    if (!this._validateFlow()) return;
    const session = getApp().globalData.session;
    const saved = session.preferences && typeof session.preferences === 'object'
      ? session.preferences
      : {};
    const pending = session.preferencesDraft
      && typeof session.preferencesDraft === 'object'
      ? session.preferencesDraft
      : {};
    const draft = session.profileDraft && typeof session.profileDraft === 'object'
      ? session.profileDraft
      : {};
    const context = pending === session.preferencesDraft
      ? session.preferencesDraftContext
      : null;
    this.setData({
      form: copyForm(normalizePreferences(mergeDrafts(saved, pending, draft, context))),
      summary: createSummary(draft)
    });
    this._draftActive = true;
  },

  onShow() {
    if (!this._loadedOnce) {
      this._loadedOnce = true;
      return;
    }
    this._navigating = false;
    this._validateFlow();
  },

  onHide() {
    this._savePreferenceDraft();
  },

  onUnload() {
    this._savePreferenceDraft();
  },

  _validateFlow() {
    const session = getApp().globalData.session;
    const required = nextRequiredRoute({
      ...session,
      consentTicket: session.consentTicket,
      preferences: null,
      report: null
    });
    if (required !== '/pages/preferences/index') {
      wx.redirectTo({ url: required });
      return false;
    }
    return true;
  },

  onChoiceChange(event) {
    const field = event.currentTarget.dataset.field;
    const errors = { ...this.data.errors };
    if (field === 'currentHairColor' || field === 'hairColorWillingness' || field === 'acceptsBleach' || field === 'maintenanceLevel' || field === 'workplaceRestriction') {
      const hairField = {
        currentHairColor: 'currentColor',
        hairColorWillingness: 'willingness',
        acceptsBleach: 'acceptsBleach',
        maintenanceLevel: 'maintenanceLevel',
        workplaceRestriction: 'workplaceRestriction'
      }[field];
      delete errors[`hairColorPreference.${hairField}`];
      this.setData({
        form: {
          ...this.data.form,
          hairColorPreference: { ...this.data.form.hairColorPreference, [hairField]: event.detail.value }
        },
        errors,
        ...displayErrors(errors)
      });
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(this.data.form, field)) return;
    delete errors[field];
    this.setData({ form: { ...this.data.form, [field]: event.detail.value }, errors, ...displayErrors(errors) });
  },

  onTrendChange(event) {
    const errors = { ...this.data.errors };
    delete errors.trendEnabled;
    this.setData({ form: { ...this.data.form, trendEnabled: event.detail.value }, errors, ...displayErrors(errors) });
  },

  onMeasurementInput(event) {
    const key = event.currentTarget.dataset.key;
    const rawValue = event.detail.value;
    const measurements = { ...(this.data.form.manualMeasurements || {}) };
    if (rawValue === '') delete measurements[key];
    else measurements[key] = Number(rawValue);
    const errors = { ...this.data.errors };
    delete errors[`manualMeasurements.${key}`];
    this.setData({
      form: {
        ...this.data.form,
        manualMeasurements: Object.keys(measurements).length ? measurements : null
      },
      errors,
      ...displayErrors(errors)
    });
  },

  _savePreferenceDraft() {
    if (!this._draftActive) return;
    const session = getApp().globalData.session;
    session.preferencesDraft = copyForm(this.data.form);
    session.preferencesDraftContext = createDraftContext(session.profileDraft);
  },

  onEditProfile() {
    if (this._navigating) return;
    this._savePreferenceDraft();
    this._draftActive = false;
    this._navigating = true;
    replaceWithProfile(wx, () => {
      this._draftActive = true;
      this._navigating = false;
    });
  },

  onContinue() {
    if (this._navigating || !this._validateFlow()) return;
    const validation = validatePreferences(this.data.form);
    if (!validation.valid) {
      this.setData({ errors: validation.errors, ...displayErrors(validation.errors) });
      return;
    }

    const session = getApp().globalData.session;
    const preferences = normalizePreferences(this.data.form);
    session.preferences = preferences;
    delete session.preferencesDraft;
    delete session.preferencesDraftContext;
    session.profile = buildStyleProfile({
      analysisMode: session.analysisMode,
      appearance: session.features,
      preferences
    });
    session.report = null;
    this.setData({ form: copyForm(preferences), errors: {}, ...displayErrors() });
    this._draftActive = false;
    this._navigating = true;
    safeNavigate(
      wx,
      '/pages/processing/index',
      '/pages/processing/index',
      () => this._navigating,
      () => { this._navigating = false; }
    );
  }
});

module.exports = { DEFAULT_FORM, MEASUREMENT_FIELDS, STYLE_PROFILE_CHOICE_GROUPS };
