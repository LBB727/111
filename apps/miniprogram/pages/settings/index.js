const { createStorage } = require('../../services/storage');
const {
  createPrivacyService,
  clearFeedbackSummary
} = require('../../services/privacy');
const { createOperationGuard } = require('../../utils/operation-guard');
const { STORAGE_KEYS } = require('../../config/storage-keys');

function showToast(title, icon = 'none') {
  wx.showToast({ title, icon });
}

const STORAGE_CATEGORY_LABELS = Object.freeze({
  [STORAGE_KEYS.CONSENT]: '同意记录',
  [STORAGE_KEYS.PROFILE]: '档案',
  [STORAGE_KEYS.REPORT]: '报告',
  [STORAGE_KEYS.FAVORITES]: '收藏',
  [STORAGE_KEYS.FEEDBACK]: '反馈'
});
const FEEDBACK_CLEAR_LABELS = Object.freeze({
  [STORAGE_KEYS.PROFILE]: '档案中的反馈影响',
  [STORAGE_KEYS.REPORT]: '旧报告',
  [STORAGE_KEYS.FEEDBACK]: '反馈记录'
});

function failedDeletionMessage(failedKeys) {
  const labels = failedKeys
    .map((key) => STORAGE_CATEGORY_LABELS[key])
    .filter(Boolean);
  return `删除失败：${labels.join('、')}，请重试`;
}

function feedbackClearFailureMessage(failedKeys) {
  const labels = failedKeys
    .map((key) => FEEDBACK_CLEAR_LABELS[key])
    .filter(Boolean);
  return `未完全清除：${labels.join('、')}，请重试`;
}

function clearSessionFeedbackSummaries(session) {
  const nextSession = { ...session };
  if (
    nextSession.profile
    && typeof nextSession.profile === 'object'
    && !Array.isArray(nextSession.profile)
  ) {
    nextSession.profile = clearFeedbackSummary(nextSession.profile);
  }
  const pending = nextSession.pendingRegeneration;
  if (
    pending
    && typeof pending === 'object'
    && !Array.isArray(pending)
    && pending.profile
    && typeof pending.profile === 'object'
    && !Array.isArray(pending.profile)
  ) {
    nextSession.pendingRegeneration = {
      ...pending,
      profile: clearFeedbackSummary(pending.profile)
    };
  }
  return nextSession;
}

