const { COLOR_PALETTE } = require('../data/color-palette');
const { GARMENT_TEMPLATES } = require('../data/garment-taxonomy');

const GARMENT_KEYS = Object.freeze([
  'necklineOrCollar', 'shoulderConstruction', 'waistPlacement', 'length',
  'sleeveLength', 'trouserRise', 'legShape', 'skirtShape', 'ease',
  'materialAppearance'
]);

const OVERALL_ASSETS = Object.freeze({
  womenswear: '/assets/styling/overall-womenswear.svg',
  menswear: '/assets/styling/overall-menswear.svg',
  neutral: '/assets/styling/overall-neutral.svg',
  mixed: '/assets/styling/overall-mixed.svg'
});

const CONTROLLED_HEXES_BY_NAME = Object.freeze(Object.fromEntries(
  COLOR_PALETTE.map(({ name, hex, reportHex }) => [
    name,
    Object.freeze([...new Set([hex, reportHex].filter(Boolean))])
  ])
));
const DEFAULT_COLOR_BLOCKS = Object.freeze([
  Object.freeze({ name: '藏青', hex: '#1F2A44', percentage: 60 }),
  Object.freeze({ name: '米白', hex: '#F4EFE6', percentage: 30 }),
  Object.freeze({ name: '砖红', hex: '#A84A3A', percentage: 10 })
]);

const HAIR_SWATCH_BY_NAME = Object.freeze({
  自然黑: Object.freeze({ name: '自然黑', hex: '#171514', approximate: true }),
  柔黑: Object.freeze({ name: '柔黑', hex: '#211E1D', approximate: true }),
  黑茶色: Object.freeze({ name: '黑茶色', hex: '#2C211C', approximate: true }),
  深茶棕: Object.freeze({ name: '深茶棕', hex: '#3B261C', approximate: true }),
  巧克力棕: Object.freeze({ name: '巧克力棕', hex: '#4A2C20', approximate: true }),
  栗棕: Object.freeze({ name: '栗棕', hex: '#6A3828', approximate: true }),
  焦糖棕: Object.freeze({ name: '焦糖棕', hex: '#8B5A32', approximate: true }),
  铜棕: Object.freeze({ name: '铜棕', hex: '#8C4C2B', approximate: true }),
  红棕: Object.freeze({ name: '红棕', hex: '#6C2F29', approximate: true }),
  酒红棕: Object.freeze({ name: '酒红棕', hex: '#542631', approximate: true }),
  冷棕: Object.freeze({ name: '冷棕', hex: '#4A403B', approximate: true }),
  灰棕: Object.freeze({ name: '灰棕', hex: '#71645E', approximate: true }),
  蓝黑: Object.freeze({ name: '蓝黑', hex: '#151A24', approximate: true }),
  深橄榄棕: Object.freeze({ name: '深橄榄棕', hex: '#413D2F', approximate: true }),
  奶茶棕: Object.freeze({ name: '奶茶棕', hex: '#9A806C', approximate: true }),
  玫瑰棕: Object.freeze({ name: '玫瑰棕', hex: '#86636A', approximate: true }),
  烟熏紫棕: Object.freeze({ name: '烟熏紫棕', hex: '#5D4A55', approximate: true }),
  深棕: Object.freeze({ name: '深棕', hex: '#3B261C', approximate: true }),
  中棕: Object.freeze({ name: '中棕', hex: '#6A3828', approximate: true }),
  浅棕: Object.freeze({ name: '浅棕', hex: '#9A806C', approximate: true }),
  '当前其他发色': Object.freeze({
    name: '当前其他发色',
    hex: '#8A8D88',
    approximate: true
  }),
  '当前发色（未确认）': Object.freeze({
    name: '当前发色（未确认）',
    hex: '#8A8D88',
    approximate: true
  })
});

