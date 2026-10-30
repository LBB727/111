const {
  PREFERENCE_VALUES,
  DESIRED_EFFECT_LABELS
} = require('../../config/preference-options');
const { normalizePreferences } = require('../../services/profile-contract');
const {
  hasConsentTicket,
  isAnalysisMode,
  nextRequiredRoute
} = require('../../utils/flow-state');
const { safeNavigate } = require('../../utils/navigation');

const LABELS = Object.freeze({
  presentationMode: Object.freeze({ womenswear: '女装', menswear: '男装', neutral: '中性', mixed: '混搭' }),
  scene: Object.freeze({ commute: '通勤', interview: '面试', date: '约会', casual: '日常休闲', party: '聚会', travel: '旅行', formal: '正式活动' }),
  activityContext: Object.freeze({ indoor: '室内', outdoor: '户外', longWalk: '长时间步行', seated: '久坐', formalReception: '正式接待' }),
  desiredEffects: DESIRED_EFFECT_LABELS
});

function optionsFor(key) {
  return PREFERENCE_VALUES[key].map((value) => ({ value, label: LABELS[key][value] }));
}

const PROFILE_OPTIONS = Object.freeze({
  presentationMode: Object.freeze(optionsFor('presentationMode')),
  scene: Object.freeze(optionsFor('scene')),
  activityContext: Object.freeze(optionsFor('activityContext')),
  desiredEffects: Object.freeze(optionsFor('desiredEffects'))
});

const DEFAULT_PROFILE_DRAFT = Object.freeze({
  presentationMode: '',
  scenes: Object.freeze([]),
  cityOrClimateText: '',
  activityContext: Object.freeze([]),
  desiredEffects: Object.freeze([])
});

function copyDraft(draft = DEFAULT_PROFILE_DRAFT) {
  draft = draft || DEFAULT_PROFILE_DRAFT;
  const copy = {
    presentationMode: draft.presentationMode || '',
    scenes: Array.isArray(draft.scenes) ? [...draft.scenes] : [],
    cityOrClimateText: typeof draft.cityOrClimateText === 'string' ? draft.cityOrClimateText : '',
    activityContext: Array.isArray(draft.activityContext) ? [...draft.activityContext] : [],
    desiredEffects: Array.isArray(draft.desiredEffects) ? [...draft.desiredEffects] : []
  };
  const hasFitPreference = PREFERENCE_VALUES.fitPreference.includes(draft.fitPreference);
  const hasMeasurements = Object.prototype.hasOwnProperty.call(draft, 'manualMeasurements');
  if (!hasFitPreference && !hasMeasurements) return copy;

  const calibration = normalizePreferences(draft);
  return {
    ...copy,
    ...(hasFitPreference ? { fitPreference: calibration.fitPreference } : {}),
    ...(hasMeasurements ? {
      manualMeasurements: calibration.manualMeasurements
        ? { ...calibration.manualMeasurements }
        : null
    } : {})
  };
}

function validList(values, allowed) {
  return Array.isArray(values) && values.every((value) => allowed.includes(value));
}

function selectedList(values, allowed) {
  return validList(values, allowed) && values.length > 0;
}

function validateDraft(draft) {
  const errors = {};
  if (!PREFERENCE_VALUES.presentationMode.includes(draft.presentationMode)) errors.presentationMode = '请选择表达方向';
  if (!selectedList(draft.scenes, PREFERENCE_VALUES.scene)) errors.scenes = '请至少选择一个当前场景';
  if (typeof draft.cityOrClimateText !== 'string' || draft.cityOrClimateText.trim().length > 40) errors.cityOrClimateText = '城市或气候说明不超过 40 个字';
  if (!selectedList(draft.activityContext, PREFERENCE_VALUES.activityContext)) errors.activityContext = '请至少选择一种活动环境';
  if (!selectedList(draft.desiredEffects, PREFERENCE_VALUES.desiredEffects)) errors.desiredEffects = '请至少选择一种希望呈现的感觉';
  return { valid: Object.keys(errors).length === 0, errors };
}

function isConfirmedAppearance(features) {
  return Boolean(
    features
    && typeof features === 'object'
    && Object.prototype.hasOwnProperty.call(features, 'lineQuality')
  );
}

Page({
  data: {
    mode: '',
    options: PROFILE_OPTIONS,
    form: copyDraft(),
    errors: {}
  },

  onLoad() {
    this._navigating = false;
    this._formDirty = false;
    if (!this._validateAccess()) return;
    const session = getApp().globalData.session;
    this.setData({ mode: session.analysisMode, form: copyDraft(session.profileDraft) });
  },

  onShow() {
    if (!this._appeared) {
      this._appeared = true;
      return;
    }
    this._navigating = false;
    if (!this._validateAccess()) return;
    if (!this._formDirty) {
      const session = getApp().globalData.session;
      this.setData({ form: copyDraft(session.profileDraft) });
    }
  },

  _validateAccess() {
    const session = getApp().globalData.session;
    if (!isAnalysisMode(session.analysisMode)) {
      wx.redirectTo({ url: '/pages/home/index' });
      return false;
    }
    if (!hasConsentTicket(session.consentTicket, session.analysisMode)) {
      wx.redirectTo({ url: '/pages/consent/index' });
      return false;
    }
    return true;
  },

  _setForm(patch, errorKey) {
    this._formDirty = true;
    const errors = { ...this.data.errors };
    delete errors[errorKey];
    this.setData({ form: { ...this.data.form, ...patch }, errors });
  },

  onPresentationModeChange(event) {
    this._setForm({ presentationMode: event.detail.value }, 'presentationMode');
  },

  onScenesChange(event) {
    this._setForm({ scenes: event.detail.value }, 'scenes');
  },

  onCityOrClimateInput(event) {
    this._setForm({ cityOrClimateText: event.detail.value }, 'cityOrClimateText');
  },

  onActivityContextChange(event) {
    this._setForm({ activityContext: event.detail.value }, 'activityContext');
  },

  onDesiredEffectsChange(event) {
    this._setForm({ desiredEffects: event.detail.value }, 'desiredEffects');
  },

  onSubmit() {
    if (this._navigating || !this._validateAccess()) return;
    const profileDraft = copyDraft(this.data.form);
    profileDraft.cityOrClimateText = profileDraft.cityOrClimateText.trim();
    const validation = validateDraft(profileDraft);
    if (!validation.valid) {
      this.setData({ errors: validation.errors });
      return;
    }

    const session = getApp().globalData.session;
    session.profileDraft = profileDraft;
    session.preferences = null;
    session.profile = null;
    session.report = null;
    this._formDirty = false;
    this._navigating = true;
    const nextRoute = nextRequiredRoute({
      ...session,
      consentTicket: session.consentTicket,
      features: isConfirmedAppearance(session.features) ? session.features : null,
      preferences: null,
      report: null
    });
    safeNavigate(wx, nextRoute, nextRoute, () => this._navigating, () => { this._navigating = false; });
  }
});

module.exports = { DEFAULT_PROFILE_DRAFT, PROFILE_OPTIONS, validateDraft };
