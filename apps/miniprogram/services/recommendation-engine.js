const { stableHash } = require('../utils/hash');
const { COLOR_PALETTE } = require('../data/color-palette');
const { GARMENT_TEMPLATES } = require('../data/garment-taxonomy');
const { SCENE_RULES } = require('../data/scene-rules');
const { HAIR_COLOR_RULES } = require('../data/hair-color-rules');
const {
  DESIRED_EFFECT_LABELS,
  STYLE_PREFERENCE_LABELS
} = require('../config/preference-options');
const { resolveRules } = require('./rule-resolver');
const { applyFeedbackScores } = require('./feedback-adjuster');

const RULE_SET_VERSION = 'cn-style-2026.07';
const SECTION_KEYS = Object.freeze([
  'clothing', 'hair', 'hairColor', 'makeup', 'accessories', 'sceneTransition'
]);
const SCENE_LABELS = Object.freeze({
  commute: '通勤',
  interview: '面试',
  date: '约会',
  casual: '日常休闲',
  party: '聚会',
  travel: '旅行',
  formal: '正式活动'
});
const PRESENTATION_MODE_LABELS = Object.freeze({
  womenswear: '女装',
  menswear: '男装',
  neutral: '中性',
  mixed: '混搭'
});
const ACTIVITY_CONTEXT_LABELS = Object.freeze({
  indoor: '室内',
  outdoor: '户外',
  longWalk: '长时间步行',
  seated: '久坐',
  formalReception: '正式接待'
});
const FIT_PREFERENCE_LABELS = Object.freeze({
  fitted: '修身',
  regular: '合身',
  relaxed: '宽松',
  oversized: '廓形'
});
const COMFORT_NEED_LABELS = Object.freeze({
  breathable: '透气',
  stretch: '弹力',
  lowMaintenance: '易打理',
  temperatureLayering: '方便叠穿',
  secureFootwear: '稳妥鞋履'
});
const BUDGET_BAND_LABELS = Object.freeze({
  low: '基础预算',
  moderate: '适中预算',
  premium: '进阶预算'
});
const APPEARANCE_BASIS = Object.freeze([
  Object.freeze({
    key: 'lineQuality',
    label: '线条感',
    values: Object.freeze({
      soft: '柔和',
      balanced: '均衡',
      sharp: '利落'
    })
  }),
  Object.freeze({
    key: 'faceOutline',
    label: '脸部外轮廓',
    values: Object.freeze({
      oval: '椭圆',
      round: '圆润',
      angular: '有棱角',
      long: '偏长',
      upperWideLowerNarrow: '上宽下窄'
    })
  }),
  Object.freeze({
    key: 'valueContrast',
    label: '明暗对比',
    values: Object.freeze({
      low: '低',
      medium: '中等',
      high: '高'
    })
  }),
  Object.freeze({
    key: 'visualScale',
    label: '视觉量感',
    values: Object.freeze({
      light: '轻盈',
      medium: '中等',
      strong: '明显'
    })
  }),
  Object.freeze({
    key: 'visibleGarmentSilhouette',
    label: '当前服装轮廓',
    values: Object.freeze({
      straight: '直线',
      fittedCut: '合体',
      relaxed: '宽松',
      aLine: 'A 字',
      tapered: '收窄',
      flared: '微喇',
      cropped: '短款',
      longline: '长线条',
      oversizedCut: '廓形'
    })
  })
]);
const CLOTHING_APPEARANCE_GUIDANCE = Object.freeze({
  lineQuality: Object.freeze({
    soft: '已确认柔和线条，衣物边缘可保留柔和过渡',
    balanced: '已确认均衡线条，可组合一处清晰结构与一处柔软材质',
    sharp: '已确认利落线条，领口或外层可保留清晰边界'
  }),
  valueContrast: Object.freeze({
    low: '已确认低明暗对比，近脸色与主色可用相邻明度衔接',
    medium: '已确认中等明暗对比，主色与内搭可保留适中深浅差',
    high: '已确认高明暗对比，主色与近脸色可建立清楚的深浅层次'
  }),
  visualScale: Object.freeze({
    light: '已确认轻盈量感，优先小面积细节与轻量材质',
    medium: '已确认中等量感，结构、材质与配饰尺度保持均衡',
    strong: '已确认明显量感，优先保留单一清楚焦点'
  }),
  visibleGarmentSilhouette: Object.freeze({
    straight: '以已确认的直线轮廓作为试搭起点，再按活动需要调整',
    fittedCut: '以已确认的合体轮廓作为试搭起点，再按舒适度调整',
    relaxed: '以已确认的宽松轮廓作为试搭起点，再按活动需要调整',
    aLine: '以已确认的 A 字轮廓作为试搭起点，再按活动需要调整',
    tapered: '以已确认的收窄轮廓作为试搭起点，再按活动需要调整',
    flared: '以已确认的微喇轮廓作为试搭起点，再按活动需要调整',
    cropped: '以已确认的短款轮廓作为试搭起点，再按活动需要调整',
    longline: '以已确认的长线条轮廓作为试搭起点，再按活动需要调整',
    oversizedCut: '以已确认的廓形轮廓作为试搭起点，再按活动需要调整'
  })
});
const COMFORT_GUIDANCE = Object.freeze({
  breathable: '按已选透气需求，优先可透气、接触感稳定的面料',
  stretch: '按已选弹力需求，试穿时检查抬臂、坐下和步行的伸展余量',
  lowMaintenance: '按已选易打理需求，优先不依赖频繁熨烫的表面与结构',
  temperatureLayering: '按已选叠穿需求，外层保持容易穿脱且不过度堆叠',
  secureFootwear: '按已选稳妥鞋履需求，先确认鞋底稳定与脚背固定'
});
const FIT_GUIDANCE = Object.freeze({
  fitted: '按修身松量试穿，但不以紧绷代替合身',
  relaxed: '按宽松松量保留抬臂、坐下和步行余量',
  oversized: '按廓形松量控制肩线与衣长，保留清楚层次'
});
const DESIRED_EFFECT_GUIDANCE = Object.freeze({
  clean: '希望呈现利落感时，保留一处清晰结构并减少无用途的堆叠',
  relaxed: '希望呈现松弛感时，减少连续硬挺结构并保留活动余量',
  mobility: '希望方便活动时，试穿需检查抬臂、步幅和坐下三个动作',
  lessCling: '希望减少贴身感时，选择有垂度的表面并留出一层活动余量',
  lowerVolume: '希望增加下装量感时，可从宽直筒或 A 线下装开始试穿'
});
const STYLE_PREFERENCE_OVERLAYS = Object.freeze({
  minimal: Object.freeze({
    action: '极简层只增加一枚单一无标识几何扣件',
    reason: '极简偏好以低面积、可移除细节呈现，不改变场景版型与既定配色',
    alternative: '不需要装饰时，可移除几何扣件并保持纯色表面'
  }),
  classic: Object.freeze({
    action: '经典层增加一条素面窄幅皮带或同尺度表带',
    reason: '经典偏好用边界清楚、低标识的小面积配件收束组合',
    alternative: '没有皮带时，可改用素面窄表带，不必改变主服装'
  }),
  natural: Object.freeze({
    action: '自然层增加一小块哑光棉麻纹理，例如可移除围巾或包袋',
    reason: '自然偏好只调整可移除配件的表面纹理，保留原有结构与活动余量',
    alternative: '不增加围巾时，可把哑光棉麻纹理放在小包上'
  }),
  warm: Object.freeze({
    action: '温暖层只在既定配色允许时使用小面积驼色或青铜色配饰',
    reason: '温暖偏好以小面积受控色和低光泽配件呈现，不覆盖报告主色',
    alternative: '没有驼色配件时，可在既定配色内选一处青铜色小扣件'
  }),
  vintage: Object.freeze({
    action: '复古层增加一处仿古金属扣或素面复古表',
    reason: '复古偏好只用一处可移除旧化细节，不改变场景正式度与服装结构',
    alternative: '不使用金属扣时，可改为素面复古表，并保持其余细节简洁'
  }),
  newChinese: Object.freeze({
    action: '现代新中式层保留可移除盘扣扣袢与窄幅织纹中的 1—2 处',
    reason: '新中式偏好只落在现代、低面积的传统元素上，不改变已确认版型',
    alternative: '不使用盘扣扣袢时，可只保留一处窄幅织纹或完全移除'
  }),
  lightOutdoor: Object.freeze({
    action: '轻户外层增加一只轻量尼龙小包，不改变主服装结构',
    reason: '轻户外偏好用可移除、低面积的功能配件呈现，场景要求仍优先',
    alternative: '不带小包时，可改用同样低标识的轻量收纳袋'
  })
});
const DESIRED_EFFECT_OVERLAYS = Object.freeze({
  bold: Object.freeze({
    action: '鲜明效果把报告中的 10% 强调色集中在一处',
    reason: '鲜明效果只集中既定强调色，不扩大面积或新增未确认颜色',
    alternative: '需要更克制时，把强调色缩小到扣件、表带或包袋的一处'
  }),
  vintage: Object.freeze({
    action: '复古效果增加一处仿古金属扣或素面复古表',
    reason: '复古效果用单一可移除细节表达，不改变场景版型',
    alternative: '没有仿古金属扣时，可只用素面复古表'
  })
});
const BUDGET_GUIDANCE = Object.freeze({
  low: '基础预算下先复用已有单品，再补一件能重复搭配的缺口单品。',
  premium: '进阶预算下优先比较面料、做工和重复穿着率，不以品牌代替试穿。'
});
const ACTIVITY_GUIDANCE = Object.freeze({
  indoor: '室内活动优先保留一层可穿脱外层，方便应对空调温差。',
  outdoor: '户外活动先按天气确认防风或轻量外层，并保留穿脱空间。',
  longWalk: '长时间步行先检查鞋底稳定、脚背固定和下装步幅。',
  seated: '久坐场景试穿时要实际坐下，确认腰胯与衣摆仍有活动余量。',
  formalReception: '正式接待先遵循单位或活动方的着装要求。'
});
const HAIR_FACE_GUIDANCE = Object.freeze({
  oval: '已确认椭圆外轮廓，可在自然中分与侧分之间试选',
  round: '已确认圆润外轮廓，可先试留出额前空间的自然侧分',
  angular: '已确认有棱角的外轮廓，近脸发丝可保留柔和弧度',
  long: '已确认偏长外轮廓，可先试适度侧向纹理或完整额前层次',
  upperWideLowerNarrow: '已确认上宽下窄外轮廓，可先保持分缝清楚并减少顶部堆叠'
});
const HAIR_ACTION_BY_TIME = Object.freeze({
  5: '只完成分缝和一个重点区域的整理',
  10: '完成分缝与两个低干预整理步骤',
  20: '分区完成基础整理，并把可撤回定型留到最后'
});
const HAIR_LENGTH_LABELS = Object.freeze({
  short: '短发',
  jaw: '下颌附近发长',
  shoulder: '及肩发',
  chest: '及胸发',
  long: '长发'
});
const HAIR_TEXTURE_LABELS = Object.freeze({
  straight: '直发',
  wavy: '波浪纹理',
  curly: '卷曲纹理',
  coily: '紧密卷曲'
});
const HAIR_VOLUME_LABELS = Object.freeze({
  low: '低发量',
  medium: '中等发量',
  high: '高发量'
});
const HAIR_LENGTH_GUIDANCE = Object.freeze({
  short: '短发先用指腹恢复分缝并轻理边缘',
  jaw: '下颌附近发长先梳顺近脸发尾，再整理分缝',
  shoulder: '及肩发先从发尾向上梳开，再整理肩颈附近走向',
  chest: '及胸发先从发尾向上梳开，再按前后分区整理',
  long: '长发先从发尾向上轻梳，再按前后分区整理'
});
const HAIR_TEXTURE_GUIDANCE = Object.freeze({
  straight: '直发顺着原有走向轻梳，定型保持轻量',
  wavy: '波浪纹理保留原有弧度，只整理散乱区域',
  curly: '卷曲纹理保留原有卷束，按区域轻压整理',
  coily: '紧密卷曲发保留原有卷簇，再分区轻压整理'
});
const HAIR_VOLUME_GUIDANCE = Object.freeze({
  low: '低发量避免厚重产品，优先轻量发根整理',
  medium: '中等发量均匀分配整理量，不叠加多种定型产品',
  high: '高发量分区控制整理范围，需要固定时保持松紧适中'
});
const CURRENT_HAIR_COLOR_RULE_IDS = Object.freeze({
  naturalBlack: 'naturalBlack',
  deepBrown: 'deepTeaBrown',
  mediumBrown: 'chestnutBrown',
  lightBrown: 'caramelBrown',
  redBrown: 'redBrown',
  copper: 'copperBrown',
  coolBrown: 'coolBrown',
  blueBlack: 'blueBlack'
});
const VISIBLE_HAIR_COLOR_RULE_IDS = Object.freeze({
  black: 'naturalBlack',
  deepBrown: 'deepTeaBrown',
  mediumBrown: 'chestnutBrown',
  lightBrown: 'caramelBrown',
  redBrown: 'redBrown',
  copper: 'copperBrown',
  coolBrown: 'coolBrown',
  blueBlack: 'blueBlack'
});
const ALL_SCENES = Object.freeze(Object.keys(SCENE_LABELS));