const LABELS = Object.freeze({
  necklineOrCollar: Object.freeze({ label: '领型', values: Object.freeze({
    narrowNotchLapel: '窄驳领', crew: '圆领', vNeck: 'V领',
    shirtCollar: '衬衫领', lapel: '驳领', openFront: '开放前襟',
    notApplicable: '不适用', preserveCurrent: '保持当前'
  }) }),
  shoulderConstruction: Object.freeze({ label: '肩部结构', values: Object.freeze({
    setInStructured: '合体结构肩', natural: '自然肩', defined: '清晰肩线',
    dropped: '落肩', raglan: '插肩', notApplicable: '不适用',
    preserveCurrent: '保持当前'
  }) }),
  waistPlacement: Object.freeze({ label: '腰位', values: Object.freeze({
    none: '无固定腰位', natural: '自然腰位', high: '高腰位',
    adjustable: '可调腰位', preserveCurrent: '保持当前'
  }) }),
  length: Object.freeze({ label: '衣长', values: Object.freeze({
    hip: '及臀', midThigh: '大腿中部', knee: '及膝', midi: '中长',
    ankle: '及踝', full: '全长', preserveCurrent: '保持当前'
  }) }),
  sleeveLength: Object.freeze({ label: '袖长', values: Object.freeze({
    notApplicable: '不适用', sleeveless: '无袖', short: '短袖',
    elbow: '及肘', long: '长袖', full: '长袖', preserveCurrent: '保持当前'
  }) }),
  trouserRise: Object.freeze({ label: '裤腰高度', values: Object.freeze({
    notApplicable: '不适用', mid: '中腰', high: '高腰',
    preserveCurrent: '保持当前'
  }) }),
  legShape: Object.freeze({ label: '裤腿轮廓', values: Object.freeze({
    notApplicable: '不适用', straight: '直筒', wideStraight: '宽直筒',
    tapered: '锥形', preserveCurrent: '保持当前'
  }) }),
  skirtShape: Object.freeze({ label: '裙摆轮廓', values: Object.freeze({
    notApplicable: '不适用', column: '直身', aLine: 'A线',
    pleated: '褶裥', preserveCurrent: '保持当前'
  }) }),
  ease: Object.freeze({ label: '松量', values: Object.freeze({
    close: '贴近', regular: '合体', relaxed: '宽松',
    preserveCurrent: '保持当前'
  }) }),
  materialAppearance: Object.freeze({ label: '材质观感', values: Object.freeze({
    midweightWoven: '中等厚度梭织', matteStructured: '哑光挺括',
    matteFluid: '哑光垂顺', softKnit: '柔软针织',
    lightweightCrisp: '轻薄挺爽', subtleLustre: '低调光泽',
    preserveCurrent: '保持当前'
  }) })
});

const TEMPLATE_BY_ID = Object.freeze(Object.fromEntries(
  GARMENT_TEMPLATES.map((template) => [template.id, template])
));

const LEGACY_TEMPLATE_IDS_BY_CLOTHING_ID = Object.freeze({
  'garment-commute-clean-blazer': Object.freeze([
    'singleBreastedBlazer', 'straightTrousers'
  ]),
  'garment-vertical-open-line': Object.freeze([
    'singleBreastedBlazer', 'straightTrousers'
  ]),
  'garment-soft-horizontal-break': Object.freeze([
    'relaxedCardigan', 'wideStraightTrousers'
  ]),
  'garment-defined-shoulder-balance': Object.freeze([
    'singleBreastedBlazer', 'columnMidiSkirt'
  ]),
  'garment-waist-placement-choice': Object.freeze([
    'waistDefinedShirtDress', 'aLineMidiSkirt'
  ]),
  'garment-monochrome-depth': Object.freeze([
    'longSingleBreastedCoat', 'straightTrousers'
  ]),
  'garment-travel-layering': Object.freeze([
    'lightweightOvershirt', 'wideStraightTrousers'
  ]),
  'trend-cn-lightweight-modern-chinese': Object.freeze([
    'singleBreastedBlazer'
  ]),
  'trend-international-ss2026-color-families': Object.freeze([
    'lightweightOvershirt', 'straightTrousers'
  ])
});

const ASSET_BY_TEMPLATE_ID = Object.freeze({
  singleBreastedBlazer: '/assets/styling/item-outerwear.svg',
  straightTrousers: '/assets/styling/item-trousers.svg',
  wideStraightTrousers: '/assets/styling/item-trousers.svg',
  relaxedCardigan: '/assets/styling/item-outerwear.svg',
  columnMidiSkirt: '/assets/styling/item-skirt.svg',
  aLineMidiSkirt: '/assets/styling/item-skirt.svg',
  waistDefinedShirtDress: '/assets/styling/item-dress.svg',
  longSingleBreastedCoat: '/assets/styling/item-outerwear.svg',
  lightweightOvershirt: '/assets/styling/item-outerwear.svg',
  crewNeckKnitTop: '/assets/styling/item-top.svg'
});

