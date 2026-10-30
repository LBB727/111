function freezeStyleRuleV2(rule) {
  return Object.freeze({
    ...rule,
    scene: Object.freeze([...rule.scene]),
    requiredInputs: Object.freeze([...rule.requiredInputs]),
    confirmedInputs: Object.freeze(rule.confirmedInputs.map(Object.freeze)),
    recommendation: Object.freeze({
      colorIds: Object.freeze([...rule.recommendation.colorIds]),
      garmentTemplateIds: Object.freeze([...rule.recommendation.garmentTemplateIds])
    })
  });
}

const STYLE_RULES_V2 = Object.freeze([
  freezeStyleRuleV2({
    ruleId: 'garment-vertical-open-line',
    market: 'CN',
    sourceScope: 'CN',
    scene: ['commute', 'interview', 'date', 'formal'],
    layer: 'stable',
    validFrom: '2026-01-01',
    expiresOn: null,
    requiredInputs: ['desiredEffects'],
    confirmedInputs: [{ path: 'desiredEffects', includes: 'vertical' }],
    recommendation: {
      colorIds: ['navy', 'ivory', 'brickRed'],
      garmentTemplateIds: [
        'singleBreastedBlazer', 'crewNeckKnitTop', 'straightTrousers'
      ]
    },
    intendedVisualEffect: '延伸纵向线条',
    alternative: '用相近明度上下装替代长外层',
    confidence: 'high',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
    lastReviewed: '2026-07-29'
  }),
  freezeStyleRuleV2({
    ruleId: 'garment-soft-horizontal-break',
    market: 'CN',
    sourceScope: 'CN',
    scene: ['commute', 'date', 'casual', 'party'],
    layer: 'stable',
    validFrom: '2026-01-01',
    expiresOn: null,
    requiredInputs: ['desiredEffects', 'fitPreference'],
    confirmedInputs: [
      { path: 'desiredEffects', includes: 'soft' },
      { path: 'fitPreference', equals: 'relaxed' }
    ],
    recommendation: {
      colorIds: ['oatmeal', 'denimBlue', 'sageGreen'],
      garmentTemplateIds: ['relaxedCardigan', 'wideStraightTrousers']
    },
    intendedVisualEffect: '形成舒展的横向节奏',
    alternative: '保留直筒下装，仅将上层换成柔软针织',
    confidence: 'high',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
    lastReviewed: '2026-07-29'
  }),
  freezeStyleRuleV2({
    ruleId: 'garment-defined-shoulder-balance',
    market: 'CN',
    sourceScope: 'CN',
    scene: ['commute', 'interview', 'party', 'formal'],
    layer: 'stable',
    validFrom: '2026-01-01',
    expiresOn: null,
    requiredInputs: ['desiredEffects', 'scenes'],
    confirmedInputs: [
      { path: 'desiredEffects', includes: 'shoulderStructure' },
      { path: 'scenes', includes: 'interview' }
    ],
    recommendation: {
      colorIds: ['charcoal', 'navy', 'pureWhite'],
      garmentTemplateIds: ['singleBreastedBlazer', 'columnMidiSkirt']
    },
    intendedVisualEffect: '建立清楚的肩线与边界',
    alternative: '用挺括衬衫替代外套',
    confidence: 'high',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
    lastReviewed: '2026-07-29'
  }),
  freezeStyleRuleV2({
    ruleId: 'garment-waist-placement-choice',
    market: 'CN',
    sourceScope: 'CN',
    scene: ['date', 'casual', 'party', 'travel'],
    layer: 'stable',
    validFrom: '2026-01-01',
    expiresOn: null,
    requiredInputs: ['desiredEffects', 'fitPreference'],
    confirmedInputs: [
      { path: 'desiredEffects', includes: 'waistDefinition' },
      { path: 'fitPreference', equals: 'regular' }
    ],
    recommendation: {
      colorIds: ['chocolate', 'apricot', 'teal'],
      garmentTemplateIds: ['waistDefinedShirtDress', 'aLineMidiSkirt']
    },
    intendedVisualEffect: '用腰位变化组织上下比例',
    alternative: '用半塞衣角或短外层形成可调整的腰位',
    confidence: 'medium',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
    lastReviewed: '2026-07-29'
  }),
  freezeStyleRuleV2({
    ruleId: 'garment-monochrome-depth',
    market: 'CN',
    sourceScope: 'CN',
    scene: ['commute', 'interview', 'travel', 'formal'],
    layer: 'stable',
    validFrom: '2026-01-01',
    expiresOn: null,
    requiredInputs: ['desiredEffects'],
    confirmedInputs: [{ path: 'desiredEffects', includes: 'restrained' }],
    recommendation: {
      colorIds: ['navy', 'denimBlue', 'mistBlue'],
      garmentTemplateIds: ['straightTrousers', 'longSingleBreastedCoat']
    },
    intendedVisualEffect: '用同色系明度差形成连续层次',
    alternative: '在鞋履或内搭加入一处邻近色',
    confidence: 'high',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
    lastReviewed: '2026-07-29'
  }),
  freezeStyleRuleV2({
    ruleId: 'garment-travel-layering',
    market: 'CN',
    sourceScope: 'CN',
    scene: ['travel'],
    layer: 'stable',
    validFrom: '2026-01-01',
    expiresOn: null,
    requiredInputs: ['scenes', 'cityOrClimateText'],
    confirmedInputs: [
      { path: 'scenes', includes: 'travel' },
      { path: 'cityOrClimateText', isPresent: true }
    ],
    recommendation: {
      colorIds: ['khaki', 'forestGreen', 'ivory'],
      garmentTemplateIds: ['lightweightOvershirt', 'wideStraightTrousers']
    },
    intendedVisualEffect: '用可穿脱层次适应温度和行程变化',
    alternative: '以一件可收纳外层替代多件厚重单品',
    confidence: 'high',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
    lastReviewed: '2026-07-29'
  })
]);

module.exports = { STYLE_RULES_V2 };
