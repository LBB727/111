const test = require('node:test');
const assert = require('node:assert/strict');

const { STYLE_RULES_V2 } = require('../apps/miniprogram/data/style-rules-v2');
const { COLOR_PALETTE } = require('../apps/miniprogram/data/color-palette');
const { GARMENT_TEMPLATES } = require('../apps/miniprogram/data/garment-taxonomy');
const { SCENE_RULES } = require('../apps/miniprogram/data/scene-rules');
const { HAIR_COLOR_RULES } = require('../apps/miniprogram/data/hair-color-rules');
const { TREND_RULES } = require('../apps/miniprogram/data/trend-rules');
const { generateReport } = require('../apps/miniprogram/services/recommendation-engine');
const {
  buildStyleProfile,
  createDefaultPreferences
} = require('../apps/miniprogram/services/profile-contract');

const banned = [
  '显白', '显瘦', '遮肉', '脸大', '腿短', '黄皮', '缺陷', '标准脸',
  '颜值', '年轻化分数', '丑', '显老', '必须遮住', '遮丑',
  '明星脸', '像明星', '推断民族', '识别民族', '判断性别', '推断年龄',
  '判断收入', '识别性格', '诊断皮肤'
];

test('structured rule copy contains no banned judgments', () => {
  const corpus = JSON.stringify({
    COLOR_PALETTE,
    GARMENT_TEMPLATES,
    SCENE_RULES,
    HAIR_COLOR_RULES,
    STYLE_RULES_V2,
    TREND_RULES
  });

  assert.ok(banned.every((word) => !corpus.includes(word)));
});

test('visible recommendation copy contains no banned judgments', () => {
  const report = generateReport(buildStyleProfile({
    analysisMode: 'manual',
    appearance: {
      lineQuality: 'sharp',
      valueContrast: 'high',
      visualScale: 'strong'
    },
    preferences: {
      ...createDefaultPreferences(),
      scenes: ['date'],
      stylePreferences: ['minimal'],
      lockedAreas: ['hairLength'],
      makeupPreference: 'none'
    }
  }), { now: '2026-07-29T00:00:00.000Z' });
  const corpus = JSON.stringify(report);

  assert.ok(banned.every((word) => !corpus.includes(word)));
});
