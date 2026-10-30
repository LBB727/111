const { createStorage } = require('../../services/storage');
const {
  FEEDBACK_STATES,
  createFeedbackRecommendationRegistry,
  createPendingRegeneration,
  toggleFavorite,
  setFeedback,
  summarizeFeedback,
  normalizeFeedbackMap,
  removeExpiredReport,
  isUsableReport
} = require('../../services/report-state');
const {
  isReportForProfile
} = require('../../services/recommendation-engine');
const { buildStyleProfile } = require('../../services/profile-contract');
const { STORAGE_KEYS } = require('../../config/storage-keys');
const { createOperationGuard } = require('../../utils/operation-guard');

const REPORT_SECTION_META = Object.freeze([
  Object.freeze({ key: 'basis', title: '本次由用户确认的依据' }),
  Object.freeze({ key: 'top', title: '今日最值得先尝试的三项' }),
  Object.freeze({ key: 'color', title: '具体色彩方案' }),
  Object.freeze({ key: 'overall', title: '整体穿搭示意图' }),
  Object.freeze({ key: 'collage', title: '单品拼贴卡' }),
  Object.freeze({ key: 'technical', title: '核心服装结构图' }),
  Object.freeze({ key: 'hair', title: '发型与发色' }),
  Object.freeze({ key: 'makeup', title: '妆造' }),
  Object.freeze({ key: 'accessories', title: '配饰与眼镜' }),
  Object.freeze({ key: 'scene', title: '场合切换' }),
  Object.freeze({ key: 'alternatives', title: '替代方案' }),
  Object.freeze({ key: 'rationale', title: '推荐理由与趋势有效期' })
]);
const DEFAULT_EXPANDED_SECTIONS = Object.freeze({
  basis: true,
  top: true,
  color: false,
  overall: true,
  collage: true,
  technical: true,
  hair: false,
  makeup: false,
  accessories: false,
  scene: false,
  alternatives: false,
  rationale: false
});
const SECTION_TARGETS = Object.freeze({
  basis: 'section-basis',
  top: 'section-top',
  color: 'section-color',
  overall: 'section-overall',
  collage: 'section-collage',
  technical: 'section-technical',
  hair: 'section-hair',
  makeup: 'section-makeup',
  accessories: 'section-accessories',
  scene: 'section-scene',
  alternatives: 'section-alternatives',
  rationale: 'section-rationale'
});
const EVIDENCE_SECTION_BY_FAMILY = Object.freeze({
  color: Object.freeze({ section: 'color', target: 'section-color' }),
  clothing: Object.freeze({ section: 'technical', target: 'section-technical' }),
  hairColor: Object.freeze({ section: 'hair', target: 'section-hair' })
});
const SECTION_META = Object.freeze([
  Object.freeze({ key: 'hairColor', title: '推荐色彩' }),
  Object.freeze({ key: 'hair', title: '发型' }),
  Object.freeze({ key: 'clothing', title: '服装' }),
  Object.freeze({ key: 'accessories', title: '眼镜与配饰' }),
  Object.freeze({ key: 'makeup', title: '眉形与妆容' }),
  Object.freeze({ key: 'sceneTransition', title: '场景胶囊搭配' })
]);
const CATEGORY_LABELS = Object.freeze(
  SECTION_META.reduce((labels, section) => ({
    ...labels,
    [section.key]: section.title
  }), {})
);

function basisLabels(recommendation) {
  return recommendation.confirmedBasis.map(({ label, value }) => (
    `${label}：${value}`
  ));
}

function maintenanceBudgetTip(recommendation) {
  if (recommendation.family === 'hairColor') {
    const maintenanceLabels = {
      low: '低维护',
      medium: '中等维护',
      high: '较高维护'
    };
    const maintenance = maintenanceLabels[recommendation.maintenanceLevel]
      || '先确认维护频率';
    return `维护：${maintenance}；预算：染发前先确认报价与后续补色成本。`;
  }
  if (recommendation.family === 'hair' || recommendation.family === 'makeup') {
    return '维护/预算：先用现有用品尝试，确认舒适和频率后再添置。';
  }
  return '维护/预算：优先用现有单品试搭，确认活动舒适后再决定是否新增。';
}