function preservedHairColorFamily({
  id,
  name,
  colorFamily,
  depthBand,
  wardrobeLinks
}) {
  return Object.freeze({
    id: `preserve-${id}`,
    name,
    colorFamily,
    depthBand,
    toneDirection: colorFamily === 'unknown' || colorFamily === 'other'
      ? 'unknown'
      : 'neutral',
    level: depthBand === 'dark' ? '2-3' : depthBand === 'light' ? '6' : '4',
    temperature: 'neutral',
    bleachExpectation: 'no',
    maintenanceLevel: 'low',
    fadeDirection: `保持当前${name === '当前发色（未确认）' ? '发色' : name}`,
    scenes: ALL_SCENES,
    wardrobeLinks: Object.freeze([...wardrobeLinks]),
    groomingLinks: Object.freeze(['保持现有妆造与配饰关系']),
    noDyeAlternative: name === '当前发色（未确认）'
      ? '保持当前发色，只整理分缝与发尾'
      : `不改变${name}，只整理分缝与发尾`,
    safetyNote: '该色块只表示用户确认的宽泛发色范围，不推断具体染膏、配方或精确色号。'
  });
}

const PRESERVED_HAIR_COLOR_FAMILIES = Object.freeze({
  deepBrown: preservedHairColorFamily({
    id: 'deepBrown',
    name: '深棕',
    colorFamily: 'deepBrown',
    depthBand: 'dark',
    wardrobeLinks: ['navy', 'ivory', 'charcoal']
  }),
  mediumBrown: preservedHairColorFamily({
    id: 'mediumBrown',
    name: '中棕',
    colorFamily: 'mediumBrown',
    depthBand: 'medium',
    wardrobeLinks: ['camel', 'ivory', 'navy']
  }),
  lightBrown: preservedHairColorFamily({
    id: 'lightBrown',
    name: '浅棕',
    colorFamily: 'lightBrown',
    depthBand: 'light',
    wardrobeLinks: ['oatmeal', 'denimBlue', 'ivory']
  }),
  other: preservedHairColorFamily({
    id: 'other',
    name: '当前其他发色',
    colorFamily: 'other',
    depthBand: 'unknown',
    wardrobeLinks: ['navy', 'ivory', 'charcoal']
  }),
  unknown: preservedHairColorFamily({
    id: 'unknown',
    name: '当前发色（未确认）',
    colorFamily: 'unknown',
    depthBand: 'unknown',
    wardrobeLinks: ['navy', 'ivory', 'charcoal']
  })
});

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function reportId(profile, generatedAt) {
  const hash = stableHash(`${stableSerialize(profile)}::${generatedAt}`)
    .toString(16)
    .padStart(8, '0');
  return `report-v2-${hash}`;
}

