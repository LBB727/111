function freezeTrendRule(rule) {
  return Object.freeze({
    ...rule,
    scene: Object.freeze([...rule.scene]),
    source: Object.freeze({ ...rule.source }),
    techniques: Object.freeze(Object.fromEntries(
      Object.entries(rule.techniques).map(([key, values]) => [
        key,
        Object.freeze([...values])
      ])
    ))
  });
}

const TREND_RULES = Object.freeze([
  freezeTrendRule({
    ruleId: 'trend-cn-lightweight-modern-chinese',
    market: 'CN',
    sourceScope: 'CN',
    scene: ['commute', 'date', 'party', 'formal'],
    layer: 'trend',
    validFrom: '2025-02-08',
    expiresOn: '2027-02-08',
    evidenceUrl: 'https://www.cntac.org.cn/zixun/hangye/202502/t20250208_4376587.html',
    lastReviewed: '2026-07-29',
    source: {
      title: '中国纺织工业联合会转载行业报道',
      publishedOn: '2025-02-08',
      evidenceUrl: 'https://www.cntac.org.cn/zixun/hangye/202502/t20250208_4376587.html'
    },
    techniques: {
      colorIds: ['ivory', 'black', 'brickRed', 'teal'],
      silhouetteIds: ['singleBreastedBlazer', 'waistDefinedShirtDress'],
      materialAppearanceIds: ['matteFluid', 'subtleLustre'],
      hairTechniqueIds: ['naturalTexture', 'cleanLowArrangement'],
      sceneTechniqueIds: ['oneOrTwoModernTraditionalElements', 'invitationRequirementsFirst']
    },
    recommendation: '可选用一至两个现代传统元素，与简洁现代单品组合。',
    extractionBoundary: '仅保存可组合的颜色、轮廓、材质、发型和场景技术。'
  }),
  freezeTrendRule({
    ruleId: 'trend-international-ss2026-color-families',
    market: 'CN',
    sourceScope: 'international',
    scene: ['commute', 'date', 'casual', 'party', 'travel'],
    layer: 'trend',
    validFrom: '2025-09-11',
    expiresOn: '2026-08-31',
    evidenceUrl: 'https://www.pantonecn.com/articles/fashion-color-trend-report/new-york-fashion-week-spring-summer-2026',
    lastReviewed: '2026-07-29',
    source: {
      title: 'Pantone 中国 2026 春夏报告',
      publishedOn: '2025-09-11',
      evidenceUrl: 'https://www.pantonecn.com/articles/fashion-color-trend-report/new-york-fashion-week-spring-summer-2026'
    },
    techniques: {
      colorIds: ['lavender', 'chocolate', 'pureWhite', 'royalBlue', 'forestGreen', 'sageGreen'],
      silhouetteIds: ['straightTrousers', 'lightweightOvershirt'],
      materialAppearanceIds: ['matteFluid', 'lightweightCrisp'],
      hairTechniqueIds: ['naturalTexture', 'singleColorFocus'],
      sceneTechniqueIds: ['seasonalColorAccent', 'neutralBaseWithOneAccent']
    },
    recommendation: '从已确认喜欢的季节色中选一处重点，并以跨季中性色保持可复用性。',
    extractionBoundary: '仅保存可组合的颜色、轮廓、材质、发型和场景技术。'
  })
]);

function isTrendRuleActive(rule, referenceDate) {
  if (
    !rule
    || typeof referenceDate !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)
  ) {
    return false;
  }
  return rule.validFrom <= referenceDate && referenceDate <= rule.expiresOn;
}

module.exports = { TREND_RULES, isTrendRuleActive };