function trendValidUntil(recommendation, report) {
  if (recommendation.trendValidUntil) return recommendation.trendValidUntil;
  const trend = report.trendMeta;
  const appliedRuleIds = recommendation.appliedRuleIds || [];
  const isAppliedTrend = (
    trend.enabled
    && trend.validUntil
    && appliedRuleIds.some((id) => trend.appliedRuleIds.includes(id))
  );
  return isAppliedTrend ? trend.validUntil : '';
}

function buildRecommendation(
  recommendation,
  report,
  favoriteIds,
  feedbackMap,
  feedbackRegistry
) {
  const feedback = feedbackMap[recommendation.id];
  return {
    ...recommendation,
    basisLabels: basisLabels(recommendation),
    maintenanceBudgetTip: maintenanceBudgetTip(recommendation),
    trendValidUntil: trendValidUntil(recommendation, report),
    favorite: favoriteIds.includes(recommendation.id),
    feedback: feedback?.state || feedback || '',
    feedbackEligible: (
      feedbackRegistry.valid
      && feedbackRegistry.recommendations.get(recommendation.id)
        === recommendation
    )
  };
}

function buildSections(report, favoriteIds, feedbackMap, feedbackRegistry) {
  const registry = feedbackRegistry
    || createFeedbackRecommendationRegistry(report);
  return SECTION_META.map((section) => ({
    ...section,
    recommendations: report.sections[section.key].map((recommendation) => (
      buildRecommendation(
        recommendation,
        report,
        favoriteIds,
        feedbackMap,
        registry
      )
    ))
  }));
}

function buildTopRecommendations(report) {
  return report.topRecommendations.slice(0, 3).map((recommendation) => ({
    ...recommendation,
    categoryLabel: CATEGORY_LABELS[recommendation.family] || '色彩方案',
    evidenceSection: EVIDENCE_SECTION_BY_FAMILY[recommendation.family]?.section
      || 'rationale',
    evidenceTarget: EVIDENCE_SECTION_BY_FAMILY[recommendation.family]?.target
      || 'section-rationale'
  }));
}

function findRecommendations(sections, keys) {
  return keys.flatMap((key) => (
    sections.find((section) => section.key === key)?.recommendations || []
  ));
}

function buildReportViewData(report, favoriteIds, feedbackMap) {
  const feedbackRegistry = createFeedbackRecommendationRegistry(report);
  const sections = buildSections(
    report,
    favoriteIds,
    feedbackMap,
    feedbackRegistry
  );
  const allRecommendations = sections.flatMap(({ recommendations }) => recommendations);
  return {
    report,
    topRecommendations: buildTopRecommendations(report),
    sections,
    clothingRecommendations: findRecommendations(sections, ['clothing']),
    hairRecommendations: findRecommendations(sections, ['hair', 'hairColor']),
    makeupRecommendations: findRecommendations(sections, ['makeup']),
    accessoryRecommendations: findRecommendations(sections, ['accessories']),
    sceneRecommendations: findRecommendations(sections, ['sceneTransition']),
    alternativeItems: allRecommendations.map(({ id, action, alternative }) => ({
      id,
      action,
      alternative
    })),
    rationaleItems: allRecommendations.map(({ id, action, reason }) => ({
      id,
      action,
      reason
    })),
    trendSummary: report.trendMeta.enabled && report.trendMeta.validUntil
      ? `本次采用的趋势建议有效至 ${report.trendMeta.validUntil}`
      : '本次未采用有时效限制的趋势项，建议仍以已确认场景与舒适度为准。'
  };
}