function isReportForProfile(report, profile) {
  if (
    !report
    || typeof report.id !== 'string'
    || typeof report.generatedAt !== 'string'
    || !profile
    || profile.schemaVersion !== 2
  ) {
    return false;
  }
  try {
    return report.id === reportId(profile, report.generatedAt);
  } catch (error) {
    return false;
  }
}

function confirmedBasis(profile) {
  const basis = [{
    key: 'scene',
    label: '场景',
    value: profile.scenes
      .map((scene) => SCENE_LABELS[scene] || scene)
      .join('、'),
    source: 'manual'
  }, {
    key: 'presentationMode',
    label: '呈现方式',
    value: PRESENTATION_MODE_LABELS[profile.presentationMode]
      || profile.presentationMode,
    source: 'manual'
  }, {
    key: 'activityContext',
    label: '活动环境',
    value: profile.activityContext
      .map((context) => ACTIVITY_CONTEXT_LABELS[context] || context)
      .join('、'),
    source: 'manual'
  }];
  if (profile.desiredEffects.length > 0) {
    basis.push({
      key: 'desiredEffects',
      label: '希望呈现',
      value: profile.desiredEffects
        .map((value) => DESIRED_EFFECT_LABELS[value] || value)
        .join('、'),
      source: 'manual'
    });
  }
  if (profile.stylePreferences.length > 0) {
    basis.push({
      key: 'stylePreferences',
      label: '风格偏好',
      value: profile.stylePreferences
        .map((value) => STYLE_PREFERENCE_LABELS[value] || value)
        .join('、'),
      source: 'manual'
    });
  }
  basis.push({
    key: 'fitPreference',
    label: '常穿松量',
    value: FIT_PREFERENCE_LABELS[profile.fitPreference]
      || profile.fitPreference,
    source: 'manual'
  });
  if (profile.comfortNeeds.length > 0) {
    basis.push({
      key: 'comfortNeeds',
      label: '舒适需求',
      value: profile.comfortNeeds
        .map((need) => COMFORT_NEED_LABELS[need] || need)
        .join('、'),
      source: 'manual'
    });
  }
  basis.push({
    key: 'budgetBand',
    label: '预算',
    value: BUDGET_BAND_LABELS[profile.budgetBand] || profile.budgetBand,
    source: 'manual'
  });
  if (profile.manualMeasurements) {
    basis.push({
      key: 'manualMeasurements',
      label: '可选尺寸',
      value: '已填写，用于试穿与活动余量提示',
      source: 'manual'
    });
  }
  for (const descriptor of APPEARANCE_BASIS) {
    const value = profile.confirmedAppearance?.[descriptor.key];
    const label = descriptor.values[value];
    if (!label) continue;
    basis.push({
      key: descriptor.key,
      label: descriptor.label,
      value: label,
      source: 'manual'
    });
  }
  return basis;
}

function clothingPreferenceGuidance(profile) {
  const guidance = [
    ...profile.comfortNeeds.map((need) => COMFORT_GUIDANCE[need]),
    FIT_GUIDANCE[profile.fitPreference],
    ...profile.desiredEffects.map((effect) => DESIRED_EFFECT_GUIDANCE[effect])
  ].filter(Boolean);
  if (profile.manualMeasurements) {
    guidance.push('已填写可选尺寸，请对照实物尺码表试穿并核对活动余量，不推算精确尺码');
  }
  return guidance.join('；');
}

function hasStrictClothingContext(profile) {
  const hasConservativeWorkContext = (
    profile.hairColorPreference?.workplaceRestriction === 'conservative'
    && profile.scenes.some((scene) => (
      scene === 'commute' || scene === 'interview'
    ))
  );
  return (
    profile.scenes.includes('formal')
    || profile.activityContext.includes('formalReception')
    || hasConservativeWorkContext
  );
}

function clothingPreferenceOverlays(profile) {
  const overlays = profile.stylePreferences
    .map((style) => STYLE_PREFERENCE_OVERLAYS[style])
    .filter(Boolean);
  if (
    profile.desiredEffects.includes('newChinese')
    && !profile.stylePreferences.includes('newChinese')
  ) {
    overlays.push(STYLE_PREFERENCE_OVERLAYS.newChinese);
  }
  overlays.push(...profile.desiredEffects
    .map((effect) => DESIRED_EFFECT_OVERLAYS[effect])
    .filter(Boolean));
  return overlays;
}

function common(item, basis, priority) {
  return {
    ...item,
    confirmedBasis: basis,
    priority
  };
}

function familyPriority(rules, family, fallback) {
  return rules.find((rule) => rule.family === family)?.priority ?? fallback;
}

function isFamilySuppressed(profile, family) {
  return (profile.feedbackSummary?.suppressedFamilies || []).includes(family);
}

function garmentIds(rule) {
  return (
    rule?.candidate?.recommendation?.garmentTemplateIds
    || rule?.candidate?.techniques?.silhouetteIds
    || []
  );
}

function colorIds(rule) {
  return (
    rule?.candidate?.recommendation?.colorIds
    || rule?.candidate?.techniques?.colorIds
    || []
  );
}

function selectClothingRule(rules, feedbackSummary = {}) {
  const rejected = new Set(feedbackSummary.rejectedRuleIds || []);
  if ((feedbackSummary.suppressedFamilies || []).includes('clothing')) {
    return undefined;
  }
  return rules.find((rule) => (
    rule.family === 'clothing'
    && !rejected.has(rule.id)
    && (
      garmentIds(rule).length > 0
      || rule.candidate?.lockedArea === 'fit'
    )
  ));
}

function selectHairColorRule(rules) {
  return rules.find((rule) => (
    rule.family === 'hairColor' && typeof rule.candidate?.name === 'string'
  ));
}

function selectFamilyRules(rules, family) {
  return rules.filter((rule) => rule.family === family);
}

function garmentTemplate(id) {
  return GARMENT_TEMPLATES.find((template) => template.id === id);
}