const VISUAL_TYPE_BY_ASSET_PATH = Object.freeze({
  '/assets/styling/item-top.svg': 'top',
  '/assets/styling/item-outerwear.svg': 'outerwear',
  '/assets/styling/item-trousers.svg': 'trousers',
  '/assets/styling/item-skirt.svg': 'skirt',
  '/assets/styling/item-dress.svg': 'dress',
  '/assets/styling/item-shoes.svg': 'shoes',
  '/assets/styling/item-bag.svg': 'bag'
});

const OVERALL_SILHOUETTE_BY_TEMPLATE_ID = Object.freeze({
  singleBreastedBlazer: 'outer-short',
  straightTrousers: 'trousers-straight',
  wideStraightTrousers: 'trousers-wide',
  relaxedCardigan: 'outer-soft',
  columnMidiSkirt: 'skirt-column',
  aLineMidiSkirt: 'skirt-a-line',
  waistDefinedShirtDress: 'dress-a-line',
  longSingleBreastedCoat: 'outer-long',
  lightweightOvershirt: 'outer-soft',
  crewNeckKnitTop: 'top'
});

const ALTERNATIVE_BY_TEMPLATE_ID = Object.freeze({
  singleBreastedBlazer: '轻量衬衫式外层',
  straightTrousers: '直身中长裙或不拖地宽直筒裤',
  wideStraightTrousers: '活动方便的直筒长裤',
  relaxedCardigan: '轻量衬衫式外层',
  columnMidiSkirt: '确认步幅后的直筒长裤',
  aLineMidiSkirt: '宽直筒长裤',
  waistDefinedShirtDress: '上装与A线中长裙组合',
  longSingleBreastedCoat: '及臀轻量外层',
  lightweightOvershirt: '可收纳针织开衫',
  crewNeckKnitTop: '有领衬衫或V领针织'
});

const TECHNICAL_ASSET_BY_CLOTHING_ID = Object.freeze({
  'garment-commute-clean-blazer': '/assets/styling/technical-jacket.svg',
  'garment-vertical-open-line': '/assets/styling/technical-jacket.svg',
  'garment-soft-horizontal-break': '/assets/styling/technical-trousers.svg',
  'garment-defined-shoulder-balance': '/assets/styling/technical-skirt.svg',
  'garment-waist-placement-choice': '/assets/styling/technical-dress.svg',
  'garment-monochrome-depth': '/assets/styling/technical-trousers.svg',
  'garment-travel-layering': '/assets/styling/technical-trousers.svg',
  'garment-fit-preserving-low-intervention': '/assets/styling/technical-jacket.svg',
  'garment-feedback-low-intervention': '/assets/styling/technical-jacket.svg'
});

const FOCUS_BY_CLOTHING_ID = Object.freeze({
  'garment-commute-clean-blazer': '纵向开襟与清晰肩线',
  'garment-vertical-open-line': '纵向开襟与清晰肩线',
  'garment-soft-horizontal-break': '柔和层次与宽直筒线条',
  'garment-defined-shoulder-balance': '清晰肩线与直身下装',
  'garment-waist-placement-choice': '可调腰位与渐进裙摆',
  'garment-monochrome-depth': '同色明度与连续长线条',
  'garment-travel-layering': '轻量叠穿与可活动松量',
  'garment-fit-preserving-low-intervention': '保留当前版型，只调整配色层次',
  'garment-feedback-low-intervention': '保留当前版型，只调整可撤回的配色与配饰'
});

const FOCUS_BY_TEMPLATE_ID = Object.freeze({
  singleBreastedBlazer: '纵向开襟与清晰肩线',
  straightTrousers: '直筒裤线',
  wideStraightTrousers: '宽直筒线条',
  relaxedCardigan: '柔和叠穿',
  columnMidiSkirt: '直身下装',
  aLineMidiSkirt: 'A线下装',
  waistDefinedShirtDress: '可调腰位与A线轮廓',
  longSingleBreastedCoat: '连续长线条',
  lightweightOvershirt: '轻量叠穿',
  crewNeckKnitTop: '近脸圆领层次'
});

