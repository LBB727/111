function freezeOptions(options) {
  return Object.freeze(options.map((option) => Object.freeze({ ...option })));
}

const { PREFERENCE_VALUES: STYLE_PROFILE_PREFERENCE_VALUES } = require('./preference-options');

const CHOICE_GROUPS = Object.freeze({
  scene: freezeOptions([
    { label: '通勤', value: 'commute' },
    { label: '约会', value: 'date' },
    { label: '日常休闲', value: 'casual' },
    { label: '面试', value: 'interview' },
    { label: '聚会', value: 'party' },
    { label: '旅行', value: 'travel' },
    { label: '正式活动', value: 'formal' }
  ]),
  styles: freezeOptions([
    { label: '简约自然', value: 'natural' },
    { label: '知性干练', value: 'polished' },
    { label: '温柔优雅', value: 'warm' },
    { label: '利落中性', value: 'neutral' },
    { label: '复古文艺', value: 'vintage' },
    { label: '舒适随性', value: 'relaxed' }
  ]),
  budget: freezeOptions([
    { label: '200 元内', value: 'low' },
    { label: '200–500 元', value: 'moderate' },
    { label: '500–1000 元', value: 'high' },
    { label: '1000 元以上', value: 'premium' }
  ]),
  makeup: freezeOptions([
    { label: '淡妆／裸妆', value: 'light' },
    { label: '自然妆', value: 'natural' },
    { label: '精致妆', value: 'defined' },
    { label: '不化妆', value: 'none' }
  ]),
  doNotChange: freezeOptions([
    { label: '发型长度', value: 'hairLength' },
    { label: '发色', value: 'hairColor' },
    { label: '眼镜', value: 'glasses' },
    { label: '妆容习惯', value: 'makeupRoutine' }
  ])
});

const PREFERENCE_VALUES = Object.freeze(
  Object.fromEntries(
    Object.entries(CHOICE_GROUPS).map(([key, options]) => [
      key,
      Object.freeze(options.map((option) => option.value))
    ])
  )
);

const DEFAULT_PREFERENCES = Object.freeze({
  scene: '',
  styles: Object.freeze([]),
  budget: 'moderate',
  makeup: 'light',
  doNotChange: Object.freeze([])
});

const RULE_SCENE_ALIASES = Object.freeze({
  commute: 'commute',
  date: 'date',
  casual: 'daily',
  interview: 'commute',
  party: 'date',
  travel: 'weekend',
  formal: 'commute'
});

const RULE_STYLE_ALIASES = Object.freeze({
  natural: 'natural',
  polished: 'minimal',
  warm: 'natural',
  neutral: 'minimal',
  vintage: 'natural',
  relaxed: 'natural'
});

const LOCKED_CATEGORIES = Object.freeze({
  hairLength: 'hair',
  hairColor: 'hair',
  glasses: 'accessories',
  makeupRoutine: 'makeup'
});

function normalizePreferenceContract(values = {}) {
  const styles = Array.isArray(values.styles)
    ? [...new Set(values.styles.filter((value) => PREFERENCE_VALUES.styles.includes(value)))]
    : [];
  const doNotChange = Array.isArray(values.doNotChange)
    ? [...new Set(values.doNotChange.filter((value) => PREFERENCE_VALUES.doNotChange.includes(value)))]
    : [];
  const scene = PREFERENCE_VALUES.scene.includes(values.scene) ? values.scene : '';
  const budget = PREFERENCE_VALUES.budget.includes(values.budget) ? values.budget : 'moderate';
  const makeup = PREFERENCE_VALUES.makeup.includes(values.makeup) ? values.makeup : 'light';

  return {
    scene,
    styles,
    budget,
    makeup,
    doNotChange,
    ruleScene: RULE_SCENE_ALIASES[scene] || '',
    ruleStyles: styles.map((style) => RULE_STYLE_ALIASES[style]),
    lockedCategories: [...new Set(doNotChange.map((value) => LOCKED_CATEGORIES[value]))]
  };
}

module.exports = {
  CHOICE_GROUPS,
  DEFAULT_PREFERENCES,
  PREFERENCE_VALUES,
  STYLE_PROFILE_PREFERENCE_VALUES,
  normalizePreferenceContract
};
