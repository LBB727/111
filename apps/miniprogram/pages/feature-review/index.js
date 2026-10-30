const { nextRequiredRoute } = require('../../utils/flow-state');
const { safeNavigate } = require('../../utils/navigation');
const {
  createManualAppearanceDraft,
  confirmAppearance,
  normalizePreferences,
  MEASUREMENT_LIMITS
} = require('../../services/profile-contract');
const { PREFERENCE_VALUES } = require('../../config/preference-options');

const UNKNOWN_OPTION = Object.freeze({ label: '不确定', value: 'unknown' });
const options = (items) => [...items, UNKNOWN_OPTION];
const FIT_LABELS = Object.freeze({
  fitted: '合体',
  regular: '常规',
  relaxed: '宽松',
  oversized: '廓形'
});
const FIT_UNSELECTED_VALUE = 'unselected';
const FIT_OPTIONS = Object.freeze([
  Object.freeze({ label: '暂不确定', value: FIT_UNSELECTED_VALUE }),
  ...PREFERENCE_VALUES.fitPreference.map((value) => Object.freeze({
    label: FIT_LABELS[value],
    value
  }))
]);
const MEASUREMENT_LABELS = Object.freeze({
  heightCm: '身高',
  shoulderCm: '肩宽',
  bustCm: '胸围',
  waistCm: '腰围',
  hipCm: '臀围',
  inseamCm: '内侧裤长'
});
const MEASUREMENT_FIELDS = Object.freeze(Object.entries(MEASUREMENT_LIMITS).map((
  [key, [minimum, maximum]]
) => ({
  key,
  label: MEASUREMENT_LABELS[key],
  minimum,
  maximum
})));
const APPEARANCE_GROUPS = Object.freeze([
  {
    title: '轮廓与明暗',
    items: [
      { key: 'lineQuality', label: '线条感', options: options([{ label: '柔和', value: 'soft' }, { label: '均衡', value: 'balanced' }, { label: '利落', value: 'sharp' }]) },
      { key: 'faceOutline', label: '脸部外轮廓', options: options([{ label: '椭圆', value: 'oval' }, { label: '圆润', value: 'round' }, { label: '有棱角', value: 'angular' }, { label: '偏长', value: 'long' }, { label: '上宽下窄', value: 'upperWideLowerNarrow' }]) },
      { key: 'valueContrast', label: '明暗对比', options: options([{ label: '低', value: 'low' }, { label: '中等', value: 'medium' }, { label: '高', value: 'high' }]) },
      { key: 'visualScale', label: '视觉量感', options: options([{ label: '轻盈', value: 'light' }, { label: '中等', value: 'medium' }, { label: '明显', value: 'strong' }]) }
    ]
  },
  {
    title: '可见发型与服装',
    items: [
      { key: 'hairLength', label: '发长', options: options([{ label: '短发', value: 'short' }, { label: '下颌', value: 'jaw' }, { label: '肩部', value: 'shoulder' }, { label: '胸部', value: 'chest' }, { label: '长发', value: 'long' }]) },
      { key: 'hairTexture', label: '纹理', options: options([{ label: '直发', value: 'straight' }, { label: '微卷', value: 'wavy' }, { label: '卷发', value: 'curly' }, { label: '紧卷', value: 'coily' }]) },
      { key: 'visibleHairVolume', label: '可见发量感', options: options([{ label: '少', value: 'low' }, { label: '中等', value: 'medium' }, { label: '多', value: 'high' }]) },
      { key: 'visibleHairColorFamily', label: '当前可见／自报发色', options: options([{ label: '黑色', value: 'black' }, { label: '深棕', value: 'deepBrown' }, { label: '中棕', value: 'mediumBrown' }, { label: '浅棕', value: 'lightBrown' }, { label: '红棕', value: 'redBrown' }, { label: '铜色', value: 'copper' }, { label: '冷棕', value: 'coolBrown' }, { label: '蓝黑', value: 'blueBlack' }, { label: '其他', value: 'other' }]) },
      { key: 'glassesState', label: '眼镜状态', options: options([{ label: '未佩戴', value: 'none' }, { label: '可见', value: 'visible' }]) },
      { key: 'visibleGarmentSilhouette', label: '当前可见服装轮廓', options: options([{ label: '直线', value: 'straight' }, { label: '合体', value: 'fittedCut' }, { label: '宽松', value: 'relaxed' }, { label: 'A 字', value: 'aLine' }, { label: '收窄', value: 'tapered' }, { label: '微喇', value: 'flared' }, { label: '短款', value: 'cropped' }, { label: '长线条', value: 'longline' }, { label: '廓形', value: 'oversizedCut' }]) }
    ]
  },
  {
    title: '色布自校准',
    group: 'colorCalibration',
    items: [
      { key: 'whiteChoice', label: '米白 / 纯白', options: options([{ label: '米白更合适', value: 'ivory' }, { label: '纯白更合适', value: 'pureWhite' }, { label: '相近', value: 'equal' }]) },
      { key: 'neutralChoice', label: '暖棕 / 冷灰', options: options([{ label: '暖棕更合适', value: 'warmBrown' }, { label: '冷灰更合适', value: 'coolGray' }, { label: '相近', value: 'equal' }]) },
      { key: 'accentChoice', label: '砖红 / 莓红', options: options([{ label: '砖红更合适', value: 'brickRed' }, { label: '莓红更合适', value: 'berry' }, { label: '相近', value: 'equal' }]) }
    ]
  }
]);

