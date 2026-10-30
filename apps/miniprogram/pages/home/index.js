const { getDemoReport } = require('../../data/demo-report');
const { safeNavigate } = require('../../utils/navigation');

Page({
  onShow() {
    this._unloaded = false;
    this._navigationRevision = (this._navigationRevision || 0) + 1;
    this._navigating = false;
  },

  onUnload() {
    this._unloaded = true;
    this._navigationRevision = (this._navigationRevision || 0) + 1;
  },

  _open(route, fallback, prepare = () => {}) {
    if (this._navigating || this._unloaded) return;
    this._navigating = true;
    const revision = (this._navigationRevision || 0) + 1;
    this._navigationRevision = revision;
    const isCurrent = () => !this._unloaded && this._navigationRevision === revision;
    try {
      prepare();
      safeNavigate(wx, route, fallback, isCurrent, () => {
        if (!isCurrent()) return;
        this._navigating = false;
        wx.showToast({ title: '页面未打开，请重试', icon: 'none' });
      });
    } catch (error) {
      if (isCurrent()) this._navigating = false;
      throw error;
    }
  },

  startFlow(mode) {
    if (mode !== 'manual' && mode !== 'photo') return;
    this._open('/pages/consent/index', '/pages/consent/index', () => {
      const app = getApp();
      app.resetSession();
      app.globalData.session.analysisMode = mode;
    });
  },

  onStartManual() {
    this.startFlow('manual');
  },

  onStartPhoto() {
    this.startFlow('photo');
  },

  onViewDemo() {
    this._open('/pages/result/index', '/pages/home/index', () => {
      const app = getApp();
      app.resetSession();
      app.globalData.session.report = getDemoReport();
    });
  },

  onOpenSettings() {
    this._open('/pages/settings/index', '/pages/home/index');
  }
});
