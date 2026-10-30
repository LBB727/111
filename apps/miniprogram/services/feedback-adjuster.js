const { compareRules } = require('./rule-resolver');

const FEEDBACK_ADJUSTMENTS = Object.freeze({
  liked: 30,
  owned: 20,
  tried: 10,
  'not-for-me': -80,
  'suppress-similar': -200
});

function values(value) {
  return new Set(Array.isArray(value) ? value : []);
}

function applyFeedbackScores(rules, feedbackSummary = {}) {
  const liked = values(feedbackSummary.likedRuleIds);
  const owned = values(feedbackSummary.ownedRuleIds);
  const tried = values(feedbackSummary.triedRuleIds);
  const rejected = values(feedbackSummary.rejectedRuleIds);
  const suppressed = values(feedbackSummary.suppressedFamilies);

  return (Array.isArray(rules) ? rules : [])
    .map((rule) => ({
      ...rule,
      priority: rule.priority
        + (liked.has(rule.id) ? FEEDBACK_ADJUSTMENTS.liked : 0)
        + (owned.has(rule.id) ? FEEDBACK_ADJUSTMENTS.owned : 0)
        + (tried.has(rule.id) ? FEEDBACK_ADJUSTMENTS.tried : 0)
        + (rejected.has(rule.id) ? FEEDBACK_ADJUSTMENTS['not-for-me'] : 0)
        + (suppressed.has(rule.family) ? FEEDBACK_ADJUSTMENTS['suppress-similar'] : 0)
    }))
    .sort(compareRules);
}

module.exports = { FEEDBACK_ADJUSTMENTS, applyFeedbackScores };