function presentationGarmentIds(profile, ids) {
  const uniqueIds = [...new Set(ids)];
  const templates = uniqueIds.map(garmentTemplate).filter(Boolean);
  const onePiece = templates.find(({ category }) => category === 'onePiece');
  const lowerBody = templates.find(({ category }) => category === 'lowerBody');

  if (!['menswear', 'neutral'].includes(profile.presentationMode)) {
    if (!onePiece || !lowerBody) return uniqueIds;
    const useTwoPiece = profile.presentationMode === 'mixed';
    if (!useTwoPiece) return [onePiece.id];
    const existingUpper = templates.find(({ category }) => (
      category === 'top' || category === 'outerLayer'
    ));
    return [existingUpper?.id || 'crewNeckKnitTop', lowerBody.id];
  }

  const hasOnePiece = Boolean(onePiece);
  const hasSeparateUpper = templates.some(({ category }) => (
    category === 'top' || category === 'outerLayer'
  ));
  const converted = uniqueIds.map((id) => {
    const template = garmentTemplate(id);
    if (template?.category === 'onePiece') {
      return hasSeparateUpper ? 'straightTrousers' : 'singleBreastedBlazer';
    }
    if (
      template?.category === 'lowerBody'
      && template.skirtShape !== 'notApplicable'
    ) return 'straightTrousers';
    return id;
  });
  if (
    hasOnePiece
    && !converted.some((id) => garmentTemplate(id)?.category === 'lowerBody')
  ) {
    converted.push('straightTrousers');
  }
  return [...new Set(converted)];
}

function mutuallyExclusiveGarmentAlternative(profile, candidateIds, selectedIds) {
  if (!['womenswear', 'mixed'].includes(profile.presentationMode)) return '';
  const candidates = candidateIds.map(garmentTemplate).filter(Boolean);
  const onePiece = candidates.find(({ category }) => category === 'onePiece');
  const lowerBody = candidates.find(({ category }) => category === 'lowerBody');
  if (!onePiece || !lowerBody) return '';
  if (selectedIds.includes(onePiece.id)) {
    return `也可改用圆领针织上衣与${lowerBody.name}的两件式方案。`;
  }
  return `也可改用${onePiece.name}作为单件主方案。`;
}

function confirmedHairColorCandidate(profile) {
  const currentColor = profile.hairColorPreference?.currentColor;
  const visibleFamily = profile.confirmedAppearance?.visibleHairColorFamily;
  if (currentColor && !['unknown', 'other'].includes(currentColor)) {
    const preservedFamily = PRESERVED_HAIR_COLOR_FAMILIES[currentColor];
    if (preservedFamily) return preservedFamily;
    const currentId = CURRENT_HAIR_COLOR_RULE_IDS[currentColor];
    if (currentId) {
      return HAIR_COLOR_RULES.find((candidate) => candidate.id === currentId);
    }
  }
  if (visibleFamily && !['unknown', 'other'].includes(visibleFamily)) {
    const preservedFamily = PRESERVED_HAIR_COLOR_FAMILIES[visibleFamily];
    if (preservedFamily) return preservedFamily;
    const visibleId = VISIBLE_HAIR_COLOR_RULE_IDS[visibleFamily];
    if (visibleId) {
      return HAIR_COLOR_RULES.find((candidate) => candidate.id === visibleId);
    }
  }
  if (currentColor === 'other' || visibleFamily === 'other') {
    return PRESERVED_HAIR_COLOR_FAMILIES.other;
  }
  return PRESERVED_HAIR_COLOR_FAMILIES.unknown;
}

function colorById(id) {
  return COLOR_PALETTE.find((color) => color.id === id);
}

function primarySceneRule(profile) {
  const primaryScene = profile.scenes[0] || 'commute';
  return SCENE_RULES.find(({ id }) => id === primaryScene)
    || SCENE_RULES.find(({ id }) => id === 'commute');
}

function sceneRuleFor(scene) {
  return SCENE_RULES.find(({ id }) => id === scene)
    || SCENE_RULES.find(({ id }) => id === 'commute');
}

function guidanceText(appearance, descriptors) {
  return descriptors
    .map(([field, values]) => values[appearance?.[field]])
    .filter(Boolean)
    .join('；');
}

function withGuidance(base, guidance) {
  return guidance ? `${base} ${guidance}。` : base;
}

function climateDirection(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return 'unknown';
  if (
    /潮|湿|雨|梅雨|沿海|闷热|广州|深圳|上海|杭州|海口|厦门|重庆/.test(text)
  ) return 'humid';
  if (
    /干|燥|风沙|北京|天津|西安|兰州|银川|乌鲁木齐|呼和浩特/.test(text)
  ) return 'dry';
  return 'unknown';
}

function confirmedHairDescription(appearance) {
  return [
    HAIR_LENGTH_LABELS[appearance.hairLength],
    HAIR_TEXTURE_LABELS[appearance.hairTexture],
    HAIR_VOLUME_LABELS[appearance.visibleHairVolume]
  ].filter(Boolean).join('、');
}

function confirmedHairGuidance(appearance) {
  return [
    HAIR_LENGTH_GUIDANCE[appearance.hairLength],
    HAIR_TEXTURE_GUIDANCE[appearance.hairTexture],
    HAIR_VOLUME_GUIDANCE[appearance.visibleHairVolume]
  ].filter(Boolean).join('；');
}

function hairProfileAlternative(appearance) {
  if (
    appearance.hairLength === 'long'
    && appearance.hairTexture === 'coily'
  ) {
    return '时间不足时保留原有卷簇，只做分区整理或松紧适中的低位束发。';
  }
  if (appearance.hairLength === 'short') {
    return '时间不足时只用指腹恢复分缝并轻理短发边缘。';
  }
  if (appearance.hairTexture === 'curly' || appearance.hairTexture === 'coily') {
    return '时间不足时保留原有卷束，只整理分缝和散乱区域。';
  }
  return '时间不足时只梳顺分缝与发尾，不增加定型步骤。';
}