function showSliceReadWarning(favoritesReady, feedbackReady) {
  if (favoritesReady && feedbackReady) return;

  let title = '收藏与反馈暂不可用，请稍后重试';
  if (favoritesReady) title = '反馈暂不可用，请稍后重试';
  if (feedbackReady) title = '收藏暂不可用，请稍后重试';
  wx.showToast({ title, icon: 'none' });
}

function normalizedProfile(value, feedbackSummary) {
  if (!value || value.schemaVersion !== 2) return null;
  return buildStyleProfile({
    analysisMode: value.analysisMode,
    appearance: value.confirmedAppearance,
    preferences: value,
    feedbackSummary: feedbackSummary || value.feedbackSummary
  });
}

function feedbackRecommendation(report, recommendationId) {
  const registry = createFeedbackRecommendationRegistry(report);
  if (!registry.valid) return null;
  return registry.recommendations.get(recommendationId) || null;
}

function readFeedback(storage) {
  const result = storage.get(STORAGE_KEYS.FEEDBACK, {});
  if (!result.ok) return { ok: false, value: {} };

  const value = normalizeFeedbackMap(result.value);
  if (JSON.stringify(value) !== JSON.stringify(result.value || {})) {
    const migrated = storage.set(STORAGE_KEYS.FEEDBACK, value);
    if (!migrated.ok) return { ok: false, value };
  }
  return { ok: true, value };
}

