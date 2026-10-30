function freezeScene(scene) {
  return Object.freeze({
    ...scene,
    hardConstraints: Object.freeze([...scene.hardConstraints]),
    basePaletteRoles: Object.freeze([...scene.basePaletteRoles]),
    capsule: Object.freeze({
      ...scene.capsule,
      garmentTemplateIds: Object.freeze([
        ...scene.capsule.garmentTemplateIds
      ]),
      colorIds: Object.freeze([...scene.capsule.colorIds])
    })
  });
}

const SCENE_RULES = Object.freeze([
  freezeScene({
    id: 'commute',
    name: '通勤',
    market: 'CN',
    hardConstraints: ['遵守明确的单位着装要求', '保证通勤方式所需的活动便利'],
    defaultFormality: 'smartCasual',
    basePaletteRoles: ['main', 'secondary', 'nearFace'],
    footwearGuidance: '优先清洁、低标识、适合当天通勤距离的鞋履',
    guidance: '智慧休闲为默认；金融、政府或法律客户接待可提高正式度。',
    action: '先确认单位着装要求和当天通勤距离，再完成整洁且便于活动的组合',
    alternative: '没有明确要求时，可先用藏青外层、米白内搭和直筒长裤。',
    colorReason: '藏青与米白保持通勤所需的清楚边界，砖红只作小面积焦点。',
    capsule: {
      id: 'garment-commute-clean-blazer',
      garmentTemplateIds: [
        'singleBreastedBlazer', 'crewNeckKnitTop', 'straightTrousers'
      ],
      colorIds: ['navy', 'ivory', 'brickRed'],
      action: '选择藏青合体肩单排扣外套，内搭米白窄圆领针织',
      alternative: '天气偏热时改用米白有领衬衫和藏青直筒裤'
    }
  }),
  freezeScene({
    id: 'interview',
    name: '面试',
    market: 'CN',
    hardConstraints: ['已知公司着装要求优先', '衣物和鞋履应支持从容坐立与步行'],
    defaultFormality: 'business',
    basePaletteRoles: ['main', 'secondary', 'nearFace'],
    footwearGuidance: '公司文化未知时，选择清洁、低标识且便于行走的鞋履',
    guidance: '公司文化未知时，以藏青或炭灰、浅色内搭和清洁低标识鞋履为默认。',
    action: '先确认公司着装要求；未知时采用炭灰、浅色内搭和清洁低标识鞋履',
    alternative: '创意岗位可保留同一版型，只把一处内搭换成低饱和色。',
    colorReason: '炭灰与纯白提供清楚但克制的面试层次，藏青只作稳定补充。',
    capsule: {
      id: 'garment-interview-clear-lines',
      garmentTemplateIds: [
        'singleBreastedBlazer', 'crewNeckKnitTop', 'straightTrousers'
      ],
      colorIds: ['charcoal', 'pureWhite', 'navy'],
      action: '选择炭灰单排扣外套、纯白圆领针织与直筒长裤',
      alternative: '公司文化较轻松时，可把外套换成结构清楚的针织开衫'
    }
  }),
  freezeScene({
    id: 'date',
    name: '约会',
    market: 'CN',
    hardConstraints: ['活动类型和场地规则优先', '尊重本人希望呈现和不想改变的部分'],
    defaultFormality: 'activityDependent',
    basePaletteRoles: ['main', 'nearFace', 'accent'],
    footwearGuidance: '按步行距离和活动类型选择舒适鞋履',
    defaultExposure: 'activityAndPreferenceFirst',
    guidance: '先看活动和希望呈现，不默认暴露度或性别化服装。',
    action: '先确认活动类型、场地和步行距离，再决定层次与鞋履',
    alternative: '活动尚未确定时，保留舒适直筒下装和一件可穿脱外层。',
    colorReason: '巧克力与杏色形成温和层次，青绿只保留为小面积重点。',
    capsule: {
      id: 'garment-date-activity-first',
      garmentTemplateIds: [
        'relaxedCardigan', 'crewNeckKnitTop', 'straightTrousers'
      ],
      colorIds: ['chocolate', 'apricot', 'teal'],
      action: '选择宽松针织开衫、圆领针织上衣与直筒长裤',
      alternative: '室外步行较多时，减少一层并换成已验证舒适的鞋履'
    }
  }),
  freezeScene({
    id: 'casual',
    name: '日常休闲',
    market: 'CN',
    hardConstraints: ['舒适和活动需求优先', '优先复用已有衣物'],
    defaultFormality: 'casual',
    basePaletteRoles: ['main', 'secondary'],
    footwearGuidance: '选择已验证舒适且便于当天活动的鞋履',
    guidance: '舒适、重复搭配和现有衣橱优先。',
    action: '优先复用现有衣物，再按当天活动补一件可穿脱上层',
    alternative: '不增加新单品时，用现有上衣与宽直筒下装完成组合。',
    colorReason: '牛仔蓝与燕麦便于重复搭配，鼠尾草绿只作柔和补充。',
    capsule: {
      id: 'garment-casual-repeatable',
      garmentTemplateIds: ['crewNeckKnitTop', 'wideStraightTrousers'],
      colorIds: ['denimBlue', 'oatmeal', 'sageGreen'],
      action: '选择圆领针织上衣与宽直筒长裤，保留日常活动余量',
      alternative: '温差明显时，加一件现有轻量开衫即可'
    }
  }),
  freezeScene({
    id: 'party',
    name: '聚会',
    market: 'CN',
    hardConstraints: ['先确认工作聚会或私人派对', '保留一至两个清楚焦点'],
    defaultFormality: 'social',
    basePaletteRoles: ['main', 'secondary', 'accent'],
    footwearGuidance: '兼顾场地地面、站立时间和整体焦点数量',
    guidance: '一至两个焦点；工作聚会比私人派对克制一级。',
    action: '先确认工作聚会还是私人派对，再把整体焦点控制在一至两处',
    alternative: '不确定聚会性质时，保留清楚外层并只使用一处莓红点缀。',
    colorReason: '藏青与纯白保持主体清楚，莓红集中为一处聚会焦点。',
    capsule: {
      id: 'garment-party-one-focus',
      garmentTemplateIds: [
        'singleBreastedBlazer', 'crewNeckKnitTop', 'straightTrousers'
      ],
      colorIds: ['navy', 'pureWhite', 'berry'],
      action: '选择藏青单排扣外套、纯白圆领针织与直筒长裤',
      alternative: '私人派对可保留版型，只把一件配饰换成莓红'
    }
  }),
  freezeScene({
    id: 'travel',
    name: '旅行',
    market: 'CN',
    hardConstraints: ['天气和场地规则优先', '步行需求、分层与行李复用优先'],
    defaultFormality: 'practical',
    basePaletteRoles: ['main', 'secondary', 'outerLayer'],
    footwearGuidance: '以步行距离、天气和场地规则选择已验证舒适的鞋履',
    guidance: '天气、步行、分层和场地规则优先。',
    action: '先看天气、步行距离和场地规则，再安排可穿脱层次与行李复用',
    alternative: '天气信息不足时，带一件可收纳轻量外层并复用同一双舒适鞋。',
    colorReason: '卡其与米白便于旅行重复搭配，森林绿用于耐脏的深色补充。',
    capsule: {
      id: 'garment-travel-layering',
      garmentTemplateIds: [
        'lightweightOvershirt', 'crewNeckKnitTop', 'wideStraightTrousers'
      ],
      colorIds: ['khaki', 'ivory', 'forestGreen'],
      action: '选择轻量衬衫式外层、圆领针织上衣与宽直筒长裤',
      alternative: '以一件可收纳外层替代多件厚重单品'
    }
  }),
  freezeScene({
    id: 'formal',
    name: '正式活动',
    market: 'CN',
    hardConstraints: ['邀请函或主办方要求优先', '明确场地、时段和礼仪要求'],
    defaultFormality: 'formal',
    basePaletteRoles: ['main', 'secondary', 'accent'],
    footwearGuidance: '在邀请要求内选择清洁、稳妥且可完成全程活动的鞋履',
    invitationRequirementsFirst: true,
    guidance: '邀请要求优先；新中式只作为一至两个现代传统元素的可选覆盖层。',
    action: '先按邀请函、主办方或明确行业着装要求调整正式度',
    alternative: '要求尚未确认时，选择藏青、米白和低标识鞋履的稳妥组合。',
    colorReason: '藏青与米白保持正式活动的稳定层次，酒红只作小面积焦点。',
    capsule: {
      id: 'garment-formal-requirements-first',
      garmentTemplateIds: [
        'singleBreastedBlazer', 'crewNeckKnitTop', 'straightTrousers'
      ],
      colorIds: ['navy', 'ivory', 'burgundy'],
      action: '选择藏青单排扣外套、米白圆领针织与直筒长裤',
      alternative: '主办方要求更高时，在同一配色内提高材质正式度'
    }
  })
]);

module.exports = { SCENE_RULES };
