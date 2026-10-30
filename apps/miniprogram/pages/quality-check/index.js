const { inspectPhoto } = require('../../services/photo-quality');
const { clearPhotoState, nextRequiredRoute } = require('../../utils/flow-state');
const { safeNavigate } = require('../../utils/navigation');

const CAPTURE_PAGE_ROUTE = 'pages/capture/index';

function previousPageIsCapture() {
  try {
    if (typeof getCurrentPages !== 'function') return false;
    const pages = getCurrentPages();
    const previousPage = Array.isArray(pages)
      ? pages[pages.length - 2]
      : null;
    const route = typeof previousPage?.route === 'string'
      ? previousPage.route.replace(/^\/+/, '')
      : '';
    return route === CAPTURE_PAGE_ROUTE;
  } catch (error) {
    return false;
  }
}

const CHECK_DESCRIPTIONS = Object.freeze({
  decode: '确认图片文件可以在本机正常读取',
  resolution: '检查图片尺寸是否足够用于后续整理',
  aspect: '检查画面比例是否在支持范围内',
  size: '检查本地文件大小是否在限制内',
});

Page({
  data: {
    result: null,
    checks: []
  },

  onLoad() {
    this._navigating = false;
    const session = getApp().globalData.session;
    if (!this._validateFlow()) return;

    const meta = {
      ...session.photoMeta,
      path: session.photoMeta.path || session.photoPath
    };
    const inspected = inspectPhoto(meta);
    const result = inspected;
    const issueByKey = result.issues.reduce((issues, issue) => ({
      ...issues,
      [issue.key]: issue.message
    }), {});
    const checks = result.checks.map((check) => ({
      ...check,
      basisLabel: '本地文件信息',
      description: issueByKey[check.key] || CHECK_DESCRIPTIONS[check.key]
    }));

    Object.assign(session, {
      qualityResult: result,
      features: null,
      preferences: null,
      report: null
    });
    this.setData({ result, checks });
  },

  onShow() {
    if (!this._appeared) {
      this._appeared = true;
      return;
    }
    this._navigating = false;
    this._validateFlow();
  },

  _validateFlow() {
    const session = getApp().globalData.session;
    const required = nextRequiredRoute({
      ...session,
      consentTicket: session.consentTicket,
      qualityResult: null,
      features: null,
      preferences: null,
      report: null
    });
    if (required === '/pages/quality-check/index') return true;
    wx.redirectTo({ url: required });
    return false;
  },

  onContinue() {
    if (this._navigating || !this._validateFlow()) return;
    if (!this.data.result || this.data.result.passed !== true) {
      wx.showToast({ title: '照片检查未通过，请重新选择', icon: 'none' });
      return;
    }
    this._navigating = true;
    safeNavigate(
      wx,
      '/pages/feature-review/index',
      '/pages/feature-review/index',
      () => this._navigating,
      () => { this._navigating = false; }
    );
  },

  onReselect() {
    const session = getApp().globalData.session;
    Object.assign(session, clearPhotoState(session), {
      preferences: null,
      report: null
    });
    const openCaptureFallback = () => {
      wx.redirectTo({ url: '/pages/capture/index' });
    };
    if (!previousPageIsCapture()) {
      openCaptureFallback();
      return;
    }
    try {
      wx.navigateBack({
        delta: 1,
        fail: openCaptureFallback
      });
    } catch (error) {
      openCaptureFallback();
    }
  },

  onUseManual() {
    const session = getApp().globalData.session;
    Object.assign(session, clearPhotoState(session), {
      analysisMode: 'manual',
      consentTicket: { adult: true, mode: 'manual' },
      preferences: null,
      report: null
    });
    wx.redirectTo({ url: '/pages/feature-review/index' });
  },

  onReturnHome() {
    wx.reLaunch({ url: '/pages/home/index' });
  }
});
