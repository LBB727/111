const { createStorage } = require('../../services/storage');
const { createPrivacyService } = require('../../services/privacy');
const { validateConsent } = require('../../utils/validators');
const { safeNavigate } = require('../../utils/navigation');
const { isAnalysisMode } = require('../../utils/flow-state');

const CONSENT_CONTROLS = Object.freeze({
  manual: Object.freeze([
    Object.freeze({ key: 'adult', label: '我已年满 18 岁' })
  ]),
  photo: Object.freeze([
    Object.freeze({ key: 'adult', label: '我已年满 18 岁' }),
    Object.freeze({ key: 'ownPhoto', label: '我确认使用的是本人照片，且有权使用' }),
    Object.freeze({ key: 'photoProcessing', label: '我同意在本机处理照片和相关造型特征' })
  ])
});

Page({
  data: {
    mode: '',
    consentControls: [],
    form: {
      adult: false,
      ownPhoto: false,
      photoProcessing: false
    }
  },

  onLoad() {
    const mode = getApp().globalData.session.analysisMode;
    if (!isAnalysisMode(mode)) {
      wx.redirectTo({ url: '/pages/home/index' });
      return;
    }
    this.setData({ mode, consentControls: CONSENT_CONTROLS[mode] });
    this.privacy = createPrivacyService(createStorage(wx), () => new Date());
    this._navigating = false;
  },

  onShow() {
    if (!this._appeared) {
      this._appeared = true;
      return;
    }
    this._navigating = false;
  },

  onConsentChange(event) {
    const checked = event.detail.value;
    this.setData({
      form: {
        adult: checked.includes('adult'),
        ownPhoto: checked.includes('ownPhoto'),
        photoProcessing: checked.includes('photoProcessing')
      }
    });
  },

  onContinue() {
    if (this._navigating) return;
    const mode = this.data.mode;
    const result = validateConsent(this.data.form, mode);
    if (!result.valid) {
      wx.showToast({ title: result.reason, icon: 'none' });
      return;
    }
    const saved = this.privacy.recordConsent(mode);
    if (!saved.ok) {
      wx.showToast({ title: '同意记录暂时无法保存，请重试', icon: 'none' });
      return;
    }
    const ticket = {
      adult: true,
      mode
    };
    if (mode === 'photo') {
      ticket.ownPhoto = true;
      ticket.photoProcessing = true;
    }
    getApp().globalData.session.consentTicket = ticket;
    this._navigating = true;
    safeNavigate(
      wx,
      '/pages/profile/index',
      '/pages/profile/index',
      () => this._navigating,
      () => { this._navigating = false; }
    );
  }
});

module.exports = { CONSENT_CONTROLS };