function controlledColorBlocks(report) {
  const roles = ['main', 'secondary', 'accent'];
  const blocks = roles.map((role) => {
    const source = report?.colorPlan?.[role];
    const controlledHexes = CONTROLLED_HEXES_BY_NAME[source?.name];
    if (
      !controlledHexes?.includes(source.hex)
      || !Number.isInteger(source.percentage)
    ) {
      return null;
    }
    return {
      name: source.name,
      hex: source.hex,
      percentage: source.percentage
    };
  });
  return blocks.map((color, index) => (
    color || { ...DEFAULT_COLOR_BLOCKS[index] }
  ));
}

function technicalAnnotationSource(report, clothing) {
  const templateIds = controlledTemplateIds(report, clothing);
  if (templateIds.includes('preserveCurrentGarments')) return clothing;
  const templates = templateIds.map((id) => TEMPLATE_BY_ID[id]);
  if (templates.length === 0) return clothing;
  const upper = (
    templates.find(({ category }) => category === 'outerLayer')
    || templates.find(({ category }) => category === 'onePiece')
    || templates.find(({ category }) => category === 'top')
  );
  const lower = templates.find(({ category }) => category === 'lowerBody');
  const upperOrLower = upper || lower;
  const lowerSkirtShape = lower?.skirtShape;
  const upperSkirtShape = upper?.skirtShape;

  return {
    necklineOrCollar: upperOrLower.necklineOrCollar,
    shoulderConstruction: upperOrLower.shoulderConstruction,
    waistPlacement: (lower || upperOrLower).waistPlacement,
    length: upperOrLower.length,
    sleeveLength: upperOrLower.sleeveLength,
    trouserRise: lower?.trouserRise || 'notApplicable',
    legShape: lower?.legShape || 'notApplicable',
    skirtShape: lowerSkirtShape && lowerSkirtShape !== 'notApplicable'
      ? lowerSkirtShape
      : upperSkirtShape || 'notApplicable',
    ease: upperOrLower.ease,
    materialAppearance: upperOrLower.materialAppearance
  };
}

function labelsForSource(source, keys = GARMENT_KEYS) {
  return keys.map((key) => {
    const descriptor = LABELS[key];
    return {
      key,
      label: descriptor.label,
      value: descriptor.values[source?.[key]] || '保持当前'
    };
  });
}

function technicalLabels(report, clothing) {
  return labelsForSource(technicalAnnotationSource(report, clothing));
}

function controlledTemplateIds(report, clothing) {
  const sources = [
    clothing?.garmentTemplateIds,
    report?.outfitPlan?.itemIds,
    LEGACY_TEMPLATE_IDS_BY_CLOTHING_ID[clothing?.id]
  ];
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    const ids = [...new Set(source.filter((id) => (
      typeof id === 'string' && TEMPLATE_BY_ID[id]
    )))];
    if (ids.length > 0) return ids;
  }
  return [];
}

