const PHOTO_LIMITS = Object.freeze({
  minWidth: 480,
  minHeight: 480,
  maxBytes: 10 * 1024 * 1024,
  minAspect: 0.55,
  maxAspect: 1.8
});

const COPY_RULES = Object.freeze({
  localProcessingOnly: true,
  noAppearanceScoring: true,
  noIdentityInference: true
});

module.exports = { PHOTO_LIMITS, COPY_RULES };