Page({
  data: {
    deletingAll: false
  },

  onLoad() {
    this.storage = createStorage(wx);
    this.privacy = createPrivacyService(this.storage, () => new Date());
    this._lifecycleGuard = createOperationGuard();
    this._lifecycleToken = this._lifecycleGuard.begin();
    this._deletingAll = false;
    this._pendingGranular = '';
  },

  onUnload() {
    if (this._lifecycleGuard) this._lifecycleGuard.invalidate();
  },

  confirmGranularDeletion(key, options) {
    if (this._pendingGranular) return;
    this._pendingGranular = key;
    const token = this._lifecycleToken;
    let settled = false;
    const isCurrent = () => (
      this._lifecycleGuard
      && this._lifecycleGuard.isCurrent(token)
    );
    const release = () => {
      if (!isCurrent()) return;
      this._pendingGranular = '';
    };
    const fail = () => {
      if (settled || !isCurrent()) return;
      settled = true;
      release();
      showToast('暂时无法确认，请重试');
    };

    try {
      wx.showModal({
        title: options.title,
        content: options.content,
        confirmText: '确认清除',
        confirmColor: '#a35449',
        success: ({ confirm } = {}) => {
          if (settled || !isCurrent()) return;
          settled = true;
          if (!confirm) {
            release();
            return;
          }
          const result = options.clear();
          release();
          if (!result.ok) {
            showToast(
              typeof options.failure === 'function'
                ? options.failure(result)
                : options.failure
            );
            return;
          }
          showToast(options.success, 'success');
        },
        fail
      });
    } catch (error) {
      fail();
    }
  },

  onClearPhoto() {
    this.confirmGranularDeletion('photo', {
      title: '清除当前照片？',
      content: '只清除当前会话中的临时照片路径，不影响设备原图。',
      success: '当前照片已清除',
      failure: '当前照片清除失败，请重试',
      clear: () => {
        const app = getApp();
        app.globalData.session = {
          ...app.globalData.session,
          photoKind: '',
          photoPath: '',
          photoMeta: null,
          qualityResult: null,
          appearanceCandidates: null
        };
        return { ok: true };
      }
    });
  },

  onClearProfile() {
    this.confirmGranularDeletion('profile', {
      title: '清除本地档案？',
      content: '只删除本机保存的造型档案，不删除当前照片、报告、收藏或反馈。',
      success: '档案已清除',
      failure: '档案删除失败，请重试',
      clear: () => {
        const result = this.privacy.clearProfile();
        if (!result.ok) return result;
        const app = getApp();
        app.globalData.session = {
          ...app.globalData.session,
          profileDraft: null,
          features: null,
          preferences: null,
          profile: null
        };
        delete app.globalData.session.preferencesDraft;
        delete app.globalData.session.preferencesDraftContext;
        return result;
      }
    });
  },

  onClearReport() {
    this.confirmGranularDeletion('report', {
      title: '清除报告？',
      content: '只删除已生成的本地建议报告。',
      success: '报告已清除',
      failure: '报告删除失败，请重试',
      clear: () => {
        const result = this.privacy.clearReport();
        if (!result.ok) return result;
        const app = getApp();
        app.globalData.session = {
          ...app.globalData.session,
          report: null
        };
        return result;
      }
    });
  },

  onClearFavorites() {
    this.confirmGranularDeletion('favorites', {
      title: '清除收藏？',
      content: '只删除保存在本机的收藏内容。',
      success: '收藏已清除',
      failure: '收藏删除失败，请重试',
      clear: () => this.privacy.clearFavorites()
    });
  },

  onClearFeedback() {
    this.confirmGranularDeletion('feedback', {
      title: '清除反馈与旧报告？',
      content: '会清除反馈及其影响的旧报告，并从档案中移除反馈摘要；场景、偏好与外貌确认等档案基础信息会保留。',
      success: '反馈及旧报告已清除',
      failure: ({ failedKeys } = {}) => feedbackClearFailureMessage(
        Array.isArray(failedKeys)
          ? failedKeys
          : [
            STORAGE_KEYS.PROFILE,
            STORAGE_KEYS.REPORT,
            STORAGE_KEYS.FEEDBACK
          ]
      ),
      clear: () => {
        const result = this.privacy.clearFeedback();
        const app = getApp();
        const failedKeys = Array.isArray(result.failedKeys)
          ? result.failedKeys
          : [
            STORAGE_KEYS.PROFILE,
            STORAGE_KEYS.REPORT,
            STORAGE_KEYS.FEEDBACK
          ];
        let session = { ...app.globalData.session };
        if (!failedKeys.includes(STORAGE_KEYS.PROFILE)) {
          session = clearSessionFeedbackSummaries(session);
        }
        if (!failedKeys.includes(STORAGE_KEYS.REPORT)) {
          session.report = null;
        }
        app.globalData.session = session;
        return result;
      }
    });
  },

  onClearAll() {
    if (this._deletingAll) return;

    this._deletingAll = true;
    this.setData({ deletingAll: true });
    const token = this._lifecycleToken;
    let modalSettled = false;

    const isCurrent = () => (
      this._lifecycleGuard
      && this._lifecycleGuard.isCurrent(token)
    );
    const release = () => {
      if (!isCurrent()) return;
      this._deletingAll = false;
      this.setData({ deletingAll: false });
    };
    const handleModalFailure = () => {
      if (modalSettled || !isCurrent()) return;
      modalSettled = true;
      release();
      showToast('暂时无法确认，请重试');
    };

    const modalOptions = {
      title: '清除全部本地数据？',
      content: '同意记录、档案、报告、收藏和反馈都会删除，此操作无法撤销。',
      confirmText: '确认清除',
      confirmColor: '#a35449',
      success: ({ confirm } = {}) => {
        if (modalSettled || !isCurrent()) return;
        modalSettled = true;

        if (!confirm) {
          release();
          return;
        }

        const result = this.privacy.clearAll();
        if (!result.ok) {
          const failedKeys = Array.isArray(result.failedKeys)
            ? result.failedKeys
            : Object.values(STORAGE_KEYS);
          const app = getApp();
          const consentRemoved = !failedKeys.includes(STORAGE_KEYS.CONSENT);
          if (consentRemoved) {
            app.resetSession();
          } else {
            const reconciledSession = { ...app.globalData.session };
            if (!failedKeys.includes(STORAGE_KEYS.PROFILE)) {
              reconciledSession.profileDraft = null;
              reconciledSession.features = null;
              reconciledSession.preferences = null;
              reconciledSession.profile = null;
              delete reconciledSession.pendingRegeneration;
            }
            if (!failedKeys.includes(STORAGE_KEYS.REPORT)) {
              reconciledSession.report = null;
            }
            app.globalData.session = reconciledSession;
          }
          release();
          showToast(failedDeletionMessage(failedKeys));
          if (consentRemoved) {
            const redirectToConsent = () => {
              try {
                wx.redirectTo({ url: '/pages/consent/index' });
              } catch (error) {
                // The revoked session remains protected by every flow gate.
              }
            };
            try {
              wx.reLaunch({
                url: '/pages/consent/index',
                fail: redirectToConsent
              });
            } catch (error) {
              redirectToConsent();
            }
          }
          return;
        }

        getApp().resetSession();
        let navigationSettled = false;
        const handleNavigationFailure = () => {
          if (navigationSettled || !isCurrent()) return;
          navigationSettled = true;
          release();
          showToast('数据已清除，请手动返回首页');
        };

        try {
          wx.reLaunch({
            url: '/pages/home/index',
            success: () => {
              if (navigationSettled || !isCurrent()) return;
              navigationSettled = true;
            },
            fail: handleNavigationFailure
          });
        } catch (error) {
          handleNavigationFailure();
        }
      },
      fail: handleModalFailure
    };

    try {
      wx.showModal(modalOptions);
    } catch (error) {
      handleModalFailure();
    }
  }
});