function kebabId(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function displayValue(key, value) {
  return LABELS[key]?.values?.[value] || '保持当前';
}

function templateFitKeywords(template) {
  const candidates = template.category === 'lowerBody'
    ? [
      displayValue('trouserRise', template.trouserRise),
      displayValue('legShape', template.legShape),
      displayValue('skirtShape', template.skirtShape),
      displayValue('length', template.length)
    ]
    : template.category === 'onePiece'
      ? [
        displayValue('necklineOrCollar', template.necklineOrCollar),
        displayValue('waistPlacement', template.waistPlacement),
        displayValue('skirtShape', template.skirtShape)
      ]
      : [
        displayValue('necklineOrCollar', template.necklineOrCollar),
        displayValue('shoulderConstruction', template.shoulderConstruction),
        displayValue('ease', template.ease)
      ];
  return [...new Set(candidates.filter((value) => value !== '不适用'))]
    .slice(0, 2);
}

function visualItem({
  id,
  name,
  assetPath,
  colorName,
  hex,
  fitKeywords,
  alternative
}) {
  return {
    id,
    name,
    assetPath,
    colorName,
    hex,
    visualType: VISUAL_TYPE_BY_ASSET_PATH[assetPath],
    fitKeywords,
    alternative
  };
}

function colorRoleForTemplate(template) {
  return template.category === 'top' ? 'secondary' : 'main';
}

function colorForTemplate(template, colorBlocks) {
  return colorBlocks[colorRoleForTemplate(template) === 'secondary' ? 1 : 0];
}

function itemForTemplate(template, colorBlocks) {
  const color = colorForTemplate(template, colorBlocks);
  return visualItem({
    id: `item-template-${kebabId(template.id)}`,
    name: `${color.name}${template.name}`,
    assetPath: ASSET_BY_TEMPLATE_ID[template.id],
    colorName: color.name,
    hex: color.hex,
    fitKeywords: templateFitKeywords(template),
    alternative: ALTERNATIVE_BY_TEMPLATE_ID[template.id]
  });
}

function supportingItems(items, templates, colorBlocks) {
  const hasOuter = templates.some(({ category }) => category === 'outerLayer');
  const hasTop = templates.some(({ category }) => (
    category === 'top' || category === 'onePiece'
  ));
  if (hasOuter && !hasTop && items.length < 6) {
    const color = colorBlocks[1];
    items.push(visualItem({
      id: 'item-supporting-knit-top',
      name: `${color.name}圆领针织上衣`,
      assetPath: '/assets/styling/item-top.svg',
      colorName: color.name,
      hex: color.hex,
      fitKeywords: ['圆领', '合体松量'],
      alternative: '同色系有领衬衫'
    }));
  }
  if (items.length < 4) {
    const color = colorBlocks[0];
    items.push(visualItem({
      id: 'item-supporting-shoes',
      name: `${color.name}低标识鞋履`,
      assetPath: '/assets/styling/item-shoes.svg',
      colorName: color.name,
      hex: color.hex,
      fitKeywords: ['低标识', '活动舒适'],
      alternative: '同明度平底鞋'
    }));
  }
  if (items.length < 5) {
    const color = colorBlocks[2];
    items.push(visualItem({
      id: 'item-supporting-bag',
      name: `${color.name}简洁手袋`,
      assetPath: '/assets/styling/item-bag.svg',
      colorName: color.name,
      hex: color.hex,
      fitKeywords: ['低标识', '清晰轮廓'],
      alternative: '同色系小型手袋'
    }));
  }
  return items;
}

function preservedItems(colorBlocks) {
  return [
    visualItem({
      id: 'item-preserve-top',
      name: '保持现有上装',
      assetPath: '/assets/styling/item-top.svg',
      colorName: colorBlocks[1].name,
      hex: colorBlocks[1].hex,
      fitKeywords: ['保持当前', '调整配色'],
      alternative: '只更换可移除的近脸层'
    }),
    visualItem({
      id: 'item-preserve-lower',
      name: '保持现有下装',
      assetPath: '/assets/styling/item-trousers.svg',
      colorName: colorBlocks[0].name,
      hex: colorBlocks[0].hex,
      fitKeywords: ['保持当前', '活动舒适'],
      alternative: '只调整鞋履或袜履颜色'
    }),
    visualItem({
      id: 'item-preserve-accessory',
      name: '可省略的小面积配饰',
      assetPath: '/assets/styling/item-bag.svg',
      colorName: colorBlocks[2].name,
      hex: colorBlocks[2].hex,
      fitKeywords: ['小面积', '可撤回'],
      alternative: '完全不增加配饰'
    })
  ];
}

function collageItems(report, clothing, colorBlocks) {
  const templateIds = controlledTemplateIds(report, clothing);
  if (templateIds.includes('preserveCurrentGarments')) {
    return preservedItems(colorBlocks);
  }
  const templates = templateIds.map((id) => TEMPLATE_BY_ID[id]);
  if (templates.length === 0) return preservedItems(colorBlocks);
  const items = templates.map((template) => (
    itemForTemplate(template, colorBlocks)
  ));
  return supportingItems(items, templates, colorBlocks).slice(0, 6);
}

function overallPieces(templateIds, colorBlocks) {
  return templateIds
    .map((id) => TEMPLATE_BY_ID[id])
    .filter((template) => OVERALL_SILHOUETTE_BY_TEMPLATE_ID[template.id])
    .map((template) => {
      const colorRole = colorRoleForTemplate(template);
      const color = colorForTemplate(template, colorBlocks);
      return {
        id: `overall-piece-${kebabId(template.id)}`,
        templateId: template.id,
        name: template.name,
        silhouette: OVERALL_SILHOUETTE_BY_TEMPLATE_ID[template.id],
        colorRole,
        colorName: color.name,
        hex: color.hex
      };
    });
}

function technicalAsset(report, clothing) {
  const templates = controlledTemplateIds(report, clothing)
    .map((id) => TEMPLATE_BY_ID[id]);
  if (templates.some(({ id }) => id === 'preserveCurrentGarments')) {
    return '/assets/styling/technical-jacket.svg';
  }
  if (templates.some(({ category }) => category === 'onePiece')) {
    return '/assets/styling/technical-dress.svg';
  }
  if (templates.some(({ skirtShape }) => (
    skirtShape && skirtShape !== 'notApplicable'
  ))) {
    return '/assets/styling/technical-skirt.svg';
  }
  if (templates.some(({ legShape }) => (
    legShape && legShape !== 'notApplicable'
  ))) {
    return '/assets/styling/technical-trousers.svg';
  }
  if (templates.length > 0) {
    return '/assets/styling/technical-jacket.svg';
  }
  const mapped = TECHNICAL_ASSET_BY_CLOTHING_ID[clothing?.id];
  if (mapped) return mapped;
  if (clothing?.skirtShape && clothing.skirtShape !== 'notApplicable') {
    return '/assets/styling/technical-skirt.svg';
  }
  if (clothing?.legShape && clothing.legShape !== 'notApplicable') {
    return '/assets/styling/technical-trousers.svg';
  }
  return '/assets/styling/technical-jacket.svg';
}

function technicalAssetForTemplate(template) {
  if (template.category === 'onePiece') {
    return '/assets/styling/technical-dress.svg';
  }
  if (
    template.category === 'lowerBody'
    && template.skirtShape !== 'notApplicable'
  ) {
    return '/assets/styling/technical-skirt.svg';
  }
  if (
    template.category === 'lowerBody'
    && template.legShape !== 'notApplicable'
  ) {
    return '/assets/styling/technical-trousers.svg';
  }
  return '/assets/styling/technical-jacket.svg';
}

function technicalKeysForTemplate(template) {
  if (template.category === 'lowerBody') {
    return template.legShape !== 'notApplicable'
      ? [
        'waistPlacement', 'length', 'trouserRise', 'legShape', 'ease',
        'materialAppearance'
      ]
      : [
        'waistPlacement', 'length', 'skirtShape', 'ease',
        'materialAppearance'
      ];
  }
  if (template.category === 'onePiece') {
    return [
      'necklineOrCollar', 'shoulderConstruction', 'waistPlacement', 'length',
      'sleeveLength', 'skirtShape', 'ease', 'materialAppearance'
    ];
  }
  return [
    'necklineOrCollar', 'shoulderConstruction', 'waistPlacement', 'length',
    'sleeveLength', 'ease', 'materialAppearance'
  ];
}

function technicalItems(report, clothing) {
  const templateIds = controlledTemplateIds(report, clothing);
  if (templateIds.includes('preserveCurrentGarments')) {
    return [{
      id: 'technical-preserve-current-garments',
      title: '当前已确认服装',
      alt: '保持当前服装轮廓的技术线稿',
      assetPath: '/assets/styling/technical-jacket.svg',
      labels: technicalLabels(report, clothing)
    }];
  }

  const templates = templateIds.map((id) => TEMPLATE_BY_ID[id]);
  if (templates.length === 0) {
    return [{
      id: 'technical-current-guidance',
      title: '当前服装建议',
      alt: '当前服装建议的技术线稿',
      assetPath: technicalAsset(report, clothing),
      labels: technicalLabels(report, clothing)
    }];
  }

  const upper = (
    templates.find(({ category }) => category === 'outerLayer')
    || templates.find(({ category }) => category === 'onePiece')
    || templates.find(({ category }) => category === 'top')
  );
  const lower = templates.find(({ category }) => category === 'lowerBody');

  return [upper, lower]
    .filter((template, index, selected) => (
      template && selected.indexOf(template) === index
    ))
    .slice(0, 2)
    .map((template) => ({
      id: `technical-${kebabId(template.id)}`,
      title: template.name,
      alt: `${template.name}版型技术线稿`,
      assetPath: technicalAssetForTemplate(template),
      labels: labelsForSource(
        template,
        technicalKeysForTemplate(template)
      )
    }));
}

function focusLabel(report, clothing) {
  const templateIds = controlledTemplateIds(report, clothing);
  if (
    clothing?.lowIntervention
    || templateIds.includes('preserveCurrentGarments')
  ) {
    return '保留当前版型与服装轮廓，只同步本次配色层次';
  }
  const templates = templateIds.map((id) => TEMPLATE_BY_ID[id]);
  const upper = templates.find(({ category }) => (
    category === 'outerLayer'
    || category === 'onePiece'
    || category === 'top'
  ));
  const lower = templates.find(({ category }) => category === 'lowerBody');
  const templateFocus = [...new Set(
    [upper, lower]
      .filter(Boolean)
      .map(({ id }) => FOCUS_BY_TEMPLATE_ID[id])
      .filter(Boolean)
  )].join('；');
  if (templateFocus) return templateFocus;
  const mapped = FOCUS_BY_CLOTHING_ID[clothing?.id];
  if (mapped) return mapped;
  const values = [
    displayValue('shoulderConstruction', clothing?.shoulderConstruction),
    displayValue('legShape', clothing?.legShape),
    displayValue('skirtShape', clothing?.skirtShape),
    displayValue('waistPlacement', clothing?.waistPlacement)
  ].filter((value) => !['不适用', '保持当前'].includes(value));
  return [...new Set(values)].slice(0, 2).join('与')
    || '本次服装轮廓与配色层次';
}

function hairSwatch(hairColor) {
  const keepsNaturalBlack = /保留自然黑/.test(hairColor?.action || '');
  const name = keepsNaturalBlack ? '自然黑' : hairColor?.colorName;
  return HAIR_SWATCH_BY_NAME[name] || HAIR_SWATCH_BY_NAME.自然黑;
}

function cloneItems(items) {
  return items.map((entry) => ({
    ...entry,
    fitKeywords: [...entry.fitKeywords]
  }));
}

function buildVisualLayers(report, profile) {
  const clothing = Array.isArray(report?.sections?.clothing)
    ? report.sections.clothing[0]
    : null;
  const hairColor = Array.isArray(report?.sections?.hairColor)
    ? report.sections.hairColor[0]
    : null;
  const overallAsset = OVERALL_ASSETS[profile?.presentationMode]
    || OVERALL_ASSETS.neutral;
  const selectedHairSwatch = hairSwatch(hairColor);
  const colorBlocks = controlledColorBlocks(report);
  const selectedCollageItems = collageItems(report, clothing, colorBlocks);
  const garmentTemplateIds = controlledTemplateIds(report, clothing);
  const preserveCurrent = garmentTemplateIds.includes(
    'preserveCurrentGarments'
  );
  const fitLocked = Array.isArray(profile?.lockedAreas)
    && profile.lockedAreas.includes('fit');

  return {
    overall: {
      title: '整体造型示意',
      alt: preserveCurrent
        ? '低干预保留当前服装轮廓，仅展示可撤回的配色层次'
        : '无五官中性人物展示最终服装轮廓与配色比例',
      assetPath: overallAsset,
      garmentTemplateIds: [...garmentTemplateIds],
      pieces: overallPieces(garmentTemplateIds, colorBlocks),
      accent: {
        colorRole: 'accent',
        colorName: colorBlocks[2].name,
        hex: colorBlocks[2].hex,
        label: '小面积点缀'
      },
      preserveCurrent,
      fitLocked,
      statusLabel: preserveCurrent
        ? fitLocked
          ? '版型已锁定 · 保留当前轮廓'
          : '低干预 · 保留当前轮廓'
        : '按最终单品构图',
      colorBlocks,
      hairColorSwatch: { ...selectedHairSwatch },
      focusLabel: focusLabel(report, clothing),
      disclaimer: '整体与版型示意，不代表实际试穿、尺码或贴合效果。发色色块为屏幕近似参考。'
    },
    collage: {
      title: '单品搭配拼图',
      alt: '三至五件本地原创单品线稿组成的搭配建议',
      items: cloneItems(selectedCollageItems),
      disclaimer: '单品线稿与颜色均为搭配示意，不代表实物材质、尺码或库存。'
    },
    technical: {
      title: '版型技术标注',
      alt: '用虚线与圆点标出服装结构位置的技术线稿',
      assetPath: technicalAsset(report, clothing),
      labels: technicalLabels(report, clothing),
      technicalItems: technicalItems(report, clothing),
      disclaimer: '版型标注为结构示意，不代表实际试穿、尺码或贴合效果。'
    }
  };
}

module.exports = { buildVisualLayers };
