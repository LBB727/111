const createSession = () => ({
  analysisMode: '',
  consentTicket: null,
  profileDraft: null,
  photoKind: '',
  photoPath: '',
  photoMeta: null,
  qualityResult: null,
  appearanceCandidates: null,
  features: null,
  preferences: null,
  profile: null,
  report: null
});

App({
  globalData: { session: createSession() },
  resetSession() {
    this.globalData.session = createSession();
  }
});
