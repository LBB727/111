function values(items) {
  return Object.freeze([...items]);
}

const PREFERENCE_VALUES = Object.freeze({
  presentationMode: values(['womenswear', 'menswear', 'neutral', 'mixed']),
  scene: values(['commute', 'interview', 'date', 'casual', 'party', 'travel', 'formal']),
  activityContext: values(['indoor', 'outdoor', 'longWalk', 'seated', 'formalReception']),
  desiredEffects: values([
    'clean', 'soft', 'relaxed', 'bold', 'restrained', 'vintage', 'newChinese',
    'vertical', 'shoulderStructure', 'waistDefinition', 'lowerVolume', 'lessCling', 'mobility'
  ]),
  fitPreference: values(['fitted', 'regular', 'relaxed', 'oversized']),
  comfortNeeds: values(['breathable', 'stretch', 'lowMaintenance', 'temperatureLayering', 'secureFootwear']),
  stylePreferences: values(['minimal', 'classic', 'natural', 'warm', 'vintage', 'newChinese', 'lightOutdoor']),
  currentHairColor: values(['naturalBlack', 'deepBrown', 'mediumBrown', 'lightBrown', 'redBrown', 'copper', 'coolBrown', 'blueBlack', 'other', 'unknown']),
  stylingTimeMinutes: values([5, 10, 20]),
  hairColorWillingness: values(['no-dye', 'open', 'wants-dye']),
  acceptsBleach: values(['no', 'professionalAssessment', 'yes']),
  maintenanceLevel: values(['low', 'medium', 'high']),
  workplaceRestriction: values(['conservative', 'flexible', 'unknown']),
  budgetBand: values(['low', 'moderate', 'premium']),
  makeupPreference: values(['none', 'light', 'defined']),
  lockedAreas: values(['hairLength', 'hairColor', 'glasses', 'makeup', 'fit'])
});

const DESIRED_EFFECT_LABELS = Object.freeze({
  clean: '利落',
  soft: '柔和',
  relaxed: '松弛',
  bold: '鲜明',
  restrained: '克制',
  vintage: '复古',
  newChinese: '新中式',
  vertical: '延伸纵向线条',
  shoulderStructure: '增加肩部结构',
  waistDefinition: '突出腰线',
  lowerVolume: '增加下装量感',
  lessCling: '减少贴身感',
  mobility: '方便活动'
});

const STYLE_PREFERENCE_LABELS = Object.freeze({
  minimal: '极简',
  classic: '经典',
  natural: '自然',
  warm: '温暖',
  vintage: '复古',
  newChinese: '新中式',
  lightOutdoor: '轻户外'
});

function choices(items) {
  return Object.freeze(items.map(([label, value]) => Object.freeze({ label, value })));
}

const STYLE_PROFILE_CHOICE_GROUPS = Object.freeze({
  fitPreference: choices([['修身', 'fitted'], ['合身', 'regular'], ['宽松', 'relaxed'], ['廓形', 'oversized']]),
  comfortNeeds: choices([['透气', 'breathable'], ['弹力', 'stretch'], ['易打理', 'lowMaintenance'], ['方便叠穿', 'temperatureLayering'], ['稳妥鞋履', 'secureFootwear']]),
  stylingTimeMinutes: choices([['5 分钟', 5], ['10 分钟', 10], ['20 分钟', 20]]),
  stylePreferences: choices([['极简', 'minimal'], ['经典', 'classic'], ['自然', 'natural'], ['温暖', 'warm'], ['复古', 'vintage'], ['新中式', 'newChinese'], ['轻户外', 'lightOutdoor']]),
  currentHairColor: choices([['自然黑', 'naturalBlack'], ['深棕', 'deepBrown'], ['中棕', 'mediumBrown'], ['浅棕', 'lightBrown'], ['红棕', 'redBrown'], ['铜色', 'copper'], ['冷棕', 'coolBrown'], ['蓝黑', 'blueBlack'], ['其他', 'other'], ['暂不确定', 'unknown']]),
  hairColorWillingness: choices([['不染发', 'no-dye'], ['可以讨论', 'open'], ['想染发', 'wants-dye']]),
  acceptsBleach: choices([['不接受漂发', 'no'], ['接受专业评估', 'professionalAssessment'], ['可以漂发', 'yes']]),
  maintenanceLevel: choices([['低维护', 'low'], ['中维护', 'medium'], ['高维护', 'high']]),
  workplaceRestriction: choices([['保守', 'conservative'], ['灵活', 'flexible'], ['暂不确定', 'unknown']]),
  makeupPreference: choices([['不化妆', 'none'], ['淡妆', 'light'], ['明确重点', 'defined']]),
  lockedAreas: choices([['发长', 'hairLength'], ['发色', 'hairColor'], ['眼镜', 'glasses'], ['妆容', 'makeup'], ['常穿松量', 'fit']])
});

module.exports = {
  PREFERENCE_VALUES,
  DESIRED_EFFECT_LABELS,
  STYLE_PREFERENCE_LABELS,
  STYLE_PROFILE_CHOICE_GROUPS
};