function clothingRecommendation(profile, basis, rules, selectedRule) {
  const locked = profile.lockedAreas.includes('fit');
  const feedbackSummary = profile.feedbackSummary || {};
  const rejectedRuleIds = new Set(feedbackSummary.rejectedRuleIds || []);
  const rejectedClothing = rules.some((rule) => (
    rule.family === 'clothing' && rejectedRuleIds.has(rule.id)
  ));
  const feedbackLowIntervention = (
    (feedbackSummary.suppressedFamilies || []).includes('clothing')
    || (!selectedRule && rejectedClothing)
  );
  const sceneRule = primarySceneRule(profile);
  const sceneCapsule = selectedRule ? null : sceneRule.capsule;
  const preservesFit = locked && selectedRule?.candidate?.lockedArea === 'fit';
  const preservesStructure = preservesFit || feedbackLowIntervention;
  const candidateIds = garmentIds(selectedRule).length > 0
    ? garmentIds(selectedRule)
    : sceneCapsule?.garmentTemplateIds || [];
  const selectedIds = preservesStructure
    ? ['preserveCurrentGarments']
    : presentationGarmentIds(profile, candidateIds);
  const selectedTemplates = selectedIds.map(garmentTemplate).filter(Boolean);
  const upper = selectedTemplates.find(({ category }) => (
    category === 'outerLayer' || category === 'top' || category === 'onePiece'
  )) || selectedTemplates[0];
  const lower = selectedTemplates.find(({ category }) => category === 'lowerBody');
  const isCore = !preservesStructure && (
    selectedRule?.id === 'garment-vertical-open-line'
    || sceneCapsule?.id === 'garment-commute-clean-blazer'
  );
  const isSoft = selectedRule?.id === 'garment-soft-horizontal-break';
  const baseAction = feedbackLowIntervention
    ? '根据你的反馈，本轮保留现有服装版型，只调整配色、配饰或可移除外层'
    : preservesFit
      ? '保持现有版型与服装结构，仅调整配色、配饰或可移除外层'
    : sceneCapsule
      ? sceneCapsule.action
      : isCore
      ? '选择藏青合体肩单排扣外套，内搭米白窄圆领针织'
      : isSoft
        ? '选择宽松针织开衫与宽直筒长裤，保留轻松活动余量'
        : `选择${selectedTemplates.map(({ name }) => name).join('与')}，按场景确认活动余量`;
  const newChinese = (
    profile.desiredEffects.includes('newChinese')
    || profile.stylePreferences.includes('newChinese')
  );
  const canApplyPreferenceOverlays = (
    !preservesStructure
    && !hasStrictClothingContext(profile)
  );
  const preferenceOverlays = canApplyPreferenceOverlays
    ? clothingPreferenceOverlays(profile)
    : [];
  const action = [
    baseAction,
    ...preferenceOverlays.map((overlay) => overlay.action)
  ].join('；');
  const baseReason = feedbackLowIntervention
    ? '你已明确减少此类服装建议，因此本轮不重复原规则，只保留可撤回的低干预联动。'
    : preservesFit
      ? '已锁定版型调整，因此不改变肩线、腰位、松量、衣长或下装轮廓。'
    : sceneCapsule
      ? sceneRule.guidance
    : isCore
      ? '合体肩线增加清晰结构，直线开襟延伸纵向，适配通勤与正式接待。'
      : selectedRule.candidate.intendedVisualEffect
        || selectedRule.candidate.recommendation;
  const appearanceGuidance = guidanceText(profile.confirmedAppearance, [
    ['lineQuality', CLOTHING_APPEARANCE_GUIDANCE.lineQuality],
    ['valueContrast', CLOTHING_APPEARANCE_GUIDANCE.valueContrast],
    ['visualScale', CLOTHING_APPEARANCE_GUIDANCE.visualScale],
    [
      'visibleGarmentSilhouette',
      CLOTHING_APPEARANCE_GUIDANCE.visibleGarmentSilhouette
    ]
  ]);
  const preferenceGuidance = clothingPreferenceGuidance(profile);
  const reason = [
    withGuidance(
      withGuidance(baseReason, appearanceGuidance),
      preferenceGuidance
    ),
    ...preferenceOverlays.map((overlay) => `${overlay.reason}。`)
  ].join(' ');
  const ruleAlternative = feedbackLowIntervention
    ? '也可以完全跳过本轮服装调整，继续使用现有组合。'
    : preservesFit
      ? '保持现有版型且不增加外层时，只用现有单品的藏青/米白配色和小面积配饰调整。'
      : sceneCapsule
        ? sceneCapsule.alternative
        : isCore
          ? '天气偏热时改用米白有领衬衫和藏青直筒裤'
          : selectedRule.candidate.alternative
            || selectedRule.candidate.extractionBoundary;
  const garmentAlternative = preservesStructure
    ? ''
    : mutuallyExclusiveGarmentAlternative(
      profile,
      candidateIds,
      selectedIds
    );
  const baseAlternative = garmentAlternative
    ? `${garmentAlternative} ${ruleAlternative}`
    : ruleAlternative;
  const preferenceAlternative = preferenceOverlays
    .map((overlay) => `${overlay.alternative}。`)
    .join(' ');
  const decoratedAlternative = preferenceAlternative
    ? `${baseAlternative.replace(/。?$/, '。')} ${preferenceAlternative}`
    : baseAlternative;
  const budgetGuidance = BUDGET_GUIDANCE[profile.budgetBand];
  const fitEase = {
    fitted: 'close',
    regular: 'regular',
    relaxed: 'relaxed',
    oversized: 'relaxed'
  }[profile.fitPreference];
  return common({
    id: feedbackLowIntervention
      ? 'garment-feedback-low-intervention'
      : preservesFit
        ? 'garment-fit-preserving-low-intervention'
      : sceneCapsule?.id
        || (isCore ? 'garment-commute-clean-blazer' : selectedRule.id),
    family: 'clothing',
    action,
    reason,
    alternative: budgetGuidance
      ? `${decoratedAlternative} ${budgetGuidance}`
      : decoratedAlternative,
    sceneFit: preservesStructure
      ? [...profile.scenes]
      : sceneCapsule
        ? [sceneRule.id]
        : selectedRule.candidate.scene.filter((scene) => profile.scenes.includes(scene)),
    necklineOrCollar: preservesStructure
      ? 'preserveCurrent'
      : isCore ? 'narrowNotchLapel' : upper.necklineOrCollar,
    shoulderConstruction: preservesStructure
      ? 'preserveCurrent'
      : isCore ? 'setInStructured' : upper.shoulderConstruction,
    waistPlacement: preservesStructure
      ? 'preserveCurrent'
      : isCore
        ? 'natural'
        : lower?.waistPlacement !== 'none'
          ? lower?.waistPlacement || upper.waistPlacement
          : upper.waistPlacement,
    length: preservesStructure ? 'preserveCurrent' : isCore ? 'hip' : upper.length,
    sleeveLength: preservesStructure
      ? 'preserveCurrent'
      : isCore ? 'full' : upper.sleeveLength,
    trouserRise: preservesStructure
      ? 'preserveCurrent'
      : lower?.trouserRise || 'notApplicable',
    legShape: preservesStructure
      ? 'preserveCurrent'
      : isCore ? 'straight' : lower?.legShape || 'notApplicable',
    skirtShape: preservesStructure
      ? 'preserveCurrent'
      : isCore
        ? 'notApplicable'
        : lower?.skirtShape || upper.skirtShape || 'notApplicable',
    ease: preservesStructure
      ? 'preserveCurrent'
      : fitEase || (isCore ? 'regular' : upper.ease),
    materialAppearance: preservesStructure
      ? 'preserveCurrent'
      : isCore ? 'midweightWoven' : upper.materialAppearance,
    lowIntervention: locked || feedbackLowIntervention,
    garmentTemplateIds: [...selectedIds],
    traditionalElements: canApplyPreferenceOverlays && newChinese
      ? ['盘扣细节', '窄幅织纹']
      : [],
    appliedRuleIds: feedbackLowIntervention
      ? []
      : selectedRule ? [selectedRule.id] : []
  }, basis, selectedRule?.priority ?? familyPriority(rules, 'clothing', 300));
}

function hairRecommendation(profile, basis, rules, contributorRules) {
  const appearance = profile.confirmedAppearance;
  const locked = profile.lockedAreas.includes('hairLength');
  const suppressed = isFamilySuppressed(profile, 'hair');
  const timeMinutes = profile.stylingTimeMinutes;
  const climate = climateDirection(profile.cityOrClimateText);
  const isUnknown = [
    appearance.hairLength,
    appearance.hairTexture,
    appearance.visibleHairVolume
  ].every((value) => value === 'unknown');
  const hairDescription = confirmedHairDescription(appearance);
  const profileGuidance = confirmedHairGuidance(appearance);
  const action = suppressed
    ? '根据你的反馈，本轮不再提供新的发型方案；保留当前发型，需要时只梳顺分缝与发尾'
    : isUnknown
      ? `可以先保持现有发型，在${timeMinutes} 分钟预算内只整理分缝和发丝光泽`
      : `用 ${timeMinutes} 分钟为${hairDescription}${HAIR_ACTION_BY_TIME[timeMinutes]}：${profileGuidance}`;
  const reason = suppressed
    ? '你已明确减少此类发型建议，因此本轮不重复原规则，也不改变发长、纹理或外轮廓。'
    : isUnknown
      ? '发长、纹理与发量尚未确认，优先提供可跳过、可撤回的整理方式。'
      : `已确认${hairDescription}；${profileGuidance}。`;
  const climateGuidance = {
    humid: '已根据你填写的潮湿环境，减少反复梳理并优先轻量、可跳过的定型',
    dry: '已根据你填写的干燥环境，减少反复高温整理并优先保留柔顺度',
    unknown: ''
  }[climate];
  const alternative = suppressed
    ? '也可以完全跳过本轮发型整理，继续使用自己已验证舒适的日常方式。'
    : locked
      ? '保持现有发长，仅梳顺和整理分缝，作为低干预替代'
      : `${hairProfileAlternative(appearance)}${
        {
          humid: '潮湿环境下可减少定型步骤并保留原有纹理。',
          dry: '干燥环境下可减少高温步骤并优先保留柔顺度。',
          unknown: '也可以完全跳过定型。'
        }[climate]
      }`;
  return common({
    id: suppressed
      ? 'hair-feedback-low-intervention'
      : 'hair-shape-low-maintenance',
    family: 'hair',
    action,
    reason: suppressed
      ? reason
      : withGuidance(
        withGuidance(
          reason,
          HAIR_FACE_GUIDANCE[appearance.faceOutline] || ''
        ),
        climateGuidance
      ),
    alternative,
    sceneFit: [...profile.scenes],
    lowIntervention: locked || suppressed,
    appliedRuleIds: suppressed ? [] : contributorRules.map(({ id }) => id)
  }, basis, contributorRules[0]?.priority ?? familyPriority(rules, 'hair', 600));
}

