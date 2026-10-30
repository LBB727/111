const { STORAGE_KEYS } = require('../config/storage-keys');

const FEEDBACK_SUMMARY_FIELDS = Object.freeze([
  'likedRuleIds',
  'rejectedRuleIds',
  'ownedRuleIds',
  'triedRuleIds',
  'suppressedFamilies'
]);

function clearFeedbackSummary(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return profile;
  }
  return {
    ...profile,
    feedbackSummary: Object.fromEntries(
      FEEDBACK_SUMMARY_FIELDS.map((field) => [field, []])
    )
  };
}

function createPrivacyService(storage, now) {
  return {
    recordConsent(mode = 'photo') {
      const value = {
        version: 'demo-1.0',
        acceptedAt: now().toISOString(),
        adult: true
      };
      if (mode === 'photo') {
        value.ownPhoto = true;
        value.photoProcessing = true;
      } else {
        value.mode = 'manual';
      }
      const result = storage.set(STORAGE_KEYS.CONSENT, value);
      return result.ok ? { ok: true, value } : result;
    },

    getConsent() {
      return storage.get(STORAGE_KEYS.CONSENT, null);
    },

    clearProfile() {
      return storage.remove(STORAGE_KEYS.PROFILE);
    },

    clearReport() {
      return storage.remove(STORAGE_KEYS.REPORT);
    },

    clearFavorites() {
      return storage.remove(STORAGE_KEYS.FAVORITES);
    },

    clearFeedback() {
      const failedKeys = [];
      const storedProfile = storage.get(STORAGE_KEYS.PROFILE, null);
      if (!storedProfile.ok) {
        failedKeys.push(STORAGE_KEYS.PROFILE);
      } else if (
        storedProfile.value
        && typeof storedProfile.value === 'object'
        && !Array.isArray(storedProfile.value)
      ) {
        const savedProfile = storage.set(
          STORAGE_KEYS.PROFILE,
          clearFeedbackSummary(storedProfile.value)
        );
        if (!savedProfile.ok) failedKeys.push(STORAGE_KEYS.PROFILE);
      }
      for (const key of [STORAGE_KEYS.REPORT, STORAGE_KEYS.FEEDBACK]) {
        if (!storage.remove(key).ok) failedKeys.push(key);
      }
      return {
        ok: failedKeys.length === 0,
        failedKeys
      };
    },

    clearAll() {
      return storage.removeMany(Object.values(STORAGE_KEYS));
    }
  };
}

module.exports = { createPrivacyService, clearFeedbackSummary };