Page({
  data: {
    report: null,
    reportSections: REPORT_SECTION_META,
    topRecommendations: [],
    sections: [],
    clothingRecommendations: [],
    hairRecommendations: [],
    makeupRecommendations: [],
    accessoryRecommendations: [],
    sceneRecommendations: [],
    alternativeItems: [],
    rationaleItems: [],
    trendSummary: '',
    expandedSections: { ...DEFAULT_EXPANDED_SECTIONS },
    favoriteIds: [],
    feedbackMap: {},
    favoritesReady: false,
    feedbackReady: false,
    confirmingReset: false
  },

  onLoad() {
    this.storage = createStorage(wx);
    this._lifecycleGuard = createOperationGuard();
    this._lifecycleToken = this._lifecycleGuard.begin();
    this._confirmingReset = false;
    this._resetConfirmation = null;
    this._resetRelaunchOperation = null;
    this._awaitingSettingsReturn = false;

    const app = getApp();
    delete app.globalData.session.pendingRegeneration;
    const sessionReport = app.globalData.session.report;
    if (!isUsableReport(sessionReport)) {
      const storedReportBeforeExpiry = this.storage.get(STORAGE_KEYS.REPORT, null);
      const storedProfileBeforeExpiry = this.storage.get(STORAGE_KEYS.PROFILE, null);
      const expired = removeExpiredReport(this.storage, new Date());
      if (expired.expired) {
        app.globalData.session.report = null;
        this.report = null;
        this.setData({ report: null });
        const token = this._lifecycleToken;
        let promptSettled = false;
        const returnHome = (warning) => {
          delete app.globalData.session.pendingRegeneration;
          if (!this._lifecycleGuard.isCurrent(token)) return;
          if (warning) {
            wx.showToast({ title: warning, icon: 'none' });
          }
          try {
            wx.reLaunch({ url: '/pages/home/index' });
          } catch (error) {
            // The page stays inert if the host navigation API itself is unavailable.
          }
        };
        const failPrompt = () => {
          if (promptSettled) return;
          promptSettled = true;
          returnHome('暂时无法打开到期提示，已返回首页');
        };
        const modalOptions = {
          title: '趋势建议已到期',
          content: expired.removed
            ? '已移除过期趋势报告，请重新生成；稳定规则仍会继续参与建议。'
            : '过期报告暂时无法从本机删除，但不会继续展示。请重新生成以替换它，或稍后在“隐私与本地数据”中清除。',
          showCancel: false,
          confirmText: '重新生成',
          success: () => {
            if (promptSettled) return;
            promptSettled = true;
            if (!this._lifecycleGuard.isCurrent(token)) return;
            const feedback = readFeedback(this.storage);
            const feedbackReport = isUsableReport(
              storedReportBeforeExpiry.value
            )
              ? storedReportBeforeExpiry.value
              : null;
            const storedProfile = normalizedProfile(
              storedProfileBeforeExpiry.value
            );
            const profile = (
              isReportForProfile(
                storedReportBeforeExpiry.value,
                storedProfile
              )
            )
              ? normalizedProfile(
                storedProfile,
                summarizeFeedback(feedback.value, feedbackReport)
              )
              : null;
            if (profile) {
              const pendingRegeneration = createPendingRegeneration(profile);
              app.globalData.session.pendingRegeneration = pendingRegeneration;
              let navigationFailed = false;
              const failNavigation = () => {
                if (navigationFailed) return;
                navigationFailed = true;
                if (
                  app.globalData.session.pendingRegeneration
                  === pendingRegeneration
                ) {
                  delete app.globalData.session.pendingRegeneration;
                }
                returnHome('暂时无法重新生成，已返回首页');
              };
              try {
                wx.reLaunch({
                  url: '/pages/processing/index',
                  fail: failNavigation
                });
              } catch (error) {
                failNavigation();
              }
            } else {
              returnHome();
            }
          },
          fail: failPrompt
        };
        try {
          wx.showModal(modalOptions);
        } catch (error) {
          failPrompt();
        }
        return;
      }
    }

    const sessionProfile = normalizedProfile(app.globalData.session.profile);
    let report = null;
    if (isUsableReport(sessionReport)) {
      report = sessionReport;
      if (isReportForProfile(report, sessionProfile)) {
        app.globalData.session.profile = sessionProfile;
      } else {
        const storedProfileResult = this.storage.get(STORAGE_KEYS.PROFILE, null);
        const storedProfile = normalizedProfile(storedProfileResult.value);
        app.globalData.session.profile = (
          isReportForProfile(report, storedProfile)
        ) ? storedProfile : null;
      }
    } else {
      const storedReportResult = this.storage.get(STORAGE_KEYS.REPORT, null);
      const storedProfileResult = this.storage.get(STORAGE_KEYS.PROFILE, null);
      const storedProfile = normalizedProfile(storedProfileResult.value);
      if (
        storedReportResult.ok
        && storedProfileResult.ok
        && isUsableReport(storedReportResult.value)
        && isReportForProfile(storedReportResult.value, storedProfile)
      ) {
        report = storedReportResult.value;
        app.globalData.session.profile = storedProfile;
      }
    }

    if (!isUsableReport(report)) {
      app.globalData.session.report = null;
      wx.reLaunch({ url: '/pages/home/index' });
      return;
    }
    if (report !== sessionReport) app.globalData.session.report = report;

    const favoriteResult = this.storage.get(STORAGE_KEYS.FAVORITES, []);
    const feedbackResult = readFeedback(this.storage);
    const favoriteIds = favoriteResult.ok && Array.isArray(favoriteResult.value)
      ? favoriteResult.value
      : [];
    const feedbackMap = (
      feedbackResult.ok
      && feedbackResult.value
      && typeof feedbackResult.value === 'object'
      && !Array.isArray(feedbackResult.value)
    )
      ? feedbackResult.value
      : {};
    this._favoritesReady = favoriteResult.ok;
    this._feedbackReady = feedbackResult.ok;

    this.report = report;
    this.setData({
      ...buildReportViewData(report, favoriteIds, feedbackMap),
      favoriteIds,
      feedbackMap,
      favoritesReady: this._favoritesReady,
      feedbackReady: this._feedbackReady
    });

    showSliceReadWarning(this._favoritesReady, this._feedbackReady);
  },

  onShow() {
    if (!this._awaitingSettingsReturn || !this.storage) return;
    this._awaitingSettingsReturn = false;

    const report = getApp().globalData.session.report;
    if (!isUsableReport(report)) {
      this.report = null;
      this.setData({
        report: null,
        topRecommendations: [],
        sections: [],
        favoriteIds: [],
        feedbackMap: {},
        favoritesReady: false,
        feedbackReady: false
      });
      wx.reLaunch({
        url: '/pages/home/index',
        fail: () => {
          wx.showToast({
            title: '报告已清除，请返回首页',
            icon: 'none'
          });
        }
      });
      return;
    }

    const favoriteResult = this.storage.get(STORAGE_KEYS.FAVORITES, []);
    const feedbackResult = readFeedback(this.storage);
    const favoriteIds = favoriteResult.ok
      ? (
        Array.isArray(favoriteResult.value)
          ? favoriteResult.value
          : []
      )
      : [];
    const feedbackMap = feedbackResult.ok
      ? (
        feedbackResult.value
        && typeof feedbackResult.value === 'object'
        && !Array.isArray(feedbackResult.value)
          ? feedbackResult.value
          : {}
      )
      : {};
    this._favoritesReady = favoriteResult.ok;
    this._feedbackReady = feedbackResult.ok;

    this.report = report;
    this.setData({
      ...buildReportViewData(report, favoriteIds, feedbackMap),
      favoriteIds,
      feedbackMap,
      favoritesReady: this._favoritesReady,
      feedbackReady: this._feedbackReady
    });

    showSliceReadWarning(this._favoritesReady, this._feedbackReady);
  },

  onUnload() {
    if (this._lifecycleGuard) this._lifecycleGuard.invalidate();
  },

  onToggleSection(event) {
    const section = event.currentTarget?.dataset?.section;
    if (!Object.prototype.hasOwnProperty.call(SECTION_TARGETS, section)) return;
    this.setData({
      expandedSections: {
        ...this.data.expandedSections,
        [section]: !this.data.expandedSections[section]
      }
    });
  },

  onViewEvidence(event) {
    const section = event.currentTarget?.dataset?.section;
    const target = event.currentTarget?.dataset?.target;
    if (SECTION_TARGETS[section] !== target) return;
    this.setData({
      expandedSections: {
        ...this.data.expandedSections,
        [section]: true
      }
    });
    wx.pageScrollTo({ selector: `#${target}`, duration: 300 });
  },

  onFavoriteChange(event) {
    const id = event.detail && event.detail.id;
    if (!id || !this.report) return;
    if (!this._favoritesReady) {
      showSliceReadWarning(false, true);
      return;
    }

    const favoriteIds = toggleFavorite(this.data.favoriteIds, id);
    const saved = this.storage.set(STORAGE_KEYS.FAVORITES, favoriteIds);
    if (!saved.ok) {
      wx.showToast({ title: '收藏保存失败，请重试', icon: 'none' });
      return;
    }
    this.setData({
      favoriteIds,
      ...buildReportViewData(this.report, favoriteIds, this.data.feedbackMap)
    });
  },

  onFeedbackChange(event) {
    const detail = event.detail || {};
    if (
      !detail.id
      || !FEEDBACK_STATES.includes(detail.state)
      || !this.report
    ) return;
    if (!this._feedbackReady) {
      showSliceReadWarning(true, false);
      return;
    }
    const recommendation = feedbackRecommendation(this.report, detail.id);
    if (!recommendation) return;

    const feedbackMap = setFeedback(
      this.data.feedbackMap,
      detail.id,
      detail.state,
      recommendation.family
    );
    const saved = this.storage.set(STORAGE_KEYS.FEEDBACK, feedbackMap);
    if (!saved.ok) {
      wx.showToast({ title: '反馈保存失败，请重试', icon: 'none' });
      return;
    }
    this.setData({
      feedbackMap,
      ...buildReportViewData(this.report, this.data.favoriteIds, feedbackMap)
    });
  },

  onOpenSettings() {
    if (this._awaitingSettingsReturn) return;
    this._awaitingSettingsReturn = true;
    wx.navigateTo({
      url: '/pages/settings/index',
      fail: () => {
        this._awaitingSettingsReturn = false;
        wx.showToast({
          title: '暂时无法打开隐私设置',
          icon: 'none'
        });
      }
    });
  },

  onReanalyze() {
    if (this._confirmingReset) return;
    this._confirmingReset = true;
    this.setData({ confirmingReset: true });
    const token = this._lifecycleToken;
    const confirmation = {};
    this._resetConfirmation = confirmation;

    wx.showModal({
      title: '重新开始分析？',
      content: '有可用档案时会结合你的反馈重新生成；否则会重置本次会话。',
      confirmText: '重新开始',
      confirmColor: '#617560',
      success: ({ confirm }) => {
        if (
          this._resetConfirmation !== confirmation
          || !this._lifecycleGuard.isCurrent(token)
        ) return;
        this._resetConfirmation = null;
        if (!confirm) {
          this._confirmingReset = false;
          this.setData({ confirmingReset: false });
          return;
        }
        const app = getApp();
        const storedProfileResult = this.storage.get(STORAGE_KEYS.PROFILE, null);
        const sessionProfile = normalizedProfile(
          app.globalData.session.profile
        );
        const storedProfile = normalizedProfile(storedProfileResult.value);
        const sourceProfile = isReportForProfile(this.report, sessionProfile)
          ? sessionProfile
          : isReportForProfile(this.report, storedProfile)
            ? storedProfile
            : null;
        if (sourceProfile) {
          const profile = normalizedProfile(
            sourceProfile,
            summarizeFeedback(
              this._feedbackReady ? this.data.feedbackMap : {},
              this.report
            )
          );
          const pendingRegeneration = createPendingRegeneration(profile);
          this._pendingRegeneration = pendingRegeneration;
          app.globalData.session.pendingRegeneration = pendingRegeneration;
          wx.reLaunch({
            url: '/pages/processing/index',
            success: () => {},
            fail: () => {
              if (
                app.globalData.session.pendingRegeneration
                !== pendingRegeneration
              ) return;
              delete app.globalData.session.pendingRegeneration;
              if (this._pendingRegeneration === pendingRegeneration) {
                this._pendingRegeneration = null;
              }
              if (!this._lifecycleGuard.isCurrent(token)) return;
              this._confirmingReset = false;
              this.setData({ confirmingReset: false });
              wx.showToast({
                title: '暂时无法重新开始，请重试',
                icon: 'none'
              });
            }
          });
          return;
        }

        const resetRelaunchOperation = {};
        this._resetRelaunchOperation = resetRelaunchOperation;
        const consumeResetRelaunchOperation = () => {
          if (this._resetRelaunchOperation !== resetRelaunchOperation) {
            return false;
          }
          this._resetRelaunchOperation = null;
          return true;
        };
        app.resetSession();
        wx.reLaunch({
          url: '/pages/consent/index',
          success: () => {
            consumeResetRelaunchOperation();
          },
          fail: () => {
            if (!consumeResetRelaunchOperation()) return;
            if (!this._lifecycleGuard.isCurrent(token)) return;
            this._confirmingReset = false;
            this.setData({ confirmingReset: false });
            wx.showToast({
              title: '暂时无法重新开始，请重试',
              icon: 'none'
            });
          }
        });
      },
      fail: () => {
        if (
          this._resetConfirmation !== confirmation
          || !this._lifecycleGuard.isCurrent(token)
        ) return;
        this._resetConfirmation = null;
        this._confirmingReset = false;
        this.setData({ confirmingReset: false });
        wx.showToast({
          title: '暂时无法确认，请重试',
          icon: 'none'
        });
      }
    });
  }
});

module.exports = {
  DEFAULT_EXPANDED_SECTIONS,
  REPORT_SECTION_META,
  SECTION_META,
  buildReportViewData,
  buildSections,
  isUsableReport
};