function hairColorRecommendation(
  profile,
  basis,
  rules,
  selectedRule,
  contributorRules
) {
  const preference = profile.hairColorPreference;
  const suppressed = isFamilySuppressed(profile, 'hairColor');
  const noDye = (
    preference.willingness === 'no-dye'
    || profile.lockedAreas.includes('hairColor')
  );
  const preservedCandidate = (noDye || suppressed)
    ? confirmedHairColorCandidate(profile)
    : null;
  const candidate = preservedCandidate || (
    suppressed ? null : selectedRule?.candidate
  );
  const isBlackTea = candidate?.id === 'blackTea' || !candidate;
  const isUnconfirmedPreserved = candidate?.id === 'preserve-unknown';
  const colorName = isBlackTea ? '黑茶色' : candidate.name;
  const wardrobeColorLinks = isBlackTea
    ? ['藏青', '米白', '驼色']
    : candidate.wardrobeLinks.map((id) => colorById(id)?.name || id);
  return common({
    id: suppressed
      ? 'hair-color-feedback-low-intervention'
      : isBlackTea
        ? 'hair-color-black-tea-low-maintenance'
        : `hair-color-${candidate.id}`,
    family: 'hairColor',
    action: suppressed
      ? '根据你的反馈，本轮不再提供新的发色方案，保持当前发色'
      : noDye
        ? preservedCandidate
          ? isUnconfirmedPreserved
            ? '保持当前发色，只整理分缝与发丝光泽'
            : `保留当前${colorName}发色，只整理分缝与发丝光泽`
          : `保持当前发色，${colorName}仅作为屏幕深发色参考`
        : `在专业发型师评估当前发底后，选择${candidate?.maintenanceLevel === 'low' ? '低维护' : ''}${colorName}`,
    reason: suppressed
      ? '你已明确减少此类发色建议，因此本轮不重复原规则，也不提出改色或漂发步骤。'
      : noDye
        ? preservedCandidate
          ? isUnconfirmedPreserved
            ? '当前具体发色尚未确认，因此只保持现状，不推断色名或提出改色步骤。'
            : `已按你确认的当前${colorName}发色保留原色，不提出改色步骤。`
          : '尚未确认具体发色，因此只保留当前状态并提供可跳过的屏幕参考。'
        : `${colorName}与${wardrobeColorLinks.slice(0, 2).join('、')}形成克制联动，并保留不染替代。`,
    alternative: suppressed
      ? '需要时只梳顺分缝与发尾；也可以完全跳过本轮发色色块。'
      : noDye
        ? preservedCandidate
          ? `不改变${colorName}，只调整分缝与发尾整齐度。`
          : '跳过发色色块，只调整分缝与发尾整齐度。'
        : isBlackTea
          ? '保留自然黑，用柔顺光泽和清晰分缝获得相近的克制效果'
          : candidate.noDyeAlternative,
    colorName,
    colorFamily: isBlackTea
      ? 'deepBrown'
      : candidate.colorFamily || candidate.temperature,
    depthBand: isBlackTea
      ? 'dark'
      : candidate.depthBand
        || (Number.parseInt(candidate.level, 10) <= 3 ? 'dark' : 'medium'),
    toneDirection: isBlackTea
      ? 'neutral'
      : candidate.toneDirection || candidate.temperature,
    applicationStyle: noDye || suppressed ? 'preserveCurrent' : 'full',
    bleachExpectation: noDye || suppressed
      ? 'no'
      : candidate?.bleachExpectation || 'no',
    maintenanceLevel: candidate?.maintenanceLevel || 'low',
    fadeDirection: isBlackTea ? '逐渐转为柔和深棕' : candidate.fadeDirection,
    sceneFit: noDye || suppressed
      ? [...profile.scenes]
      : candidate?.scenes || [...profile.scenes],
    wardrobeColorLinks,
    makeupAndAccessoryLinks: isBlackTea
      ? ['豆沙玫瑰唇色', '金色或银色小面积配饰']
      : candidate.groomingLinks,
    noDyeAlternative: suppressed
      ? '保持当前发色，只整理分缝与发尾，也可以跳过本轮发色参考'
      : isBlackTea
        ? '保留自然黑，用柔顺光泽和清晰分缝获得相近的克制效果'
        : candidate.noDyeAlternative,
    trendValidUntil: null,
    safetyNote: isBlackTea
      ? '屏幕发色色块仅为审美参考；实际效果由当前发底决定，请遵循产品标签并由专业发型师评估。'
      : `屏幕发色色块仅为审美参考；${candidate.safetyNote}`,
    lowIntervention: noDye || suppressed,
    appliedRuleIds: suppressed ? [] : contributorRules.map(({ id }) => id)
  }, basis, (
    contributorRules[0]?.priority
    ?? selectedRule?.priority
    ?? familyPriority(rules, 'hairColor', 800)
  ));
}

