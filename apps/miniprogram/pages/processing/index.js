const {
  generateReport,
  isReportForProfile
} = require('../../services/recommendation-engine');
const { createStorage } = require('../../services/storage');
const { nextRequiredRoute } = require('../../utils/flow-state');
const { createOperationGuard } = require('../../utils/operation-guard');
const { safeRedirect } = require('../../utils/navigation');
const {
  validateConfirmedFeatures,
  validatePreferences
} = require('../../utils/validators');
const { buildStyleProfile } = require('../../services/profile-contract');
const { buildVisualLayers } = require('../../services/visual-layer-builder');
const { STORAGE_KEYS } = require('../../config/storage-keys');
const {
  isUsableReport,
  persistProfile,
  persistReport,
  pendingRegenerationProfile
} = require('../../services/report-state');

const STAGES = Object.freeze([
  Object.freeze({ label: '整理已确认的造型特征', detail: '只使用你刚才确认的信息' }),
  Object.freeze({ label: '匹配本地穿搭规则', detail: '不上传照片或分析内容' }),
  Object.freeze({ label: '生成可解释的建议', detail: '整理具体动作、依据与替代项' })
]);
const STAGE_DELAYS = Object.freeze([350, 750, 1150]);

Page({
  data: {
    stages: STAGES.map((stage) => ({ ...stage, done: false })),
    progress: 0,
    statusText: '准备本地分析',
    reportReady: false,
    navigating: false
  },

  onLoad() {
    this._timers = [];
    this._lifecycleGuard = createOperationGuard();
    this._navigationGuard = createOperationGuard();
    this._lifecycleToken = this._lifecycleGuard.begin();
    this._reportGenerated = false;
    this._unloaded = false;
    this._regenerationCommitted = false;

    const session = getApp().globalData.session;
    const pendingRegeneration = session.pendingRegeneration;
    const pendingProfile = pendingRegenerationProfile(pendingRegeneration);
    const hasPendingRegeneration = Boolean(pendingProfile);
    if (pendingRegeneration && !hasPendingRegeneration) {
      delete session.pendingRegeneration;
    }
    this._pendingRegeneration = hasPendingRegeneration
      ? pendingRegeneration
      : null;
    const required = nextRequiredRoute(session);
    if (
      !hasPendingRegeneration
      && required !== '/pages/processing/index'
      && required !== '/pages/result/index'
    ) {
      this._lifecycleGuard.invalidate();
      wx.redirectTo({ url: required });
      return;
    }
    if (
      !hasPendingRegeneration
      && !validateConfirmedFeatures(session.features).valid
    ) {
      this._lifecycleGuard.invalidate();
      session.features = null;
      session.preferences = null;
      session.report = null;
      wx.redirectTo({ url: nextRequiredRoute(session) });
      return;
    }
    if (
      !hasPendingRegeneration
      && !validatePreferences(session.preferences).valid
    ) {
      this._lifecycleGuard.invalidate();
      session.preferences = null;
      session.report = null;
      wx.redirectTo({ url: nextRequiredRoute(session) });
      return;
    }
    if (session.report && !hasPendingRegeneration) {
      this.setData({
        stages: STAGES.map((stage) => ({ ...stage, done: true })),
        progress: 100,
        statusText: '建议已经准备好',
        reportReady: true
      });
      this._scheduleAutomaticNavigation(this._lifecycleToken);
      return;
    }

    STAGE_DELAYS.forEach((delay, index) => {
      this._schedule(() => this._completeStage(index, session), delay);
    });
  },

  onShow() {
    if (!this._appeared) {
      this._appeared = true;
      return;
    }
    const session = getApp().globalData.session;
    const required = nextRequiredRoute(session);
    const hasPendingRegeneration = (
      session.pendingRegeneration === this._pendingRegeneration
    );
    if (
      !hasPendingRegeneration
      && required !== '/pages/processing/index'
      && required !== '/pages/result/index'
    ) {
      if (this._navigationGuard) this._navigationGuard.invalidate();
      this.setData({ navigating: false });
      wx.redirectTo({ url: required });
      return;
    }
    if (this._navigationGuard) this._navigationGuard.invalidate();
    this.setData({
      navigating: false,
      reportReady: Boolean(session.report)
    });
  },

  onUnload() {
    this._unloaded = true;
    const session = getApp().globalData.session;
    if (
      !this._regenerationCommitted
      && this._pendingRegeneration
      && session.pendingRegeneration === this._pendingRegeneration
    ) {
      delete session.pendingRegeneration;
    }
    (this._timers || []).forEach((timer) => clearTimeout(timer));
    this._timers = [];
    if (this._lifecycleGuard) this._lifecycleGuard.invalidate();
    if (this._navigationGuard) this._navigationGuard.invalidate();
  },

  _schedule(callback, delay) {
    const token = this._lifecycleToken;
    const timer = setTimeout(() => {
      if (!this._isActive(token)) return;
      callback();
    }, delay);
    this._timers.push(timer);
  },

  _isActive(token) {
    return (
      !this._unloaded
      && this._lifecycleGuard
      && this._lifecycleGuard.isCurrent(token)
    );
  },

  _completeStage(index, session) {
    const stages = STAGES.map((stage, stageIndex) => ({
      ...stage,
      done: stageIndex <= index
    }));
    const progress = [34, 67, 100][index];
    const statusText = index === STAGES.length - 1
      ? '正在完成你的建议'
      : STAGES[index].label;
    this.setData({ stages, progress, statusText });

    if (index === STAGES.length - 1) this._generateReport(session);
  },

  _generateReport(session) {
    if (this._reportGenerated) return;
    this._reportGenerated = true;

    const isRegeneration = (
      this._pendingRegeneration
      && session.pendingRegeneration === this._pendingRegeneration
    );
    const profile = isRegeneration
      ? this._pendingRegeneration.profile
      : (
        session.profile
        && session.profile.schemaVersion === 2
      )
        ? session.profile
        : buildStyleProfile({
          analysisMode: session.analysisMode,
          appearance: session.features,
          preferences: session.preferences
        });
    const storage = createStorage(wx);
    const previousSession = {
      report: session.report,
      profile: session.profile
    };
    const previousStored = {
      report: storage.get(STORAGE_KEYS.REPORT, null),
      profile: storage.get(STORAGE_KEYS.PROFILE, null)
    };
    let report;
    try {
      const baseReport = generateReport(profile, {
        now: new Date().toISOString()
      });
      report = {
        ...baseReport,
        visualLayers: buildVisualLayers(baseReport, profile)
      };
    } catch (error) {
      session.report = previousSession.report;
      session.profile = previousSession.profile;
      this._finishGenerationFailure(
        session,
        previousSession.report,
        '生成过程未完成，已保留原报告'
      );
      return;
    }

    const saved = persistReport(storage, report);
    const profileAttempted = saved.ok;
    const profileSaved = profileAttempted
      ? persistProfile(storage, profile)
      : { ok: false };

    if (!saved.ok || !profileSaved.ok) {
      const reportRollback = this._restoreStoredValue(
        storage,
        previousStored.report,
        (value) => persistReport(storage, value),
        STORAGE_KEYS.REPORT
      );
      const profileRollback = !profileAttempted || profileSaved.ok
        ? { ok: true }
        : this._restoreStoredValue(
          storage,
          previousStored.profile,
          (value) => persistProfile(storage, value),
          STORAGE_KEYS.PROFILE
        );

      if (reportRollback.ok && profileRollback.ok) {
        if (isRegeneration) {
          session.report = previousSession.report;
          session.profile = previousSession.profile;
          this._finishGenerationFailure(
            session,
            previousSession.report,
            previousSession.report
              ? '重新生成未完成，已保留原报告'
              : '重新生成未完成，未更改原有报告'
          );
          return;
        }

        session.profile = profile;
        session.report = report;
        this.setData({
          statusText: '建议已经准备好，本次未保存历史',
          reportReady: true
        });
        wx.showToast({
          title: '报告未保存，历史不会保留',
          icon: 'none'
        });
        this._scheduleAutomaticNavigation(this._lifecycleToken);
        return;
      }

      const durable = this._reconcileDurablePair(
        storage,
        report,
        profile,
        previousStored
      );
      const durableIsGenerated = (
        durable.matches
        && durable.report.id === report.id
      );
      if (durableIsGenerated) {
        session.report = durable.report;
        session.profile = durable.profile;
        if (isRegeneration) {
          delete session.pendingRegeneration;
          this._pendingRegeneration = null;
          this._regenerationCommitted = true;
        }
        this.setData({
          statusText: '建议已经准备好，已恢复本机保存',
          reportReady: true
        });
        this._scheduleAutomaticNavigation(this._lifecycleToken);
        return;
      }

      if (!isRegeneration) {
        session.profile = profile;
        session.report = report;
        this.setData({
          statusText: '建议已经准备好，本次未保存历史',
          reportReady: true
        });
        wx.showToast({
          title: '报告未保存，历史不会保留',
          icon: 'none'
        });
        this._scheduleAutomaticNavigation(this._lifecycleToken);
        return;
      }

      if (durable.matches) {
        session.report = durable.report;
        session.profile = durable.profile;
        this._finishGenerationFailure(
          session,
          durable.report,
          durable.report
            ? '重新生成未完成，已保留原报告'
            : '重新生成未完成，未更改原有报告'
        );
        return;
      }

      session.report = null;
      session.profile = durable.profile;
      this._finishGenerationFailure(
        session,
        null,
        '重新生成未完成，本机未保留可用报告'
      );
      return;
    }

    session.profile = profile;
    session.report = report;
    if (isRegeneration) {
      delete session.pendingRegeneration;
      this._pendingRegeneration = null;
      this._regenerationCommitted = true;
    }

    this.setData({
      statusText: '建议已经准备好',
      reportReady: true
    });
    this._scheduleAutomaticNavigation(this._lifecycleToken);
  },

  _restoreStoredValue(storage, snapshot, persist, key) {
    if (!snapshot.ok) return { ok: false };
    if (snapshot.value === null) return storage.remove(key);
    return persist(snapshot.value);
  },

  _readDurablePair(storage) {
    const reportResult = storage.get(STORAGE_KEYS.REPORT, null);
    const profileResult = storage.get(STORAGE_KEYS.PROFILE, null);
    const report = (
      reportResult.ok && isUsableReport(reportResult.value)
    ) ? reportResult.value : null;
    const profile = (
      profileResult.ok
      && profileResult.value
      && profileResult.value.schemaVersion === 2
    ) ? profileResult.value : null;
    return {
      report,
      profile,
      matches: isReportForProfile(report, profile)
    };
  },

  _reconcileDurablePair(storage, report, profile, previousStored) {
    let durable = this._readDurablePair(storage);
    if (durable.matches) return durable;

    let matchingProfile = null;
    if (durable.report?.id === report.id) {
      matchingProfile = profile;
    } else if (
      previousStored.report.ok
      && previousStored.profile.ok
      && durable.report?.id === previousStored.report.value?.id
    ) {
      matchingProfile = previousStored.profile.value;
    }

    if (matchingProfile?.schemaVersion === 2) {
      persistProfile(storage, matchingProfile);
      durable = this._readDurablePair(storage);
      if (durable.matches) return durable;
    }

    storage.remove(STORAGE_KEYS.REPORT);
    durable = this._readDurablePair(storage);
    if (!durable.report) return durable;

    storage.remove(STORAGE_KEYS.PROFILE);
    return {
      report: null,
      profile: null,
      matches: false
    };
  },

  _finishGenerationFailure(session, report, statusText) {
    if (
      this._pendingRegeneration
      && session.pendingRegeneration === this._pendingRegeneration
    ) {
      delete session.pendingRegeneration;
    }
    this._pendingRegeneration = null;
    const reportReady = isUsableReport(report);
    this.setData({ statusText, reportReady });
    wx.showToast({
      title: reportReady
        ? '暂时无法重新生成，已保留可用报告'
        : '暂时无法生成报告，请重新开始',
      icon: 'none'
    });
    if (reportReady) {
      this._scheduleAutomaticNavigation(this._lifecycleToken);
      return;
    }
    wx.reLaunch({ url: '/pages/home/index' });
  },

  _scheduleAutomaticNavigation(token) {
    this._schedule(() => {
      if (this._isActive(token)) this.onViewReport();
    }, 1200);
  },

  onViewReport() {
    if (!this.data.reportReady || this.data.navigating) return;
    const routeToken = this._navigationGuard.begin();
    this.setData({ navigating: true });
    safeRedirect(
      wx,
      '/pages/result/index',
      '/pages/result/index',
      () => (
        !this._unloaded
        && this._navigationGuard.isCurrent(routeToken)
      ),
      () => this.setData({ navigating: false })
    );
  }
});

module.exports = { STAGES, STAGE_DELAYS };