function isConfirmedAppearance(value) {
  return value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'lineQuality');
}

function calibrationPreferences(profileDraft) {
  const normalized = normalizePreferences(profileDraft);
  return {
    fitPreference: PREFERENCE_VALUES.fitPreference.includes(profileDraft && profileDraft.fitPreference)
      ? normalized.fitPreference
      : FIT_UNSELECTED_VALUE,
    manualMeasurements: normalized.manualMeasurements
      ? { ...normalized.manualMeasurements }
      : {}
  };
}

Page({
  data: {
    appearanceGroups: APPEARANCE_GROUPS,
    fitOptions: FIT_OPTIONS,
    fitPreference: FIT_UNSELECTED_VALUE,
    measurementFields: MEASUREMENT_FIELDS,
    manualMeasurements: {},
    draft: null,
    mode: '',
    photoPath: ''
  },

  onLoad() {
    this._navigating = false;
    this._initialize();
  },

  onShow() {
    if (!this._appeared) {
      this._appeared = true;
      return;
    }
    const returningFromNextPage = this._navigating;
    this._navigating = false;
    if (returningFromNextPage) {
      this._initialize();
      return;
    }
    this._validateFlow();
  },

  _initialize() {
    const session = getApp().globalData.session;
    if (!this._validateFlow()) return false;
    const draft = isConfirmedAppearance(session.features)
      ? confirmAppearance(session.features)
      : createManualAppearanceDraft(session.profileDraft);
    this.setData({
      draft,
      ...calibrationPreferences(session.profileDraft),
      mode: session.analysisMode,
      photoPath: session.photoPath || ''
    });
    return true;
  },

  _validateFlow() {
    const session = getApp().globalData.session;
    const required = nextRequiredRoute({
      ...session,
      consentTicket: session.consentTicket,
      features: null,
      preferences: null,
      report: null
    });
    if (required !== '/pages/feature-review/index') {
      wx.redirectTo({ url: required });
      return false;
    }
    return true;
  },

  onAppearanceChange(event) {
    const key = event.currentTarget.dataset.key;
    const group = event.currentTarget.dataset.group;
    const knownGroup = APPEARANCE_GROUPS.find((candidate) => candidate.group === group);
    const knownItem = APPEARANCE_GROUPS.some((candidate) => candidate.items.some((item) => item.key === key));
    if (!knownItem || (group && !knownGroup)) return;
    const draft = confirmAppearance(this.data.draft);
    if (group === 'colorCalibration') draft.colorCalibration[key] = event.detail.value;
    else draft[key] = event.detail.value;
    this.setData({ draft });
  },

  onFeatureChange(event) {
    const keyMap = {
      line: 'lineQuality',
      value: 'valueContrast',
      presence: 'visualScale',
      contrast: 'valueContrast'
    };
    const valueMap = { defined: 'sharp', deep: 'high', light: 'low', strong: 'high' };
    const key = keyMap[event.currentTarget.dataset.key];
    if (!key) return;
    this.onAppearanceChange({
      currentTarget: { dataset: { key, group: '' } },
      detail: { value: valueMap[event.detail.value] || event.detail.value }
    });
  },

  onFitPreferenceChange(event) {
    const fitPreference = event.detail.value;
    if (
      fitPreference !== FIT_UNSELECTED_VALUE
      && !PREFERENCE_VALUES.fitPreference.includes(fitPreference)
    ) return;
    this.setData({ fitPreference });
  },

  onMeasurementInput(event) {
    const key = event.currentTarget.dataset.key;
    if (!Object.prototype.hasOwnProperty.call(MEASUREMENT_LIMITS, key)) return;
    const manualMeasurements = { ...this.data.manualMeasurements };
    const rawValue = String(event.detail.value || '').trim();
    if (!rawValue) delete manualMeasurements[key];
    else manualMeasurements[key] = Number(rawValue);
    this.setData({ manualMeasurements });
  },

  onContinue() {
    if (this._navigating || !this._validateFlow()) return;
    const features = confirmAppearance(this.data.draft);
    const session = getApp().globalData.session;
    const hasSelectedFit = PREFERENCE_VALUES.fitPreference.includes(this.data.fitPreference);
    const calibration = normalizePreferences({
      ...session.profileDraft,
      ...(hasSelectedFit ? { fitPreference: this.data.fitPreference } : {}),
      manualMeasurements: this.data.manualMeasurements
    });
    const profileDraft = {
      ...session.profileDraft,
      manualMeasurements: calibration.manualMeasurements
    };
    if (hasSelectedFit) profileDraft.fitPreference = calibration.fitPreference;
    else delete profileDraft.fitPreference;
    if (
      JSON.stringify(session.features) !== JSON.stringify(features)
      || JSON.stringify(session.profileDraft) !== JSON.stringify(profileDraft)
    ) {
      session.preferences = null;
      session.report = null;
    }
    session.profileDraft = profileDraft;
    session.features = features;
    this._navigating = true;
    safeNavigate(
      wx,
      '/pages/preferences/index',
      '/pages/preferences/index',
      () => this._navigating,
      () => { this._navigating = false; }
    );
  }
});

module.exports = {
  APPEARANCE_GROUPS,
  FIT_OPTIONS,
  FIT_UNSELECTED_VALUE,
  MEASUREMENT_FIELDS
};