function makeupRecommendation(
  profile,
  basis,
  rules,
  contributorRules,
  plan,
  hairColor
) {
  const none = profile.makeupPreference === 'none';
  const locked = profile.lockedAreas.includes('makeup');
  const suppressed = isFamilySuppressed(profile, 'makeup');
  const lockedCopy = {
    none: {
      action: '保持你已选的不化妆习惯，可以继续跳过彩妆',
      reason: '已锁定妆容，不增加彩妆步骤，只联动服装与配饰。',
      alternative: '只保留自己习惯的清洁与保湿步骤。'
    },
    light: {
      action: '保持当前淡妆习惯，不新增色彩或步骤',
      reason: '已锁定淡妆，只让服装与配饰配合现有妆容。',
      alternative: '维持现有淡妆用量，也可以跳过额外补妆。'
    },
    defined: {
      action: '保持当前明确重点妆容，不改变原有重点',
      reason: '已锁定明确重点的妆容习惯，只调整服装与配饰的呼应。',
      alternative: '维持现有重点与步骤，不叠加第二个妆容焦点。'
    }
  }[profile.makeupPreference];
  const suppressedCopy = {
    none: {
      action: '根据你的反馈，本轮不再提供妆容方案，继续保持已选的不化妆习惯',
      alternative: '只保留自己习惯的清洁与保湿步骤，也可以完全跳过这一项。'
    },
    light: {
      action: '根据你的反馈，本轮不再提供新的妆容方案，保持现有淡妆习惯',
      alternative: '维持现有用量与步骤，也可以跳过额外补妆。'
    },
    defined: {
      action: '根据你的反馈，本轮不再提供新的妆容方案，保持现有重点妆容',
      alternative: '维持现有重点与步骤，不叠加新的色彩焦点。'
    }
  }[profile.makeupPreference];
  const dynamicCopy = {
    light: {
      id: 'makeup-light-soft-focus',
      action: `淡妆保持轻薄用量，只在${plan.accent.name}方向少量选一处唇颊呼应，也可以跳过`,
      reason: `${hairColor.colorName}发色与${plan.main.name}主色、${plan.secondary.name}辅色和${plan.accent.name}点缀已形成完整色彩关系，因此妆容不再增加第二个重点。`,
      alternative: `减少用量时只保留自己习惯的一步；也可用${plan.secondary.name}近脸层次替代额外彩妆。`
    },
    defined: {
      id: 'makeup-defined-single-focus',
      action: `明确重点妆容在眼部线条或${plan.accent.name}唇色中只选一处焦点，不同时加强两处`,
      reason: `${hairColor.colorName}发色与${plan.main.name}主色、${plan.secondary.name}辅色和${plan.accent.name}点缀已经清楚，单一妆容重点可避免色彩重复。`,
      alternative: `不增加新颜色时，保留原有明确重点，并让${plan.secondary.name}靠近脸部作为服装呼应。`
    }
  }[profile.makeupPreference];
  return common({
    id: suppressed
      ? 'makeup-feedback-low-intervention'
      : locked
        ? `makeup-lock-${profile.makeupPreference}`
        : none ? 'makeup-skip-clear' : dynamicCopy.id,
    family: 'makeup',
    action: suppressed
      ? suppressedCopy.action
      : locked
        ? lockedCopy.action
        : none
          ? '可以完全跳过彩妆，保持自己习惯的清爽状态'
          : dynamicCopy.action,
    reason: suppressed
      ? '你已明确减少此类妆容建议，因此本轮不重复原规则，也不增加新的色彩或步骤。'
      : locked
        ? lockedCopy.reason
        : none
          ? '尊重已确认的不化妆选择，不额外增加步骤。'
          : dynamicCopy.reason,
    alternative: suppressed
      ? suppressedCopy.alternative
      : locked
        ? lockedCopy.alternative
        : none
          ? '不化妆时只保留自己习惯的清洁与保湿步骤'
          : dynamicCopy.alternative,
    sceneFit: [...profile.scenes],
    skippable: true,
    lowIntervention: locked || suppressed,
    appliedRuleIds: suppressed ? [] : contributorRules.map(({ id }) => id)
  }, basis, contributorRules[0]?.priority ?? familyPriority(rules, 'makeup', 800));
}

function accessoriesRecommendation(profile, basis, rules, contributorRules) {
  const glasses = profile.confirmedAppearance.glassesState;
  const locked = profile.lockedAreas.includes('glasses');
  const unknown = glasses === 'unknown';
  const suppressed = isFamilySuppressed(profile, 'accessories');
  const lockedCopy = {
    none: {
      action: '保持不佩戴眼镜；如需配饰，只检查活动舒适',
      reason: '已锁定不佩戴眼镜，因此不新增镜框或试戴步骤。',
      alternative: '保持不佩戴眼镜，也可以完全跳过本轮配饰建议。'
    },
    visible: {
      action: '保持现有眼镜并先保证佩戴和活动舒适，再按需保留一处小面积配饰',
      reason: '已锁定当前眼镜状态，因此不改变镜框，只检查佩戴舒适。',
      alternative: '保持现有眼镜，不改变镜框，只作低干预的衣物配色呼应。'
    },
    unknown: {
      action: '保持当前未确认的眼镜状态，不新增镜框或试戴步骤',
      reason: '眼镜状态尚未确认且已锁定，因此只保留可跳过的舒适检查。',
      alternative: '保持当前状态，也可以完全跳过本轮眼镜与配饰建议。'
    }
  }[glasses];
  const suppressedAction = {
    none: '根据你的反馈，本轮不再新增眼镜或配饰建议，保持不佩戴眼镜和现有配饰状态',
    visible: '根据你的反馈，本轮不再新增眼镜或配饰建议，保持当前眼镜与配饰状态',
    unknown: '根据你的反馈，本轮不再新增眼镜或配饰建议，保持当前未确认的眼镜与配饰状态'
  }[glasses];
  return common({
    id: suppressed
      ? 'accessories-feedback-low-intervention'
      : 'accessories-glasses-comfort-first',
    family: 'accessories',
    action: suppressed
      ? suppressedAction
      : locked
        ? lockedCopy.action
        : glasses === 'visible'
          ? '先保证现有眼镜佩戴和活动舒适，再选一处金色或银色小面积配饰'
          : glasses === 'none'
            ? '保持不佩戴眼镜，再按需要加入一处金色或银色小面积配饰'
            : '可以先保证活动舒适，再按需要加入一处金色或银色小面积配饰',
    reason: suppressed
      ? '你已明确减少此类建议，因此本轮不重复金属色、镜框或新增单品方案。'
      : locked
        ? lockedCopy.reason
        : unknown
          ? '眼镜状态未确认，优先保留可以省略且不改变现有佩戴的选择。'
          : '先满足已确认的佩戴状态和活动需求，再用小面积金属色联动发色与服装。',
    alternative: suppressed
      ? '需要时只检查佩戴与活动舒适，也可以完全跳过这一项。'
      : locked
        ? lockedCopy.alternative
        : '不佩戴配饰时，直接省略这一项。',
    sceneFit: [...profile.scenes],
    lowIntervention: locked || suppressed,
    appliedRuleIds: suppressed ? [] : contributorRules.map(({ id }) => id)
  }, basis, (
    contributorRules[0]?.priority
    ?? familyPriority(rules, 'accessories', 400)
  ));
}

function sceneRecommendation(profile, basis, rules, sceneRule, contributorRule) {
  const suppressed = isFamilySuppressed(profile, 'sceneTransition');
  const activityGuidance = profile.activityContext
    .map((context) => ACTIVITY_GUIDANCE[context])
    .filter(Boolean)
    .join('');
  return common({
    id: suppressed
      ? `scene-${sceneRule.id}-feedback-low-intervention`
      : `scene-${sceneRule.id}-guidance`,
    family: 'sceneTransition',
    action: suppressed
      ? `根据你的反馈，本轮不再给出同类场景胶囊方案，先沿用当前组合；${sceneRule.name}只保留出发前核对`
      : `${sceneRule.name}：${sceneRule.action}；可执行胶囊：${sceneRule.capsule.action}`,
    reason: suppressed
      ? `你已明确减少此类场景切换建议，因此不重复原胶囊组合。出发前只核对：${sceneRule.hardConstraints.join('；')}。${activityGuidance}`
      : `${sceneRule.guidance}${sceneRule.footwearGuidance}${activityGuidance}`,
    alternative: suppressed
      ? '也可以完全跳过本轮场景切换建议，继续使用已验证舒适的现有组合。'
      : `${sceneRule.alternative} 胶囊替代：${sceneRule.capsule.alternative}`,
    sceneFit: [sceneRule.id],
    appliedRuleIds: suppressed || !contributorRule ? [] : [contributorRule.id]
  }, basis, (
    contributorRule?.priority
    ?? familyPriority(rules, 'sceneTransition', 1000)
  ));
}

