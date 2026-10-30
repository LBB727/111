const HOME_ROUTE = '/pages/home/index';
const CONSENT_ROUTE = '/pages/consent/index';
const PROFILE_ROUTE = '/pages/profile/index';
const CAPTURE_ROUTE = '/pages/capture/index';
const QUALITY_CHECK_ROUTE = '/pages/quality-check/index';
const FEATURE_REVIEW_ROUTE = '/pages/feature-review/index';
const PREFERENCES_ROUTE = '/pages/preferences/index';
const PROCESSING_ROUTE = '/pages/processing/index';
const RESULT_ROUTE = '/pages/result/index';

function isAnalysisMode(mode) {
  return mode === 'manual' || mode === 'photo';
}

function hasConsentTicket(ticket, mode) {
  if (!ticket || typeof ticket !== 'object' || ticket.adult !== true) return false;
  if (mode === 'manual') return ticket.mode === 'manual';
  if (mode === 'photo') {
    return ticket.mode === 'photo'
      && ticket.ownPhoto === true
      && ticket.photoProcessing === true;
  }

  return ticket.ownPhoto === true && ticket.photoProcessing === true;
}

function hasPhoto(session) {
  return ['portrait', 'fullBody'].includes(session.photoKind)
    && Boolean(session.photoPath)
    && Boolean(session.photoMeta);
}

function nextRequiredRoute(session = {}) {
  const mode = session.analysisMode;
  if (!isAnalysisMode(mode)) return HOME_ROUTE;
  if (!hasConsentTicket(session.consentTicket, mode)) return CONSENT_ROUTE;
  if (!session.profileDraft) return PROFILE_ROUTE;
  if (mode === 'photo' && !hasPhoto(session)) return CAPTURE_ROUTE;
  if (mode === 'photo' && (!session.qualityResult || session.qualityResult.passed !== true)) {
    return QUALITY_CHECK_ROUTE;
  }
  if (!session.features) return FEATURE_REVIEW_ROUTE;
  if (!session.preferences) return PREFERENCES_ROUTE;
  if (session.report) return RESULT_ROUTE;
  return PROCESSING_ROUTE;
}

function clearPhotoState(session = {}) {
  return {
    ...session,
    photoKind: '',
    photoPath: '',
    photoMeta: null,
    qualityResult: null,
    appearanceCandidates: null,
    features: null
  };
}

module.exports = { clearPhotoState, hasConsentTicket, isAnalysisMode, nextRequiredRoute };