function sceneRecommendations(profile, basis, rules, contributorRules) {
  return profile.scenes.map((scene) => {
    const sceneRule = sceneRuleFor(scene);
    const contributorRule = contributorRules.find(
      ({ candidate }) => candidate?.id === sceneRule.id
    );
    return sceneRecommendation(
      profile,
      basis,
      rules,
      sceneRule,
      contributorRule
    );
  });
}

function displayColor(id) {
  const color = colorById(id) || colorById('navy');
  return {
    name: color.name,
    hex: color.reportHex || color.hex
  };
}

function alternativeColorNames(selectedIds) {
  const selected = new Set(selectedIds);
  const fallbackIds = [
    'charcoal', 'navy', 'chocolate', 'mediumGray', 'dustyPink', 'camel'
  ];
  return fallbackIds
    .filter((id) => !selected.has(id))
    .slice(0, 2)
    .map((id) => displayColor(id).name);
}

function colorPlan(profile, selectedRule) {
  const candidateIds = colorIds(selectedRule);
  const sceneRule = primarySceneRule(profile);
  const baseIds = candidateIds.length >= 3
    ? candidateIds.slice(0, 3)
    : sceneRule.capsule.colorIds;
  const calibration = profile.confirmedAppearance.colorCalibration || {};
  const selectedIds = [
    { warmBrown: 'chocolate', coolGray: 'charcoal' }[
      calibration.neutralChoice
    ] || baseIds[0],
    { ivory: 'ivory', pureWhite: 'pureWhite' }[
      calibration.whiteChoice
    ] || baseIds[1],
    { brickRed: 'brickRed', berry: 'berry' }[
      calibration.accentChoice
    ] || baseIds[2]
  ];
  const [main, secondary, accent] = selectedIds.map(displayColor);
  return {
    main: { ...main, percentage: 60 },
    secondary: { ...secondary, percentage: 30 },
    accent: { ...accent, percentage: 10 },
    nearFace: [secondary.name],
    lowerBody: [main.name],
    accessories: [accent.name],
    alternatives: alternativeColorNames(selectedIds),
    reason: `${main.name}作为 60% 主色保持整体连续，${secondary.name}以 30% 调整近脸层次，${accent.name}只作 10% 小面积焦点；配色角色已按${sceneRule.name}场景核对。`,
    screenColorDisclaimer: '屏幕色块仅为近似参考，不等同于真实布料或 Pantone 色号。'
  };
}

function colorRecommendationId(plan) {
  const ids = [plan.main, plan.secondary, plan.accent].map(({ name }) => (
    COLOR_PALETTE.find((color) => color.name === name)?.id || 'calibrated'
  ));
  return `rec-color-${ids.join('-')}`;
}

function topRecommendations(
  profile,
  basis,
  selectedClothing,
  selectedHairColor,
  clothing,
  hairColor,
  plan
) {
  const noDye = (
    profile.hairColorPreference.willingness === 'no-dye'
    || profile.lockedAreas.includes('hairColor')
  );
  const colorPriority = selectedClothing?.priority ?? 300;
  const hairPriority = noDye ? 200 : selectedHairColor?.priority ?? 400;
  const recommendations = [
    common({
      id: colorRecommendationId(plan),
      family: 'color',
      action: `先试${plan.main.name}、${plan.secondary.name}与${plan.accent.name}的 60/30/10 配色`,
      reason: plan.reason,
      alternative: `用${plan.alternatives[0]}替代${plan.main.name}。`,
      sceneFit: clothing.sceneFit
    }, basis, colorPriority),
    common({
      id: clothing.id === 'garment-commute-clean-blazer'
        ? 'rec-garment-clean-line'
        : `rec-${clothing.id}`,
      family: 'clothing',
      action: clothing.action,
      reason: clothing.reason,
      alternative: clothing.alternative,
      sceneFit: clothing.sceneFit
    }, basis, colorPriority),
    common({
      id: noDye
        ? 'rec-hair-no-dye'
        : selectedHairColor?.candidate.id === 'blackTea'
          ? 'rec-hair-black-tea'
          : `rec-hair-${selectedHairColor?.candidate.id || 'color'}`,
      family: 'hairColor',
      action: hairColor.action,
      reason: hairColor.reason,
      alternative: hairColor.alternative,
      sceneFit: hairColor.sceneFit
    }, basis, hairPriority)
  ];
  const familyRank = { color: 0, clothing: 1, hairColor: 2 };
  return recommendations.sort((first, second) => (
    second.priority - first.priority
    || familyRank[first.family] - familyRank[second.family]
  ));
}

function generateReport(profile, { now } = {}) {
  if (!profile || profile.schemaVersion !== 2) {
    throw new TypeError('generateReport requires a normalized StyleProfileV2');
  }
  const generatedAt = new Date(now || Date.now()).toISOString();
  const basis = confirmedBasis(profile);
  const rules = applyFeedbackScores(
    resolveRules(profile, { now: generatedAt }),
    profile.feedbackSummary
  );
  const selectedClothing = selectClothingRule(rules, profile.feedbackSummary);
  const selectedHairColor = selectHairColorRule(rules);
  const hairColorContributors = (
    profile.hairColorPreference.willingness === 'no-dye'
    || profile.lockedAreas.includes('hairColor')
  )
    ? selectFamilyRules(rules, 'hairColor').filter(
      ({ layer }) => layer === 'user_preference'
    )
    : selectedHairColor ? [selectedHairColor] : [];
  const appliedTrend = selectedClothing?.layer === 'seasonal_trend'
    ? selectedClothing
    : null;
  const clothing = clothingRecommendation(
    profile,
    basis,
    rules,
    selectedClothing
  );
  const hairColor = hairColorRecommendation(
    profile,
    basis,
    rules,
    selectedHairColor,
    hairColorContributors
  );
  const plan = colorPlan(profile, selectedClothing);
  const sections = {
    clothing: [clothing],
    hair: [hairRecommendation(
      profile,
      basis,
      rules,
      selectFamilyRules(rules, 'hair')
    )],
    hairColor: [hairColor],
    makeup: [makeupRecommendation(
      profile,
      basis,
      rules,
      selectFamilyRules(rules, 'makeup'),
      plan,
      hairColor
    )],
    accessories: [accessoriesRecommendation(
      profile,
      basis,
      rules,
      selectFamilyRules(rules, 'accessories')
    )],
    sceneTransition: sceneRecommendations(
      profile,
      basis,
      rules,
      selectFamilyRules(rules, 'sceneTransition')
    )
  };

  return {
    schemaVersion: 2,
    id: reportId(profile, generatedAt),
    mode: 'local-personalized',
    generatedAt,
    ruleSetVersion: RULE_SET_VERSION,
    confirmedBasis: basis,
    topRecommendations: topRecommendations(
      profile,
      basis,
      selectedClothing,
      selectedHairColor,
      clothing,
      hairColor,
      plan
    ),
    colorPlan: plan,
    outfitPlan: {
      title: clothing.action,
      itemIds: [...clothing.garmentTemplateIds],
      overallDisclaimer: '整体与版型示意，不代表实际试穿、尺码或贴合效果。'
    },
    visualLayers: null,
    sections,
    alternatives: [],
    trendMeta: {
      enabled: profile.trendEnabled === true,
      appliedRuleIds: appliedTrend ? [appliedTrend.id] : [],
      validUntil: appliedTrend?.candidate.expiresOn || null
    }
  };
}

module.exports = {
  RULE_SET_VERSION,
  SECTION_KEYS,
  generateReport,
  isReportForProfile
};
