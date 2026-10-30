#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const PAGE_EXTENSIONS = ['js', 'json', 'wxml', 'wxss'];
const SOURCE_EXTENSIONS = new Set(['.js', '.wxml', '.wxss', '.svg']);
const EXPECTED_PAGE_ROUTES = Object.freeze([
  'pages/home/index',
  'pages/consent/index',
  'pages/profile/index',
  'pages/capture/index',
  'pages/quality-check/index',
  'pages/feature-review/index',
  'pages/preferences/index',
  'pages/processing/index',
  'pages/result/index',
  'pages/settings/index'
]);
const VISUAL_COMPONENTS = Object.freeze({
  'color-plan': '/components/color-plan/index',
  'overall-look': '/components/overall-look/index',
  'outfit-collage': '/components/outfit-collage/index',
  'garment-technical': '/components/garment-technical/index'
});
const EVIDENCE_FILES = new Set([
  'data/style-rules-v2.js',
  'data/trend-rules.js'
]);
const EVIDENCE_HOSTS = new Set([
  'openstd.samr.gov.cn',
  'www.cntac.org.cn',
  'www.pantonecn.com',
  'www.cie.co.at',
  'dxs.moe.gov.cn',
  'www.mfa.gov.cn',
  'www.cma.gov.cn',
  'pubmed.ncbi.nlm.nih.gov',
  'arxiv.org'
]);
const PROHIBITED_TERMS = [
  '必须遮住',
  '标准脸',
  '遮丑',
  '缺陷',
  '显老',
  '丑',
  '颜值',
  '明星脸',
  '像明星',
  '推断民族',
  '识别民族',
  '判断性别',
  '推断年龄',
  '判断收入',
  '识别性格',
  '诊断皮肤',
  '年轻化分数'
];
const APPROVED_TERM_CONTEXTS = ['不做颜值评分', '不会进行颜值评分'];
const WX_NETWORK_METHODS = [
  'request',
  'uploadFile',
  'downloadFile',
  'connectSocket',
  'createTCPSocket',
  'createUDPSocket'
];
const GLOBAL_NETWORK_APIS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket'
];
const SAFE_WX_COMPUTED_UI_METHODS = new Set([
  'hideLoading',
  'hideToast',
  'navigateBack',
  'navigateTo',
  'pageScrollTo',
  'previewImage',
  'reLaunch',
  'redirectTo',
  'setNavigationBarColor',
  'setNavigationBarTitle',
  'showActionSheet',
  'showLoading',
  'showModal',
  'showToast',
  'switchTab'
]);
const WX_PHOTO_PERSISTENCE_METHODS = [
  'setStorage',
  'setStorageSync',
  'saveFile',
  'saveFileSync'
];
const FILE_SYSTEM_PHOTO_PERSISTENCE_METHODS = [
  'writeFile',
  'writeFileSync',
  'appendFile',
  'appendFileSync',
  'copyFile',
  'copyFileSync',
  'rename',
  'renameSync'
];
const PHOTO_PATH_REFERENCE = /(?:\b(?:photo|image|preview|tempFile)[A-Za-z0-9_$]*(?:Path|Uri|Url)\b|\b(?:Path|Uri|Url)[A-Za-z0-9_$]*(?:Photo|Image)\b|[.[\s]['"](?:photoPath|tempFilePath|previewPath|imagePath|localPhotoPath)['"]\]?)/i;
const PROHIBITED_SIMULATED_ANALYSIS = [
  /\bsimulateFeatures\b/,
  /\blocal-demo\b/,
  /自动识别颜值/,
  /本地演示\s*AI/i
];
const MODEL_KEY_PATTERNS = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\bOPENAI_API_KEY\b/,
  /\b(?:SecretId|SecretKey)\s*[:=]\s*['"][^'"]+['"]/,
  /\bapiKey\s*[:=]\s*['"][^'"]+['"]/i
];
const REPORT_SECTIONS = Object.freeze([
  '本次由用户确认的依据',
  '今日最值得先尝试的三项',
  '具体色彩方案',
  '整体穿搭示意图',
  '单品拼贴卡',
  '核心服装结构图',
  '发型与发色',
  '妆造',
  '配饰与眼镜',
  '场合切换',
  '替代方案',
  '推荐理由与趋势有效期'
]);
const CONTROLLED_CONTRACTS = Object.freeze([
  Object.freeze({
    file: 'services/report-state.js',
    fields: Object.freeze([
      'confirmedBasis', 'topRecommendations', 'colorPlan', 'outfitPlan',
      'visualLayers', 'sections', 'alternatives', 'trendMeta',
      'main', 'secondary', 'accent', 'nearFace', 'lowerBody', 'accessories',
      'reason', 'screenColorDisclaimer',
      'necklineOrCollar', 'shoulderConstruction', 'waistPlacement', 'length',
      'sleeveLength', 'trouserRise', 'legShape', 'skirtShape', 'ease',
      'materialAppearance', 'colorName', 'colorFamily', 'depthBand',
      'toneDirection', 'applicationStyle', 'bleachExpectation',
      'maintenanceLevel', 'fadeDirection', 'sceneFit', 'wardrobeColorLinks',
      'makeupAndAccessoryLinks', 'noDyeAlternative', 'trendValidUntil',
      'safetyNote', 'hair', 'hairColor', 'makeup', 'sceneTransition'
    ])
  }),
  Object.freeze({
    file: 'data/garment-taxonomy.js',
    fields: Object.freeze([
      'necklineOrCollar', 'shoulderConstruction', 'waistPlacement', 'length',
      'sleeveLength', 'trouserRise', 'legShape', 'skirtShape', 'ease',
      'materialAppearance'
    ])
  }),
  Object.freeze({
    file: 'data/hair-color-rules.js',
    fields: Object.freeze([
      'name', 'level', 'temperature', 'applicationMethod',
      'bleachExpectation', 'maintenanceLevel', 'fadeDirection', 'scenes',
      'wardrobeLinks', 'groomingLinks', 'noDyeAlternative', 'safetyNote'
    ])
  })
]);
const VISUAL_COMPONENT_FIELDS = Object.freeze({
  'components/color-plan/index.wxml': Object.freeze([
    'row.name', 'row.percentage', 'row.placements', 'plan.alternatives',
    'plan.reason', 'plan.screenColorDisclaimer'
  ]),
  'components/overall-look/index.wxml': Object.freeze([
    'layer.assetPath', 'layer.colorBlocks', 'layer.hairColorSwatch',
    'layer.focusLabel', 'layer.disclaimer'
  ]),
  'components/outfit-collage/index.wxml': Object.freeze([
    'item.assetPath', 'item.name', 'item.colorName', 'item.fitKeywords',
    'item.alternative', 'layer.disclaimer'
  ]),
  'components/garment-technical/index.wxml': Object.freeze([
    'layer.assetPath', 'layer.labels', 'item.label', 'item.value',
    'layer.disclaimer'
  ])
});
const CONTROLLED_RUNTIME_MEDIA_FIELDS = new Set([
  'assetPath',
  'photoPath',
  'previewPath',
  'tempFilePath',
  'localPhotoPath'
]);

const REQUIRED_CONTENT = [
  {
    file: 'pages/home/index.wxml',
    label: '静态可见内容',
    values: [
      '本色衣橱',
      '从你的本色出发',
      '用你确认的信息，整理一份适合当下场景的穿搭灵感',
      '手动完成造型档案',
      '使用照片辅助观察',
      '本地记录 · 不做自动外貌识别',
      '查看示例报告',
      '隐私与本地数据'
    ]
  },
  {
    file: 'pages/consent/index.wxml',
    files: ['pages/consent/index.wxml', 'pages/consent/index.js'],
    label: '静态可见内容',
    values: [
      '已确认档案和报告会保存在本机',
      '照片路径只保留当前会话',
      '不会上传',
      '隐私与本地数据',
      '我已年满 18 岁',
      '我确认使用的是本人照片，且有权使用',
      '我同意在本机处理照片和相关造型特征'
    ]
  },
  {
    file: 'pages/capture/index.wxml',
    label: '静态可见内容',
    values: [
      '拍摄照片',
      '从相册选择',
      '照片路径与读取信息仅保留在本次会话中'
    ]
  },
  {
    file: 'pages/feature-review/index.wxml',
    label: '静态可见内容',
    values: ['演示初始值，不是身份或外貌评分', '确认并继续']
  },
  {
    file: 'pages/preferences/index.wxml',
    label: '静态可见内容',
    values: ['选择场景（单选）', '风格偏好（可多选）', '生成我的建议']
  },
  {
    file: 'pages/processing/index.wxml',
    label: '静态可见内容',
    values: ['本地规则分析', '不会上传照片或你的选择', '立即查看']
  },
  {
    file: 'pages/result/index.wxml',
    label: '静态可见内容',
    values: ['最值得先尝试的三项', '重新分析', '隐私与本地数据']
  },
  {
    file: 'components/recommendation-card/index.wxml',
    label: '建议依据或替代项',
    values: ['为什么这样建议', 'item.reason', 'item.alternative']
  },
  {
    file: 'pages/settings/index.wxml',
    label: '删除入口',
    values: [
      '清除当前照片',
      '清除报告',
      '清除收藏',
      '清除全部本地数据'
    ]
  }
];
function toPosix(value) {
  return value.split(path.sep).join('/');
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(target));
    } else if (entry.isFile()) {
      files.push(target);
    }
  }
  return files;
}

function decodeJsString(raw) {
  const quote = raw[0];
  const body = raw.slice(1, -1);
  let value = '';
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char !== '\\') {
      value += char;
      continue;
    }
    index += 1;
    if (index >= body.length) break;
    const escaped = body[index];
    const simple = {
      n: '\n',
      r: '\r',
      t: '\t',
      b: '\b',
      f: '\f',
      v: '\v',
      0: '\0'
    };
    if (Object.prototype.hasOwnProperty.call(simple, escaped)) {
      value += simple[escaped];
      continue;
    }
    if (escaped === 'x' && /^[0-9a-fA-F]{2}$/.test(body.slice(index + 1, index + 3))) {
      value += String.fromCodePoint(parseInt(body.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    if (escaped === 'u') {
      if (body[index + 1] === '{') {
        const close = body.indexOf('}', index + 2);
        const digits = close === -1 ? '' : body.slice(index + 2, close);
        if (/^[0-9a-fA-F]{1,6}$/.test(digits)) {
          value += String.fromCodePoint(parseInt(digits, 16));
          index = close;
          continue;
        }
      }
      const digits = body.slice(index + 1, index + 5);
      if (/^[0-9a-fA-F]{4}$/.test(digits)) {
        value += String.fromCodePoint(parseInt(digits, 16));
        index += 4;
        continue;
      }
    }
    if (escaped === '\n' || escaped === '\r') continue;
    value += escaped === quote ? quote : escaped;
  }
  return value;
}

function tokenizeJavaScript(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      index += 2;
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        index += 1;
      }
      index += 2;
      continue;
    }
    if (char === "'" || char === '"') {
      const start = index;
      const quote = char;
      index += 1;
      let escaped = false;
      while (index < source.length) {
        const current = source[index];
        index += 1;
        if (escaped) {
          escaped = false;
        } else if (current === '\\') {
          escaped = true;
        } else if (current === quote) {
          break;
        }
      }
      const raw = source.slice(start, index);
      tokens.push({
        type: 'string',
        value: decodeJsString(raw),
        raw,
        start,
        end: index
      });
      continue;
    }
    if (char === '`') {
      const start = index;
      index += 1;
      let escaped = false;
      while (index < source.length) {
        const current = source[index];
        index += 1;
        if (escaped) {
          escaped = false;
        } else if (current === '\\') {
          escaped = true;
        } else if (current === '`') {
          break;
        }
      }
      tokens.push({
        type: 'template',
        value: source.slice(start + 1, index - 1),
        raw: source.slice(start, index),
        start,
        end: index
      });
      continue;
    }
    if (/[A-Za-z_$]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[\w$]/.test(source[index])) index += 1;
      tokens.push({
        type: 'identifier',
        value: source.slice(start, index),
        start,
        end: index
      });
      continue;
    }
    tokens.push({
      type: 'punctuator',
      value: char,
      start: index,
      end: index + 1
    });
    index += 1;
  }
  return tokens;
}

function findMatchingToken(tokens, openingIndex, opening, closing) {
  let depth = 0;
  for (let index = openingIndex; index < tokens.length; index += 1) {
    if (tokens[index].value === opening) depth += 1;
    if (tokens[index].value === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function evaluateStaticValue(tokens, start, constants = new Map()) {
  function primary(index) {
    const token = tokens[index];
    if (!token) return { known: false, next: index };
    if (token.type === 'string') {
      return { known: true, value: token.value, next: index + 1 };
    }
    if (token.type === 'template' && !token.value.includes('${')) {
      return { known: true, value: token.value, next: index + 1 };
    }
    if (token.type === 'identifier' && constants.has(token.value)) {
      return { known: true, value: constants.get(token.value), next: index + 1 };
    }
    if (token.value === '(') {
      const nested = expression(index + 1);
      if (!nested.known || tokens[nested.next]?.value !== ')') {
        return { known: false, next: index + 1 };
      }
      return { ...nested, next: nested.next + 1 };
    }
    if (token.value !== '[') return { known: false, next: index + 1 };

    const values = [];
    let cursor = index + 1;
    if (tokens[cursor]?.value !== ']') {
      while (cursor < tokens.length) {
        const item = expression(cursor);
        if (!item.known) return { known: false, next: index + 1 };
        values.push(item.value);
        cursor = item.next;
        if (tokens[cursor]?.value === ',') {
          cursor += 1;
          continue;
        }
        break;
      }
    }
    if (tokens[cursor]?.value !== ']') return { known: false, next: index + 1 };
    cursor += 1;
    return { known: true, value: values, next: cursor };
  }

  function postfix(index) {
    let result = primary(index);
    if (!result.known) return result;
    const member = Array.isArray(result.value)
      ? readMemberProperty(tokens, result.next, constants)
      : null;
    if (
      member?.known
      && member.value === 'join'
      && tokens[member.next]?.value === '('
    ) {
      const separator = expression(member.next + 1);
      if (
        !separator.known
        || typeof separator.value !== 'string'
        || tokens[separator.next]?.value !== ')'
      ) {
        return { known: false, next: result.next };
      }
      result = {
        known: true,
        value: result.value.join(separator.value),
        next: separator.next + 1
      };
    }
    return result;
  }

  function expression(index) {
    let result = postfix(index);
    if (!result.known) return result;
    while (tokens[result.next]?.value === '+') {
      const right = postfix(result.next + 1);
      if (
        !right.known
        || typeof result.value !== 'string'
        || typeof right.value !== 'string'
      ) {
        return { known: false, next: result.next + 1 };
      }
      result = {
        known: true,
        value: result.value + right.value,
        next: right.next
      };
    }
    return result;
  }

  return expression(start);
}

function evaluateStaticString(tokens, start, constants = new Map()) {
  const evaluated = evaluateStaticValue(tokens, start, constants);
  return evaluated.known && typeof evaluated.value === 'string'
    ? evaluated
    : { known: false, next: evaluated.next };
}

function collectStaticConstants(tokens) {
  const constants = new Map();
  const declarationCounts = new Map();
  for (let index = 0; index + 2 < tokens.length; index += 1) {
    if (tokens[index].value !== 'const') continue;
    const name = tokens[index + 1];
    if (name?.type !== 'identifier' || tokens[index + 2]?.value !== '=') continue;
    declarationCounts.set(name.value, (declarationCounts.get(name.value) || 0) + 1);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index + 3 < tokens.length; index += 1) {
      if (tokens[index].value !== 'const') continue;
      const name = tokens[index + 1];
      if (name?.type !== 'identifier' || tokens[index + 2]?.value !== '=') continue;
      if (declarationCounts.get(name.value) !== 1 || constants.has(name.value)) continue;
      const evaluated = evaluateStaticValue(tokens, index + 3, constants);
      if (evaluated.known) {
        constants.set(name.value, evaluated.value);
        changed = true;
      }
    }
  }
  return constants;
}

function readMemberProperty(tokens, accessorIndex, constants) {
  const accessor = tokens[accessorIndex];
  if (accessor?.value === '.') {
    const property = tokens[accessorIndex + 1];
    return property?.type === 'identifier'
      ? {
          known: true,
          value: property.value,
          next: accessorIndex + 2,
          computed: false
        }
      : { known: false, next: accessorIndex + 1 };
  }
  if (accessor?.value !== '[') return null;
  const closing = findMatchingToken(tokens, accessorIndex, '[', ']');
  if (closing === -1) return { known: false, next: accessorIndex + 1 };
  const evaluated = evaluateStaticString(tokens, accessorIndex + 1, constants);
  return evaluated.known && evaluated.next === closing
    ? {
        known: true,
        value: evaluated.value,
        next: closing + 1,
        computed: true
      }
    : { known: false, next: closing + 1, computed: true };
}

function readPlatformReference(
  tokens,
  start,
  constants,
  globalAliases,
  wxAliases,
  allowWxMember = false
) {
  const token = tokens[start];
  if (!token) return null;
  let reference;
  if (token.value === '(') {
    const closing = findMatchingToken(tokens, start, '(', ')');
    if (closing === -1) return null;
    const nested = readPlatformReference(
      tokens,
      start + 1,
      constants,
      globalAliases,
      wxAliases,
      allowWxMember
    );
    if (!nested || nested.next !== closing) return null;
    reference = { ...nested, next: closing + 1 };
  } else {
    if (token.type !== 'identifier') return null;
    if (wxAliases.has(token.value)) {
      reference = { kind: 'wx', next: start + 1 };
    } else if (globalAliases.has(token.value)) {
      reference = { kind: 'globalThis', next: start + 1 };
    } else {
      return null;
    }
  }

  const property = readMemberProperty(tokens, reference.next, constants);
  if (reference.kind === 'wx') {
    return property && !allowWxMember ? null : reference;
  }
  if (!property) return reference;
  if (!property.known || property.value !== 'wx') return null;
  const wxReference = { kind: 'wx', next: property.next };
  return !allowWxMember
    && readMemberProperty(tokens, wxReference.next, constants)
    ? null
    : wxReference;
}

function collectPlatformAliases(tokens, constants) {
  const globalAliases = new Set(['globalThis']);
  const wxAliases = new Set(['wx']);
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index + 2 < tokens.length; index += 1) {
      const name = tokens[index];
      if (
        name.type !== 'identifier'
        || tokens[index + 1]?.value !== '='
        || tokens[index + 2]?.value === '='
        || tokens[index - 1]?.value === '.'
      ) continue;
      const reference = readPlatformReference(
        tokens,
        index + 2,
        constants,
        globalAliases,
        wxAliases
      );
      if (!reference) continue;
      const target = reference.kind === 'wx' ? wxAliases : globalAliases;
      if (!target.has(name.value)) {
        target.add(name.value);
        changed = true;
      }
    }

    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index].value !== '{') continue;
      const closing = findMatchingToken(tokens, index, '{', '}');
      if (closing === -1 || tokens[closing + 1]?.value !== '=') continue;
      const reference = readPlatformReference(
        tokens,
        closing + 2,
        constants,
        globalAliases,
        wxAliases
      );
      if (!reference || reference.kind !== 'globalThis') continue;

      let cursor = index + 1;
      while (cursor < closing) {
        let propertyName = '';
        if (tokens[cursor]?.value === '[') {
          const propertyClosing = findMatchingToken(tokens, cursor, '[', ']');
          if (propertyClosing === -1 || propertyClosing >= closing) break;
          const computed = evaluateStaticString(
            tokens,
            cursor + 1,
            constants
          );
          if (computed.known && computed.next === propertyClosing) {
            propertyName = computed.value;
          }
          cursor = propertyClosing + 1;
        } else if (['identifier', 'string'].includes(tokens[cursor]?.type)) {
          propertyName = tokens[cursor].value;
          cursor += 1;
        } else {
          cursor += 1;
          continue;
        }
        let alias = propertyName;
        if (tokens[cursor]?.value === ':' && tokens[cursor + 1]?.type === 'identifier') {
          alias = tokens[cursor + 1].value;
          cursor += 2;
        }
        if (propertyName === 'wx' && alias && !wxAliases.has(alias)) {
          wxAliases.add(alias);
          changed = true;
        }
        while (cursor < closing && tokens[cursor]?.value !== ',') cursor += 1;
        if (tokens[cursor]?.value === ',') cursor += 1;
      }
    }
  }
  return { globalAliases, wxAliases };
}

function splitCallArguments(tokens, openingIndex, closingIndex) {
  const argumentsList = [];
  let start = openingIndex + 1;
  let parentheses = 0;
  let brackets = 0;
  let braces = 0;
  for (let index = start; index < closingIndex; index += 1) {
    const value = tokens[index].value;
    if (value === '(') parentheses += 1;
    if (value === ')') parentheses -= 1;
    if (value === '[') brackets += 1;
    if (value === ']') brackets -= 1;
    if (value === '{') braces += 1;
    if (value === '}') braces -= 1;
    if (
      value === ','
      && parentheses === 0
      && brackets === 0
      && braces === 0
    ) {
      argumentsList.push({ start, end: index });
      start = index + 1;
    }
  }
  argumentsList.push({ start, end: closingIndex });
  return argumentsList;
}

function stripOuterParentheses(tokens, start, end) {
  let range = { start, end };
  while (
    tokens[range.start]?.value === '('
    && findMatchingToken(tokens, range.start, '(', ')') === range.end - 1
  ) {
    range = { start: range.start + 1, end: range.end - 1 };
  }
  return range;
}

function readObjectMethodCall(tokens, start, method) {
  if (
    tokens[start]?.value !== 'Object'
    || tokens[start + 1]?.value !== '.'
    || tokens[start + 2]?.value !== method
    || tokens[start + 3]?.value !== '('
  ) {
    return null;
  }
  const closing = findMatchingToken(tokens, start + 3, '(', ')');
  return closing === -1
    ? null
    : {
        opening: start + 3,
        closing,
        next: closing + 1
      };
}

function projectedEntryTuple(tokens, start, end, sourceParameter) {
  let cursor = start;
  let field;
  if (tokens[cursor]?.value === '(') {
    const parametersClosing = findMatchingToken(tokens, cursor, '(', ')');
    if (
      parametersClosing !== cursor + 2
      || tokens[cursor + 1]?.type !== 'identifier'
    ) {
      return false;
    }
    field = tokens[cursor + 1].value;
    cursor = parametersClosing + 1;
  } else if (tokens[cursor]?.type === 'identifier') {
    field = tokens[cursor].value;
    cursor += 1;
  } else {
    return false;
  }
  if (
    tokens[cursor]?.value !== '='
    || tokens[cursor + 1]?.value !== '>'
  ) {
    return false;
  }
  const tuple = stripOuterParentheses(tokens, cursor + 2, end);
  return (
    tuple.end - tuple.start === 8
    && tokens[tuple.start]?.value === '['
    && tokens[tuple.start + 1]?.value === field
    && tokens[tuple.start + 2]?.value === ','
    && tokens[tuple.start + 3]?.value === sourceParameter
    && tokens[tuple.start + 4]?.value === '['
    && tokens[tuple.start + 5]?.value === field
    && tokens[tuple.start + 6]?.value === ']'
    && tokens[tuple.start + 7]?.value === ']'
  );
}

function safeRuntimeFieldMapping(tokens, start, end, sourceParameter) {
  const range = stripOuterParentheses(tokens, start, end);
  if (tokens[range.start]?.value !== 'SAFE_RULE_RUNTIME_FIELDS') return false;

  let cursor = range.start + 1;
  while (cursor < range.end) {
    const member = readMemberProperty(tokens, cursor, new Map());
    if (
      !member?.known
      || !['filter', 'map'].includes(member.value)
      || tokens[member.next]?.value !== '('
    ) {
      return false;
    }
    const closing = findMatchingToken(tokens, member.next, '(', ')');
    if (closing === -1 || closing >= range.end) return false;
    if (member.value === 'map') {
      const args = splitCallArguments(tokens, member.next, closing);
      return (
        closing + 1 === range.end
        && args.length === 1
        && projectedEntryTuple(
          tokens,
          args[0].start,
          args[0].end,
          sourceParameter
        )
      );
    }
    cursor = closing + 1;
  }
  return false;
}

function safeAllowlistLoopProjection(
  tokens,
  bodyOpening,
  bodyClosing,
  returnIndex,
  sourceParameter,
  returnedName
) {
  let declarationNameIndex = -1;
  for (let index = bodyOpening + 1; index < returnIndex; index += 1) {
    if (
      ['const', 'let'].includes(tokens[index].value)
      && tokens[index + 1]?.value === returnedName
      && tokens[index + 2]?.value === '='
      && tokens[index + 3]?.value === '{'
      && tokens[index + 4]?.value === '}'
    ) {
      if (declarationNameIndex !== -1) return false;
      declarationNameIndex = index + 1;
    }
  }
  if (declarationNameIndex === -1) return false;

  let loop = null;
  for (let index = bodyOpening + 1; index < returnIndex; index += 1) {
    if (tokens[index].value !== 'for' || tokens[index + 1]?.value !== '(') {
      continue;
    }
    const headerClosing = findMatchingToken(tokens, index + 1, '(', ')');
    if (
      headerClosing === -1
      || tokens[headerClosing + 1]?.value !== '{'
    ) {
      return false;
    }
    const bodyClosingIndex = findMatchingToken(
      tokens,
      headerClosing + 1,
      '{',
      '}'
    );
    const header = tokens.slice(index + 2, headerClosing);
    if (
      bodyClosingIndex === -1
      || header.length !== 4
      || !['const', 'let'].includes(header[0]?.value)
      || header[1]?.type !== 'identifier'
      || header[2]?.value !== 'of'
      || header[3]?.value !== 'SAFE_RULE_RUNTIME_FIELDS'
    ) {
      return false;
    }
    if (loop) return false;
    loop = {
      field: header[1].value,
      bodyOpening: headerClosing + 1,
      bodyClosing: bodyClosingIndex
    };
  }
  if (!loop) return false;

  let assignmentStart = -1;
  let assignmentEquals = -1;
  for (
    let index = loop.bodyOpening + 1;
    index < loop.bodyClosing;
    index += 1
  ) {
    if (
      tokens[index].value === returnedName
      && tokens[index + 1]?.value === '['
      && tokens[index + 2]?.value === loop.field
      && tokens[index + 3]?.value === ']'
      && tokens[index + 4]?.value === '='
      && tokens[index + 5]?.value === sourceParameter
      && tokens[index + 6]?.value === '['
      && tokens[index + 7]?.value === loop.field
      && tokens[index + 8]?.value === ']'
    ) {
      if (assignmentStart !== -1) return false;
      assignmentStart = index;
      assignmentEquals = index + 4;
    }
  }
  if (assignmentStart === -1) return false;

  const returnedNameIndexes = new Set([
    declarationNameIndex,
    assignmentStart
  ]);
  for (let index = returnIndex + 1; index < bodyClosing; index += 1) {
    if (tokens[index].value === returnedName) returnedNameIndexes.add(index);
  }
  for (let index = bodyOpening + 1; index < bodyClosing; index += 1) {
    if (
      tokens[index].value === returnedName
      && !returnedNameIndexes.has(index)
    ) {
      return false;
    }
    if (
      tokens[index].value === '='
      && index !== declarationNameIndex + 1
      && index !== assignmentEquals
    ) {
      if (tokens[index + 1]?.value !== '>') return false;
    }
    if (tokens[index].value !== sourceParameter) continue;
    const directFieldRead = (
      tokens[index + 1]?.value === '['
      && tokens[index + 2]?.value === loop.field
      && tokens[index + 3]?.value === ']'
    );
    const hasOwnCheck = (
      tokens[index - 4]?.value === 'Object'
      && tokens[index - 3]?.value === '.'
      && tokens[index - 2]?.value === 'hasOwn'
      && tokens[index - 1]?.value === '('
      && tokens[index + 1]?.value === ','
      && tokens[index + 2]?.value === loop.field
      && tokens[index + 3]?.value === ')'
    );
    if (!directFieldRead && !hasOwnCheck) return false;
  }
  return true;
}

function safeRuleProjectionImplementation(source) {
  const tokens = tokenizeJavaScript(source);
  const functions = [];
  for (let index = 0; index + 3 < tokens.length; index += 1) {
    if (
      tokens[index].value !== 'function'
      || tokens[index + 1]?.value !== 'projectSafeRuleCandidate'
      || tokens[index + 2]?.value !== '('
    ) {
      continue;
    }
    const parametersClosing = findMatchingToken(tokens, index + 2, '(', ')');
    if (parametersClosing === -1 || tokens[parametersClosing + 1]?.value !== '{') {
      continue;
    }
    const bodyOpening = parametersClosing + 1;
    const bodyClosing = findMatchingToken(tokens, bodyOpening, '{', '}');
    if (bodyClosing === -1) continue;
    functions.push({
      parametersOpening: index + 2,
      parametersClosing,
      bodyOpening,
      bodyClosing
    });
  }
  if (functions.length !== 1) return false;

  const projection = functions[0];
  const parameters = tokens.slice(
    projection.parametersOpening + 1,
    projection.parametersClosing
  );
  if (
    parameters.length !== 1
    || parameters[0].type !== 'identifier'
  ) {
    return false;
  }
  const sourceParameter = parameters[0].value;

  for (
    let index = projection.bodyOpening + 1;
    index < projection.bodyClosing;
    index += 1
  ) {
    if (
      ['const', 'let', 'var', 'function', 'class'].includes(tokens[index].value)
      && [sourceParameter, 'SAFE_RULE_RUNTIME_FIELDS'].includes(
        tokens[index + 1]?.value
      )
    ) {
      return false;
    }
  }

  const returns = [];
  for (
    let index = projection.bodyOpening + 1;
    index < projection.bodyClosing;
    index += 1
  ) {
    if (tokens[index].value === 'return') returns.push(index);
  }
  if (returns.length !== 1) return false;

  const expressionStart = returns[0] + 1;
  let expressionEnd = projection.bodyClosing;
  let parentheses = 0;
  let brackets = 0;
  let braces = 0;
  for (let index = expressionStart; index < projection.bodyClosing; index += 1) {
    const value = tokens[index].value;
    if (
      value === ';'
      && parentheses === 0
      && brackets === 0
      && braces === 0
    ) {
      expressionEnd = index;
      break;
    }
    if (value === '(') parentheses += 1;
    if (value === ')') parentheses -= 1;
    if (value === '[') brackets += 1;
    if (value === ']') brackets -= 1;
    if (value === '{') braces += 1;
    if (value === '}') braces -= 1;
  }

  let expression = stripOuterParentheses(tokens, expressionStart, expressionEnd);
  const freeze = readObjectMethodCall(tokens, expression.start, 'freeze');
  if (freeze?.next === expression.end) {
    const args = splitCallArguments(tokens, freeze.opening, freeze.closing);
    if (args.length !== 1) return false;
    expression = stripOuterParentheses(tokens, args[0].start, args[0].end);
  }
  if (
    expression.end - expression.start === 1
    && tokens[expression.start]?.type === 'identifier'
    && safeAllowlistLoopProjection(
      tokens,
      projection.bodyOpening,
      projection.bodyClosing,
      returns[0],
      sourceParameter,
      tokens[expression.start].value
    )
  ) {
    return true;
  }
  const fromEntries = readObjectMethodCall(
    tokens,
    expression.start,
    'fromEntries'
  );
  if (!fromEntries || fromEntries.next !== expression.end) return false;
  const args = splitCallArguments(
    tokens,
    fromEntries.opening,
    fromEntries.closing
  );
  return (
    args.length === 1
    && safeRuntimeFieldMapping(
      tokens,
      args[0].start,
      args[0].end,
      sourceParameter
    )
  );
}

function isSafeRuleProjectionCall(tokens, start, end) {
  const range = stripOuterParentheses(tokens, start, end);
  if (
    tokens[range.start]?.value !== 'projectSafeRuleCandidate'
    || tokens[range.start + 1]?.value !== '('
  ) {
    return false;
  }
  const closing = findMatchingToken(tokens, range.start + 1, '(', ')');
  if (closing !== range.end - 1) return false;
  const args = splitCallArguments(tokens, range.start + 1, closing);
  if (args.length !== 1) return false;
  const argument = stripOuterParentheses(tokens, args[0].start, args[0].end);
  return (
    argument.end - argument.start === 1
    && tokens[argument.start]?.type === 'identifier'
  );
}

function safeResolverProjectionLayers(source) {
  const tokens = tokenizeJavaScript(source);
  const layers = new Set();
  const expectedFunctions = new Map([
    ['stableRules', 'stable'],
    ['trendRules', 'seasonal_trend']
  ]);
  for (let index = 0; index + 3 < tokens.length; index += 1) {
    if (
      tokens[index].value !== 'function'
      || !expectedFunctions.has(tokens[index + 1]?.value)
      || tokens[index + 2]?.value !== '('
    ) continue;
    const parametersClosing = findMatchingToken(tokens, index + 2, '(', ')');
    if (parametersClosing === -1 || tokens[parametersClosing + 1]?.value !== '{') continue;
    const bodyOpening = parametersClosing + 1;
    const bodyClosing = findMatchingToken(tokens, bodyOpening, '{', '}');
    if (bodyClosing === -1) continue;
    const expectedLayer = expectedFunctions.get(tokens[index + 1].value);
    let foundSafeCall = false;
    let foundUnsafeCall = false;
    for (let cursor = bodyOpening + 1; cursor < bodyClosing; cursor += 1) {
      if (
        tokens[cursor].type !== 'identifier'
        || tokens[cursor].value !== 'resolved'
      ) continue;
      let calleeStart = cursor;
      let callOpening = cursor + 1;
      while (
        tokens[calleeStart - 1]?.value === '('
        && findMatchingToken(tokens, calleeStart - 1, '(', ')') === callOpening
      ) {
        calleeStart -= 1;
        callOpening += 1;
      }
      if (
        ['.', ']'].includes(tokens[calleeStart - 1]?.value)
        || tokens[callOpening]?.value !== '('
      ) {
        continue;
      }
      const closing = findMatchingToken(tokens, callOpening, '(', ')');
      if (closing === -1 || closing > bodyClosing) continue;
      const args = splitCallArguments(tokens, callOpening, closing);
      if (args.length < 4) continue;
      const layer = evaluateStaticString(tokens, args[2].start);
      const safeCandidate = isSafeRuleProjectionCall(
        tokens,
        args[3].start,
        args[3].end
      );
      if (layer.known && layer.value === expectedLayer) {
        if (safeCandidate) {
          foundSafeCall = true;
        } else {
          foundUnsafeCall = true;
        }
      }
    }
    if (foundSafeCall && !foundUnsafeCall) layers.add(expectedLayer);
  }
  return layers;
}

function readFileSystemManagerReference(
  tokens,
  start,
  constants,
  globalAliases,
  wxAliases,
  fileSystemAliases
) {
  const token = tokens[start];
  if (!token) return null;
  if (token.value === '(') {
    const closing = findMatchingToken(tokens, start, '(', ')');
    if (closing === -1) return null;
    const nested = readFileSystemManagerReference(
      tokens,
      start + 1,
      constants,
      globalAliases,
      wxAliases,
      fileSystemAliases
    );
    if (nested && nested.next === closing) {
      return { next: closing + 1 };
    }
  }
  if (token.type === 'identifier' && fileSystemAliases.has(token.value)) {
    return { next: start + 1 };
  }
  const platform = readPlatformReference(
    tokens,
    start,
    constants,
    globalAliases,
    wxAliases,
    true
  );
  if (!platform || platform.kind !== 'wx') return null;
  const property = readMemberProperty(tokens, platform.next, constants);
  if (
    !property?.known
    || property.value !== 'getFileSystemManager'
    || tokens[property.next]?.value !== '('
  ) {
    return null;
  }
  const closing = findMatchingToken(tokens, property.next, '(', ')');
  return closing === -1 ? null : { next: closing + 1 };
}

function readPhotoPersistenceReference(
  tokens,
  start,
  constants,
  globalAliases,
  wxAliases,
  persistenceAliases,
  fileSystemAliases,
  allowInvocationMember = false
) {
  const token = tokens[start];
  if (!token) return null;
  if (token.value === '(') {
    const closing = findMatchingToken(tokens, start, '(', ')');
    if (closing === -1) return null;
    const nested = readPhotoPersistenceReference(
      tokens,
      start + 1,
      constants,
      globalAliases,
      wxAliases,
      persistenceAliases,
      fileSystemAliases,
      allowInvocationMember
    );
    if (nested && nested.next === closing) {
      return { ...nested, next: closing + 1 };
    }
  }
  if (
    token.type === 'identifier'
    && persistenceAliases.has(token.value)
  ) {
    const member = readMemberProperty(tokens, start + 1, constants);
    if (
      !member
      || (
        allowInvocationMember
        && member.known
        && ['call', 'apply'].includes(member.value)
      )
    ) {
      return { next: start + 1 };
    }
  }
  const platform = readPlatformReference(
    tokens,
    start,
    constants,
    globalAliases,
    wxAliases,
    true
  );
  if (platform?.kind === 'wx') {
    const property = readMemberProperty(tokens, platform.next, constants);
    if (
      property?.known
      && WX_PHOTO_PERSISTENCE_METHODS.includes(property.value)
    ) {
      return { next: property.next };
    }
  }
  const manager = readFileSystemManagerReference(
    tokens,
    start,
    constants,
    globalAliases,
    wxAliases,
    fileSystemAliases
  );
  if (!manager) return null;
  const method = readMemberProperty(tokens, manager.next, constants);
  return method?.known
    && FILE_SYSTEM_PHOTO_PERSISTENCE_METHODS.includes(method.value)
    ? { next: method.next }
    : null;
}

function parseJson(file, displayName, errors, scannedFiles) {
  scannedFiles.add(file);
  let source;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch (error) {
    errors.push(`${displayName}: 无法读取 JSON（${error.message}）`);
    return null;
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    errors.push(`${displayName}: JSON 解析失败（${error.message}）`);
    return null;
  }
}

function addJsonRiskErrors(value, displayName, errors) {
  const seen = new Set();
  const add = (message) => {
    const full = `${displayName}: ${message}`;
    if (!seen.has(full)) {
      seen.add(full);
      errors.push(full);
    }
  };

  function visit(current, key = '') {
    if (typeof current === 'string') {
      if (/^(?:https?|wss?):\/\//i.test(current) || /^\/\/[a-z0-9]/i.test(current)) {
        add('禁止的远程 URL');
      }
      return;
    }
    if (!current || typeof current !== 'object') return;

    if (key === 'usingComponents') {
      for (const componentPath of Object.values(current)) {
        if (typeof componentPath !== 'string') continue;
        if (/^plugin:\/\//i.test(componentPath)) {
          add('禁止的插件组件引用');
        } else if (/^(?:https?|wss?):\/\//i.test(componentPath) || /^\/\//.test(componentPath)) {
          add('禁止的远程组件引用');
        }
      }
    }

    for (const [childKey, child] of Object.entries(current)) {
      if (childKey === 'plugins' || childKey === 'provider') {
        add('禁止的插件或服务提供方声明');
      }
      visit(child, childKey);
    }
  }

  visit(value);
}

function networkNameBindingLookup(tokens) {
  const scopeChains = [];
  const stack = [-1];
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].value === '}' && stack.length > 1) stack.pop();
    scopeChains[index] = [...stack];
    if (tokens[index].value === '{') stack.push(index);
  }

  const bindings = new Map();
  const rangeBindings = new Map();
  const addBinding = (name, scope) => {
    if (!GLOBAL_NETWORK_APIS.includes(name)) return;
    if (!bindings.has(name)) bindings.set(name, new Set());
    bindings.get(name).add(scope);
  };
  const addRangeBinding = (name, start, end) => {
    if (!GLOBAL_NETWORK_APIS.includes(name)) return;
    if (!rangeBindings.has(name)) rangeBindings.set(name, []);
    rangeBindings.get(name).push({ start, end });
  };
  const scopeAt = (index) => (
    scopeChains[index]?.[scopeChains[index].length - 1] ?? -1
  );
  const closingDelimiter = new Map([
    ['(', ')'],
    ['[', ']'],
    ['{', '}']
  ]);
  const closingTokens = new Set(closingDelimiter.values());
  const findTopLevelToken = (
    start,
    end,
    matches,
    stopAtClosing = false
  ) => {
    const closings = [];
    for (let index = start; index < end; index += 1) {
      const value = tokens[index].value;
      if (closingDelimiter.has(value)) {
        closings.push(closingDelimiter.get(value));
        continue;
      }
      if (closingTokens.has(value)) {
        if (closings.length === 0) return stopAtClosing ? index : -1;
        if (closings[closings.length - 1] === value) closings.pop();
        continue;
      }
      if (closings.length === 0 && matches(value, index)) return index;
    }
    return -1;
  };
  const findTopLevelPatternToken = (start, end, expected) => (
    findTopLevelToken(
      start,
      end,
      (value, index) => (
        value === expected
        && !(expected === '=' && tokens[index + 1]?.value === '>')
      )
    )
  );
  const collectPatternBindings = (start, end, names) => {
    while (
      start + 2 < end
      && tokens[start]?.value === '.'
      && tokens[start + 1]?.value === '.'
      && tokens[start + 2]?.value === '.'
    ) {
      start += 3;
    }
    const defaultIndex = findTopLevelPatternToken(start, end, '=');
    if (defaultIndex !== -1) end = defaultIndex;
    if (start >= end) return;

    const opening = tokens[start]?.value;
    const closing = opening === '{' ? '}' : opening === '[' ? ']' : null;
    if (
      closing
      && findMatchingToken(tokens, start, opening, closing) === end - 1
    ) {
      for (const range of splitCallArguments(tokens, start, end - 1)) {
        if (opening === '[') {
          collectPatternBindings(range.start, range.end, names);
          continue;
        }
        const entryDefault = findTopLevelPatternToken(
          range.start,
          range.end,
          '='
        );
        const propertyEnd = entryDefault === -1 ? range.end : entryDefault;
        const colon = findTopLevelPatternToken(
          range.start,
          propertyEnd,
          ':'
        );
        if (colon !== -1) {
          collectPatternBindings(colon + 1, range.end, names);
        } else {
          collectPatternBindings(range.start, range.end, names);
        }
      }
      return;
    }

    if (tokens[start]?.type === 'identifier') names.add(tokens[start].value);
  };
  const parameterBindingNames = (opening, closing) => {
    const names = new Set();
    for (const range of splitCallArguments(tokens, opening, closing)) {
      collectPatternBindings(range.start, range.end, names);
    }
    return names;
  };
  const arrowExpressionEnd = (start) => {
    const ending = findTopLevelToken(
      start,
      tokens.length,
      (value) => value === ',' || value === ';',
      true
    );
    return ending === -1 ? tokens.length : ending;
  };
  const addBodyBindings = (names, bodyStart) => {
    if (tokens[bodyStart]?.value === '{') {
      for (const name of names) addBinding(name, bodyStart);
      return;
    }
    const bodyEnd = arrowExpressionEnd(bodyStart);
    for (const name of names) addRangeBinding(name, bodyStart, bodyEnd);
  };
  const simpleStatementEnd = (start) => {
    if (tokens[start]?.value === ';') return start + 1;
    const ending = findTopLevelToken(
      start,
      tokens.length,
      (value) => value === ';',
      true
    );
    if (ending === -1) return tokens.length;
    return tokens[ending].value === ';' ? ending + 1 : ending;
  };
  const afterParenthesized = (opening) => {
    if (tokens[opening]?.value !== '(') return -1;
    const closing = findMatchingToken(tokens, opening, '(', ')');
    return closing === -1 ? -1 : closing + 1;
  };
  function statementEnd(start) {
    const value = tokens[start]?.value;
    if (!value) return tokens.length;
    if (value === '{') {
      const closing = findMatchingToken(tokens, start, '{', '}');
      return closing === -1 ? tokens.length : closing + 1;
    }
    if (value === ';') return start + 1;
    if (value === 'for') {
      const opening = tokens[start + 1]?.value === 'await'
        ? start + 2
        : start + 1;
      const bodyStart = afterParenthesized(opening);
      return bodyStart === -1
        ? simpleStatementEnd(start)
        : statementEnd(bodyStart);
    }
    if (value === 'if') {
      const consequentStart = afterParenthesized(start + 1);
      if (consequentStart === -1) return simpleStatementEnd(start);
      let end = statementEnd(consequentStart);
      if (tokens[end]?.value === 'else') end = statementEnd(end + 1);
      return end;
    }
    if (value === 'while' || value === 'with') {
      const bodyStart = afterParenthesized(start + 1);
      return bodyStart === -1
        ? simpleStatementEnd(start)
        : statementEnd(bodyStart);
    }
    if (value === 'do') {
      let end = statementEnd(start + 1);
      if (tokens[end]?.value !== 'while') return end;
      const afterCondition = afterParenthesized(end + 1);
      if (afterCondition === -1) return simpleStatementEnd(end);
      end = afterCondition;
      return tokens[end]?.value === ';' ? end + 1 : end;
    }
    if (value === 'switch') {
      const blockStart = afterParenthesized(start + 1);
      return blockStart === -1
        ? simpleStatementEnd(start)
        : statementEnd(blockStart);
    }
    if (value === 'try') {
      let end = statementEnd(start + 1);
      if (tokens[end]?.value === 'catch') {
        let catchBody = end + 1;
        if (tokens[catchBody]?.value === '(') {
          catchBody = afterParenthesized(catchBody);
        }
        end = catchBody === -1
          ? simpleStatementEnd(end)
          : statementEnd(catchBody);
      }
      if (tokens[end]?.value === 'finally') end = statementEnd(end + 1);
      return end;
    }
    if (
      value === 'function'
      && tokens[start + 1]?.type === 'identifier'
    ) {
      const bodyStart = afterParenthesized(start + 2);
      if (tokens[bodyStart]?.value === '{') return statementEnd(bodyStart);
    }
    if (
      tokens[start]?.type === 'identifier'
      && tokens[start + 1]?.value === ':'
    ) {
      return statementEnd(start + 2);
    }
    return simpleStatementEnd(start);
  }
  const lexicalForDeclarations = new Set();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.value === 'for') {
      const opening = tokens[index + 1]?.value === 'await'
        ? index + 2
        : index + 1;
      const closing = findMatchingToken(tokens, opening, '(', ')');
      const declaration = opening + 1;
      if (
        closing !== -1
        && ['const', 'let'].includes(tokens[declaration]?.value)
      ) {
        let declarationEnd = findTopLevelToken(
          declaration + 1,
          closing,
          (value) => value === ';'
        );
        if (declarationEnd === -1) {
          declarationEnd = findTopLevelToken(
            declaration + 1,
            closing,
            (value) => value === 'in' || value === 'of'
          );
        }
        if (declarationEnd !== -1) {
          const names = new Set();
          for (
            const range of splitCallArguments(
              tokens,
              declaration,
              declarationEnd
            )
          ) {
            collectPatternBindings(range.start, range.end, names);
          }
          const loopEnd = statementEnd(closing + 1);
          for (const name of names) {
            addRangeBinding(name, declaration, loopEnd);
          }
          lexicalForDeclarations.add(declaration);
        }
      }
    }
    if (
      token.type === 'identifier'
      && ['const', 'let', 'var', 'class', 'function'].includes(
        tokens[index - 1]?.value
      )
      && !lexicalForDeclarations.has(index - 1)
    ) {
      addBinding(token.value, scopeAt(index));
    }
    if (
      ['const', 'let', 'var'].includes(token.value)
      && tokens[index + 1]?.value === '{'
      && !lexicalForDeclarations.has(index)
    ) {
      const closing = findMatchingToken(tokens, index + 1, '{', '}');
      if (closing === -1) continue;
      const names = new Set();
      collectPatternBindings(index + 1, closing + 1, names);
      for (const name of names) {
        addBinding(name, scopeAt(index));
      }
    }
    if (token.value === '(') {
      const closing = findMatchingToken(tokens, index, '(', ')');
      const bodyStart = closing === -1 ? -1 : closing + 3;
      if (
        closing !== -1
        && tokens[closing + 1]?.value === '='
        && tokens[closing + 2]?.value === '>'
      ) {
        const names = parameterBindingNames(index, closing);
        addBodyBindings(names, bodyStart);
      }
    }
    if (
      token.type === 'identifier'
      && tokens[index + 1]?.value === '='
      && tokens[index + 2]?.value === '>'
    ) {
      const bodyStart = index + 3;
      addBodyBindings([token.value], bodyStart);
    }
    if (token.value !== 'function') continue;
    const opening = tokens[index + 1]?.value === '(' ? index + 1 : index + 2;
    if (tokens[opening]?.value !== '(') continue;
    const closing = findMatchingToken(tokens, opening, '(', ')');
    const bodyOpening = closing === -1 ? -1 : closing + 1;
    if (tokens[bodyOpening]?.value !== '{') continue;
    for (const name of parameterBindingNames(opening, closing)) {
      addBinding(name, bodyOpening);
    }
  }

  return (name, index) => {
    const scopes = bindings.get(name);
    if (scopes && scopeChains[index]?.some((scope) => scopes.has(scope))) {
      return true;
    }
    return rangeBindings.get(name)?.some(
      (range) => index >= range.start && index < range.end
    ) ?? false;
  };
}

function wxNetworkReference(method) {
  if (!method?.known) {
    return method ? 'wx.[dynamic]' : null;
  }
  if (WX_NETWORK_METHODS.includes(method.value)) {
    return `wx.${method.value}`;
  }
  if (method.value === 'cloud') return 'wx.cloud';
  if (
    method.computed
    && !SAFE_WX_COMPUTED_UI_METHODS.has(method.value)
  ) {
    return 'wx.[dynamic]';
  }
  return null;
}

function readNetworkReference(
  tokens,
  start,
  constants,
  globalAliases,
  wxAliases,
  networkAliases,
  isLocallyBound
) {
  const token = tokens[start];
  if (!token) return null;
  if (token.value === '(') {
    const closing = findMatchingToken(tokens, start, '(', ')');
    if (closing === -1) return null;
    if (
      tokens[closing + 1]?.value === '='
      && tokens[closing + 2]?.value === '>'
    ) {
      return null;
    }
    const nested = readNetworkReference(
      tokens,
      start + 1,
      constants,
      globalAliases,
      wxAliases,
      networkAliases,
      isLocallyBound
    );
    return nested && nested.next === closing
      ? { ...nested, next: closing + 1 }
      : null;
  }
  if (token.type !== 'identifier') return null;
  if (networkAliases.has(token.value)) {
    return { api: networkAliases.get(token.value), next: start + 1 };
  }
  if (
    GLOBAL_NETWORK_APIS.includes(token.value)
    && tokens[start - 1]?.value !== '.'
    && !isLocallyBound(token.value, start)
  ) {
    return { api: token.value, next: start + 1 };
  }
  if (globalAliases.has(token.value)) {
    const property = readMemberProperty(tokens, start + 1, constants);
    if (!property) return null;
    if (!property.known) {
      return { api: 'globalThis.[dynamic]', next: property.next };
    }
    if (GLOBAL_NETWORK_APIS.includes(property.value)) {
      return { api: property.value, next: property.next };
    }
    if (property.value !== 'wx') return null;
    const method = readMemberProperty(tokens, property.next, constants);
    const api = wxNetworkReference(method);
    return api ? { api, next: method.next } : null;
  }
  if (!wxAliases.has(token.value)) return null;
  const method = readMemberProperty(tokens, start + 1, constants);
  const api = wxNetworkReference(method);
  return api ? { api, next: method.next } : null;
}

function networkReferenceIsInvoked(tokens, start, reference, constants) {
  if (tokens[start - 1]?.value === 'new') return true;
  if (tokens[reference.next]?.value === '(') {
    const closing = findMatchingToken(tokens, reference.next, '(', ')');
    return closing === -1 || tokens[closing + 1]?.value !== '{';
  }
  const invocation = readMemberProperty(tokens, reference.next, constants);
  return (
    invocation?.known
    && (
      ['call', 'apply'].includes(invocation.value)
      || reference.api === 'wx.cloud'
    )
    && tokens[invocation.next]?.value === '('
  );
}

function detectProhibitedNetworkApis(source) {
  const detected = new Set();
  const tokens = tokenizeJavaScript(source);
  const stringConstants = collectStaticConstants(tokens);
  const { globalAliases, wxAliases } = collectPlatformAliases(
    tokens,
    stringConstants
  );
  const isLocallyBound = networkNameBindingLookup(tokens);
  const networkAliases = new Map();

  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index + 2 < tokens.length; index += 1) {
      const name = tokens[index];
      if (
        name.type !== 'identifier'
        || tokens[index + 1]?.value !== '='
        || tokens[index + 2]?.value === '='
        || tokens[index - 1]?.value === '.'
      ) continue;
      const reference = readNetworkReference(
        tokens,
        index + 2,
        stringConstants,
        globalAliases,
        wxAliases,
        networkAliases,
        isLocallyBound
      );
      if (reference && !networkAliases.has(name.value)) {
        networkAliases.set(name.value, reference.api);
        changed = true;
      }
    }

    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index].value !== '{') continue;
      const closing = findMatchingToken(tokens, index, '{', '}');
      if (closing === -1 || tokens[closing + 1]?.value !== '=') continue;
      const sourceStart = closing + 2;
      const platform = readPlatformReference(
        tokens,
        sourceStart,
        stringConstants,
        globalAliases,
        wxAliases
      );
      if (!platform) continue;
      let cursor = index + 1;
      while (cursor < closing) {
        if (!['identifier', 'string'].includes(tokens[cursor]?.type)) {
          cursor += 1;
          continue;
        }
        const property = tokens[cursor].value;
        let alias = property;
        cursor += 1;
        if (tokens[cursor]?.value === ':' && tokens[cursor + 1]?.type === 'identifier') {
          alias = tokens[cursor + 1].value;
          cursor += 2;
        }
        const api = platform.kind === 'wx'
          ? wxNetworkReference({ known: true, value: property, computed: false })
          : GLOBAL_NETWORK_APIS.includes(property)
            ? property
            : null;
        if (api && !networkAliases.has(alias)) {
          networkAliases.set(alias, api);
          changed = true;
        }
        while (cursor < closing && tokens[cursor]?.value !== ',') cursor += 1;
        if (tokens[cursor]?.value === ',') cursor += 1;
      }
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const reference = readNetworkReference(
      tokens,
      index,
      stringConstants,
      globalAliases,
      wxAliases,
      networkAliases,
      isLocallyBound
    );
    if (
      reference
      && networkReferenceIsInvoked(
        tokens,
        index,
        reference,
        stringConstants
      )
    ) {
      detected.add(reference.api);
    }
  }
  return detected;
}

function findClosingParenthesis(source, openingIndex) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openingIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return source.length - 1;
}

function extractCalls(source, callPattern) {
  const calls = [];
  const pattern = new RegExp(callPattern.source, callPattern.flags.includes('g')
    ? callPattern.flags
    : `${callPattern.flags}g`);
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const openingIndex = source.indexOf('(', match.index);
    if (openingIndex === -1) continue;
    const closingIndex = findClosingParenthesis(source, openingIndex);
    calls.push(source.slice(openingIndex + 1, closingIndex));
    pattern.lastIndex = Math.max(pattern.lastIndex, closingIndex + 1);
  }
  return calls;
}

function taintedPhotoIdentifiers(source) {
  const tainted = new Set([
    'photoPath',
    'tempFilePath',
    'previewPath',
    'imagePath',
    'localPhotoPath'
  ]);
  const assignments = [];
  const assignmentPattern = /(?:\b(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g;
  let match;
  while ((match = assignmentPattern.exec(source)) !== null) {
    assignments.push({ name: match[1], expression: match[2] });
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const assignment of assignments) {
      const containsTainted = [...tainted].some((name) => (
        new RegExp(`\\b${name.replaceAll('$', '\\$')}\\b`).test(assignment.expression)
      ));
      if (
        PHOTO_PATH_REFERENCE.test(assignment.expression)
        || containsTainted
      ) {
        if (!tainted.has(assignment.name)) {
          tainted.add(assignment.name);
          changed = true;
        }
      }
    }
  }

  const destructuringPattern = /\b(?:const|let|var)\s*{([^}]+)}\s*=\s*([^;\n]+)/g;
  while ((match = destructuringPattern.exec(source)) !== null) {
    if (!/photoPath|tempFilePath|previewPath|imagePath/.test(match[1])) continue;
    for (const member of match[1].split(',')) {
      const [property, alias] = member.split(':').map((value) => value.trim());
      if (/photoPath|tempFilePath|previewPath|imagePath/.test(property)) {
        tainted.add(alias || property);
      }
    }
  }
  return tainted;
}

function containsPhotoPathPersistence(source) {
  const tainted = taintedPhotoIdentifiers(source);
  const tokens = tokenizeJavaScript(source);
  const stringConstants = collectStaticConstants(tokens);
  const { globalAliases, wxAliases } = collectPlatformAliases(
    tokens,
    stringConstants
  );
  const persistenceAliases = new Set();
  const fileSystemAliases = new Set();

  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index + 2 < tokens.length; index += 1) {
      const name = tokens[index];
      if (
        name.type !== 'identifier'
        || tokens[index + 1]?.value !== '='
        || tokens[index + 2]?.value === '='
        || tokens[index - 1]?.value === '.'
      ) continue;
      const manager = readFileSystemManagerReference(
        tokens,
        index + 2,
        stringConstants,
        globalAliases,
        wxAliases,
        fileSystemAliases
      );
      if (manager && !fileSystemAliases.has(name.value)) {
        fileSystemAliases.add(name.value);
        changed = true;
      }
      const reference = readPhotoPersistenceReference(
        tokens,
        index + 2,
        stringConstants,
        globalAliases,
        wxAliases,
        persistenceAliases,
        fileSystemAliases
      );
      if (reference && !persistenceAliases.has(name.value)) {
        persistenceAliases.add(name.value);
        changed = true;
      }
    }

    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index].value !== '{') continue;
      const closing = findMatchingToken(tokens, index, '{', '}');
      if (
        closing === -1
        || tokens[closing + 1]?.value !== '='
      ) continue;
      const sourceStart = closing + 2;
      const platform = readPlatformReference(
        tokens,
        sourceStart,
        stringConstants,
        globalAliases,
        wxAliases
      );
      const manager = readFileSystemManagerReference(
        tokens,
        sourceStart,
        stringConstants,
        globalAliases,
        wxAliases,
        fileSystemAliases
      );
      const allowedMethods = platform?.kind === 'wx'
        ? WX_PHOTO_PERSISTENCE_METHODS
        : manager
          ? FILE_SYSTEM_PHOTO_PERSISTENCE_METHODS
          : null;
      if (!allowedMethods) continue;
      let cursor = index + 1;
      while (cursor < closing) {
        let propertyName = '';
        if (tokens[cursor]?.value === '[') {
          const propertyClosing = findMatchingToken(tokens, cursor, '[', ']');
          if (propertyClosing === -1 || propertyClosing >= closing) break;
          const computed = evaluateStaticString(
            tokens,
            cursor + 1,
            stringConstants
          );
          if (computed.known && computed.next === propertyClosing) {
            propertyName = computed.value;
          }
          cursor = propertyClosing + 1;
        } else if (['identifier', 'string'].includes(tokens[cursor]?.type)) {
          propertyName = tokens[cursor].value;
          cursor += 1;
        } else {
          cursor += 1;
          continue;
        }
        let alias = propertyName;
        if (tokens[cursor]?.value === ':' && tokens[cursor + 1]?.type === 'identifier') {
          alias = tokens[cursor + 1].value;
          cursor += 2;
        }
        if (
          allowedMethods.includes(propertyName)
          && !persistenceAliases.has(alias)
        ) {
          persistenceAliases.add(alias);
          changed = true;
        }
        if (tokens[cursor]?.value === ',') cursor += 1;
      }
    }
  }

  const storageCalls = [
    ...extractCalls(source, /\b(?:wx\s*\.\s*)?setStorage(?:Sync)?\s*\(/g),
    ...extractCalls(source, /\b(?:this\s*\.\s*)?storage\s*\.\s*set\s*\(/g)
  ];
  const seenCallOpenings = new Set();
  const addCallAt = (openingIndex) => {
    if (seenCallOpenings.has(openingIndex)) return;
    const closing = findMatchingToken(tokens, openingIndex, '(', ')');
    if (closing === -1) return;
    seenCallOpenings.add(openingIndex);
    storageCalls.push(source.slice(tokens[openingIndex].end, tokens[closing].start));
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const reference = readPhotoPersistenceReference(
      tokens,
      index,
      stringConstants,
      globalAliases,
      wxAliases,
      persistenceAliases,
      fileSystemAliases,
      true
    );
    if (!reference) continue;
    if (tokens[reference.next]?.value === '(') {
      addCallAt(reference.next);
      continue;
    }
    const invocation = readMemberProperty(
      tokens,
      reference.next,
      stringConstants
    );
    if (
      invocation?.known
      && ['call', 'apply'].includes(invocation.value)
      && tokens[invocation.next]?.value === '('
    ) {
      addCallAt(invocation.next);
    }
  }

  return storageCalls.some((body) => (
    PHOTO_PATH_REFERENCE.test(body)
    || [...tainted].some((name) => (
      new RegExp(`\\b${name.replaceAll('$', '\\$')}\\b`).test(body)
    ))
  ));
}

function urlsInText(value) {
  const pattern = /\b(?:https?|wss?):\/\/[^\s"'<>`]+|\/\/[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:[/:][^\s"'<>`]*)?/gi;
  return [...value.matchAll(pattern)].map((match) => match[0]);
}

function addEvidenceDefinitionErrors(source, relative, extension, errors) {
  if (extension !== '.js' || !EVIDENCE_FILES.has(relative)) return;
  const tokens = tokenizeJavaScript(source);
  const constants = collectStaticConstants(tokens);
  const messages = new Set();
  const add = (message) => {
    if (messages.has(message)) return;
    messages.add(message);
    errors.push(`${relative}: ${message}`);
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (
      (token.type === 'identifier' || token.type === 'string')
      && token.value === 'evidenceUrl'
      && tokens[index + 1]?.value === ':'
      && ['{', ','].includes(tokens[index - 1]?.value)
    ) {
      const value = tokens[index + 2];
      const boundary = tokens[index + 3];
      if (
        value?.type !== 'string'
        || ![',', '}'].includes(boundary?.value)
      ) {
        add('evidenceUrl 必须是直接字符串字面量');
      }
      continue;
    }
    if (token.value !== '[') continue;
    const closing = findMatchingToken(tokens, index, '[', ']');
    if (closing === -1 || tokens[closing + 1]?.value !== ':') continue;
    const key = evaluateStaticString(tokens, index + 1, constants);
    if (key.known && key.next === closing && key.value === 'evidenceUrl') {
      add('evidenceUrl 必须使用直接属性键');
    } else if (!key.known || key.next !== closing) {
      add('证据文件禁止未解析的计算属性键');
    }
  }
}

function addEvidenceImportErrors(source, relative, extension, errors) {
  if (extension !== '.js' || relative === 'services/rule-resolver.js') return;
  const tokens = tokenizeJavaScript(source);
  const constants = collectStaticConstants(tokens);
  for (let index = 0; index < tokens.length; index += 1) {
    const evaluated = evaluateStaticString(tokens, index, constants);
    if (!evaluated.known) continue;
    const normalized = evaluated.value.replaceAll('\\', '/');
    if (/(?:^|\/)data\/(?:style-rules-v2|trend-rules)(?:\.js)?$/.test(normalized)) {
      errors.push(`${relative}: 禁止导入证据元数据`);
      return;
    }
  }
}

function isDirectEvidenceValue(tokens, index, relative) {
  if (!EVIDENCE_FILES.has(relative)) return false;
  const value = tokens[index];
  const colon = tokens[index - 1];
  const key = tokens[index - 2];
  const boundary = tokens[index - 3];
  if (value?.type !== 'string' || colon?.value !== ':') return false;
  return (
    (key?.type === 'identifier' || key?.type === 'string')
    && key.value === 'evidenceUrl'
    && ['{', ','].includes(boundary?.value)
  );
}

function isValidEvidenceUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    return false;
  }
  const authority = value.slice('https://'.length).split('/')[0];
  return (
    parsed.protocol === 'https:'
    && parsed.username === ''
    && parsed.password === ''
    && parsed.port === ''
    && !authority.includes(':')
    && parsed.search === ''
    && parsed.hash === ''
    && EVIDENCE_HOSTS.has(parsed.hostname.toLowerCase())
  );
}

function addRemoteUrlErrors(source, relative, extension, errors) {
  if (extension !== '.js') {
    for (const url of urlsInText(source)) {
      if (extension === '.svg' && url === 'http://www.w3.org/2000/svg') continue;
      errors.push(`${relative}: 禁止的远程 URL`);
    }
    return;
  }

  const tokens = tokenizeJavaScript(source);
  const constants = collectStaticConstants(tokens);
  const stringRanges = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'string' && token.type !== 'template') continue;
    stringRanges.push([token.start, token.end]);
    const urls = urlsInText(token.value);
    if (urls.length === 0) continue;
    const allowedContext = isDirectEvidenceValue(tokens, index, relative);
    for (const url of urls) {
      if (allowedContext && isValidEvidenceUrl(url)) continue;
      if (allowedContext) {
        errors.push(`${relative}: evidenceUrl 元数据不符合安全约束`);
      } else {
        errors.push(`${relative}: 禁止的远程 URL`);
      }
    }
  }

  const outsideStrings = [...source];
  for (const [start, end] of stringRanges) {
    for (let index = start; index < end; index += 1) outsideStrings[index] = ' ';
  }
  if (urlsInText(outsideStrings.join('')).length > 0) {
    errors.push(`${relative}: 禁止的远程 URL`);
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const evaluated = evaluateStaticString(tokens, index, constants);
    if (
      evaluated.known
      && evaluated.next > index + 1
      && urlsInText(evaluated.value).length > 0
    ) {
      errors.push(`${relative}: 禁止的远程 URL`);
      break;
    }
  }
}

function isControlledRuntimeMediaBinding(value) {
  if (!value.includes('{{')) return true;
  if (/^(?:\/|(?:\.\.?\/)+)assets\//.test(value.trim())) return true;
  const binding = value.match(/^\s*{{\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*}}\s*$/);
  if (!binding) return false;
  const field = binding[1].split('.').at(-1);
  return CONTROLLED_RUNTIME_MEDIA_FIELDS.has(field);
}

function addRuntimeMediaBindingErrors(source, relative, errors) {
  const markup = source.replace(/<!--[\s\S]*?-->/g, '');
  const tagPattern = /<(?:image|cover-image|video|audio)\b[\s\S]*?>/gi;
  let tag;
  while ((tag = tagPattern.exec(markup)) !== null) {
    const attributePattern = /\b(?:src|poster)\s*=\s*(["'])([\s\S]*?)\1/gi;
    let attribute;
    while ((attribute = attributePattern.exec(tag[0])) !== null) {
      if (!isControlledRuntimeMediaBinding(attribute[2])) {
        errors.push(`${relative}: 运行时媒体绑定必须使用受控本地资产字段`);
        return;
      }
    }
  }
}

function addRuntimeEvidenceErrors(source, relative, extension, errors) {
  if (extension === '.wxml') {
    addRuntimeMediaBindingErrors(source, relative, errors);
    if (/<web-view\b/i.test(source)) {
      errors.push(`${relative}: 禁止 WebView`);
    }
    if (
      /evidenceUrl/.test(source)
      && /<(?:image|navigator|web-view)\b[\s\S]*?evidenceUrl/i.test(source)
    ) {
      errors.push(`${relative}: 禁止将 evidenceUrl 用于运行时资源`);
    }
    return;
  }
  if (extension !== '.js') return;
  const tokens = tokenizeJavaScript(source);
  const constants = collectStaticConstants(tokens);
  const hasEvidenceReference = tokens.some((token) => (
    token.value === 'evidenceUrl'
  )) || [...constants.values()].includes('evidenceUrl')
    || tokens.some((token, index) => {
      if (!['string', 'identifier'].includes(token.type) && token.value !== '[') return false;
      const evaluated = evaluateStaticString(tokens, index, constants);
      return evaluated.known && evaluated.value === 'evidenceUrl';
    });
  if (!hasEvidenceReference) return;
  if (!EVIDENCE_FILES.has(relative)) {
    errors.push(`${relative}: 禁止将 evidenceUrl 用于运行时资源`);
    return;
  }
  if (
    /\b(?:wx\s*(?:\.|\[)|fetch\b|XMLHttpRequest\b|WebSocket\b)[\s\S]{0,500}\bevidenceUrl\b/.test(source)
    || /\bevidenceUrl\b[\s\S]{0,500}\b(?:wx\s*(?:\.|\[)|fetch\b|XMLHttpRequest\b|WebSocket\b)/.test(source)
  ) {
    errors.push(`${relative}: 禁止将 evidenceUrl 用于运行时资源`);
  }
}

function addLocalAssetErrors(source, file, miniRoot, relative, errors) {
  const assetRoot = path.join(miniRoot, 'assets');
  const references = new Set();
  const quotedPath = /(['"])([^'"]*assets\/[^'"]+)\1/g;
  let match;
  while ((match = quotedPath.exec(source)) !== null) {
    const reference = match[2];
    if (
      reference.includes('{{')
      || /^(?:https?|wss?):\/\//i.test(reference)
      || reference === 'http://www.w3.org/2000/svg'
      || !/\.[A-Za-z0-9]{2,5}(?:[?#].*)?$/.test(reference)
    ) continue;
    references.add(reference);
  }

  for (const reference of references) {
    const candidate = reference.startsWith('/assets/')
      ? path.resolve(miniRoot, `.${reference}`)
      : path.resolve(path.dirname(file), reference);
    if (!isInside(assetRoot, candidate)) {
      errors.push(`${relative}: 禁止越界的本地资产路径`);
      continue;
    }
    let stat;
    try {
      stat = fs.statSync(candidate);
    } catch (error) {
      const display = toPosix(path.relative(miniRoot, candidate));
      errors.push(`${display}: 引用的本地资产不存在`);
      continue;
    }
    if (!stat.isFile()) {
      const display = toPosix(path.relative(miniRoot, candidate));
      errors.push(`${display}: 引用的本地资产不存在`);
    }
  }
}

function scanSource(file, miniRoot, errors, scannedFiles) {
  scannedFiles.add(file);
  const relative = toPosix(path.relative(miniRoot, file));
  let source;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch (error) {
    errors.push(`${relative}: 无法读取源文件（${error.message}）`);
    return;
  }

  const extension = path.extname(file);
  if (extension === '.js') {
    for (const api of detectProhibitedNetworkApis(source)) {
      if (api === 'wx.[dynamic]') {
        errors.push(`${relative}: 禁止的动态 wx API 访问`);
      } else if (api === 'globalThis.[dynamic]') {
        errors.push(`${relative}: 禁止的动态全局 API 访问`);
      } else {
        errors.push(`${relative}: 禁止的网络调用 ${api}`);
      }
    }
  }
  addEvidenceDefinitionErrors(source, relative, extension, errors);
  addEvidenceImportErrors(source, relative, extension, errors);
  addRemoteUrlErrors(source, relative, extension, errors);
  addRuntimeEvidenceErrors(source, relative, extension, errors);
  addLocalAssetErrors(source, file, miniRoot, relative, errors);

  let wordingCorpus = source;
  for (const approved of APPROVED_TERM_CONTEXTS) {
    wordingCorpus = wordingCorpus.replaceAll(approved, '');
  }
  for (const term of PROHIBITED_TERMS) {
    if (wordingCorpus.includes(term)) {
      errors.push(`${relative}: 禁止用语“${term}”`);
    }
  }

  for (const pattern of PROHIBITED_SIMULATED_ANALYSIS) {
    if (pattern.test(source)) {
      errors.push(`${relative}: 禁止伪造观察或自动外貌分析`);
    }
  }

  for (const pattern of MODEL_KEY_PATTERNS) {
    if (pattern.test(source)) {
      errors.push(`${relative}: 禁止的模型密钥或客户端凭据`);
    }
  }

  if (path.extname(file) === '.js' && containsPhotoPathPersistence(source)) {
    errors.push(`${relative}: 禁止持久化照片路径`);
  }
}

function readRequiredSource(miniRoot, relative, errors) {
  const file = path.join(miniRoot, ...relative.split('/'));
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    errors.push(`${relative}: 静态验收文件无法读取（${error.message}）`);
    return '';
  }
}

function hasSubstantivePageSource(source, extension) {
  if (extension === 'js') {
    return tokenizeJavaScript(source).some((token) => (
      ['identifier', 'string', 'template'].includes(token.type)
    ));
  }
  if (extension === 'wxml') {
    return source.replace(/<!--[\s\S]*?-->/g, '').trim().length > 0;
  }
  return true;
}

function verifyStaticContent(miniRoot, errors) {
  const retainedRules = REQUIRED_CONTENT.filter((rule) => (
    rule.file !== 'pages/feature-review/index.wxml'
    && rule.file !== 'pages/quality-check/index.wxml'
  ));
  for (const rule of retainedRules) {
    const source = (rule.files || [rule.file])
      .map((file) => readRequiredSource(miniRoot, file, errors))
      .join('\n');
    for (const value of rule.values) {
      if (!source.includes(value)) {
        errors.push(`${rule.file}: 缺少${rule.label}“${value}”`);
      }
    }
  }

  const resultMarkup = readRequiredSource(miniRoot, 'pages/result/index.wxml', errors);
  const sectionPositions = REPORT_SECTIONS.map((section) => {
    const occurrences = resultMarkup.split(section).length - 1;
    return {
      section,
      occurrences,
      position: resultMarkup.indexOf(section)
    };
  });
  const sectionsInOrder = sectionPositions.every(({ occurrences }) => occurrences === 1)
    && sectionPositions.every(({ position }, index) => (
      index === 0 || position > sectionPositions[index - 1].position
    ));
  if (!sectionsInOrder) {
    errors.push('pages/result/index.wxml: 报告必须按批准的 12 段顺序且各出现一次');
  }

  const visualTags = [
    '<overall-look',
    '<outfit-collage',
    '<garment-technical'
  ];
  const visualPositions = visualTags.map((tag) => resultMarkup.indexOf(tag));
  if (
    visualPositions.some((position) => position < 0)
    || visualPositions.some((position, index) => (
      index > 0 && position <= visualPositions[index - 1]
    ))
  ) {
    errors.push(
      'pages/result/index.wxml: 三层视觉组件必须按整体示意、单品拼贴、技术结构顺序呈现'
    );
  }
  if (!resultMarkup.includes('<color-plan')) {
    errors.push('pages/result/index.wxml: 缺少本地视觉组件 color-plan');
  }

  const resultConfigSource = readRequiredSource(
    miniRoot,
    'pages/result/index.json',
    errors
  );
  let resultConfig = null;
  try {
    resultConfig = JSON.parse(resultConfigSource);
  } catch (error) {
    // The shared JSON pass reports the parse failure with the same file name.
  }
  const usingComponents = resultConfig?.usingComponents || {};
  for (const [name, expectedPath] of Object.entries(VISUAL_COMPONENTS)) {
    if (usingComponents[name] !== expectedPath) {
      errors.push(`pages/result/index.json: 缺少本地视觉组件 ${name}`);
    }
    for (const extension of PAGE_EXTENSIONS) {
      const relative = `components/${name}/index.${extension}`;
      const file = path.join(miniRoot, ...relative.split('/'));
      let stat;
      try {
        stat = fs.statSync(file);
      } catch (error) {
        errors.push(`${relative}: 缺少原生视觉组件文件`);
        continue;
      }
      if (!stat.isFile()) {
        errors.push(`${relative}: 缺少原生视觉组件文件`);
      }
    }
  }

  const resultLogic = readRequiredSource(miniRoot, 'pages/result/index.js', errors);
  for (const section of ['overall', 'collage', 'technical']) {
    const expanded = new RegExp(`\\b${section}\\s*:\\s*true\\b`);
    if (!expanded.test(resultLogic)) {
      errors.push(`pages/result/index.js: 三层视觉区域必须默认展开 ${section}`);
    }
  }

  for (const [relative, fields] of Object.entries(VISUAL_COMPONENT_FIELDS)) {
    const source = readRequiredSource(miniRoot, relative, errors);
    for (const field of fields) {
      if (!source.includes(field)) {
        errors.push(`${relative}: 缺少受控字段 ${field}`);
      }
    }
  }

  for (const contract of CONTROLLED_CONTRACTS) {
    const source = readRequiredSource(miniRoot, contract.file, errors);
    for (const field of contract.fields) {
      const pattern = new RegExp(`\\b${field}\\b`);
      if (!pattern.test(source)) {
        errors.push(`${contract.file}: 缺少受控字段 ${field}`);
      }
    }
  }

  const resolverSource = readRequiredSource(
    miniRoot,
    'services/rule-resolver.js',
    errors
  );
  const runtimeFields = resolverSource.match(
    /\bSAFE_RULE_RUNTIME_FIELDS\s*=\s*Object\.freeze\s*\(\s*\[([\s\S]*?)]\s*\)/
  );
  const projectedLayers = safeResolverProjectionLayers(resolverSource);
  const safeProjection = safeRuleProjectionImplementation(resolverSource);
  if (
    !runtimeFields
    || !safeProjection
    || !projectedLayers.has('stable')
    || !projectedLayers.has('seasonal_trend')
  ) {
    errors.push(
      'services/rule-resolver.js: 证据规则必须通过安全字段投影'
    );
  }
  if (
    runtimeFields
    && tokenizeJavaScript(runtimeFields[1]).some((token) => (
      token.type === 'string' && token.value === 'evidenceUrl'
    ))
  ) {
    errors.push(
      'services/rule-resolver.js: 安全字段投影不得包含 evidenceUrl'
    );
  }
}

function verifyProject(projectRoot) {
  const errors = [];
  const scannedFiles = new Set();
  const projectConfigPath = path.join(projectRoot, 'project.config.json');
  const projectConfig = parseJson(
    projectConfigPath,
    'project.config.json',
    errors,
    scannedFiles
  );

  if (!projectConfig || typeof projectConfig.miniprogramRoot !== 'string') {
    if (projectConfig) {
      errors.push('project.config.json: 缺少有效的 miniprogramRoot');
    }
    return { errors, pageCount: 0, scannedFileCount: scannedFiles.size };
  }

  const miniRoot = path.resolve(projectRoot, projectConfig.miniprogramRoot);
  if (!isInside(projectRoot, miniRoot)) {
    errors.push('project.config.json: miniprogramRoot 超出项目目录');
    return { errors, pageCount: 0, scannedFileCount: scannedFiles.size };
  }

  const appJsonPath = path.join(miniRoot, 'app.json');
  const appConfig = parseJson(
    appJsonPath,
    'app.json',
    errors,
    scannedFiles
  );
  if (appConfig) addJsonRiskErrors(appConfig, 'app.json', errors);
  const pages = appConfig && Array.isArray(appConfig.pages) ? appConfig.pages : [];
  if (appConfig && !Array.isArray(appConfig.pages)) {
    errors.push('app.json: pages 必须是数组');
  }
  if (
    pages.length !== EXPECTED_PAGE_ROUTES.length
    || pages.some((route, index) => route !== EXPECTED_PAGE_ROUTES[index])
  ) {
    errors.push('app.json: 必须且只能注册 10 个已批准页面');
  }

  for (const route of pages) {
    if (typeof route !== 'string' || route.includes('..') || path.isAbsolute(route)) {
      errors.push(`app.json: 无效页面路径“${String(route)}”`);
      continue;
    }
    for (const extension of PAGE_EXTENSIONS) {
      const relative = `${route}.${extension}`;
      const file = path.join(miniRoot, ...relative.split('/'));
      let stat;
      try {
        stat = fs.statSync(file);
      } catch (error) {
        errors.push(`${relative}: 缺少已注册页面文件`);
        continue;
      }
      if (!stat.isFile()) {
        errors.push(`${relative}: 不是可读的已注册页面文件`);
        continue;
      }
      try {
        const source = fs.readFileSync(file, 'utf8');
        if (
          ['js', 'wxml'].includes(extension)
          && !hasSubstantivePageSource(source, extension)
        ) {
          errors.push(`${relative}: 已批准页面必须包含实质内容`);
        }
      } catch (error) {
        errors.push(`${relative}: 不是可读的已注册页面文件（${error.message}）`);
      }
    }
  }

  const registeredRoutes = new Set(pages.filter((route) => typeof route === 'string'));
  const pageDirectory = path.join(miniRoot, 'pages');
  for (const file of walkFiles(pageDirectory).filter((candidate) => (
    path.basename(candidate) === 'index.js'
  ))) {
    const route = toPosix(path.relative(miniRoot, file)).replace(/\.js$/, '');
    const quartetExists = PAGE_EXTENSIONS.every((extension) => {
      const candidate = path.join(miniRoot, `${route}.${extension}`);
      try {
        return fs.statSync(candidate).isFile();
      } catch (error) {
        return false;
      }
    });
    if (quartetExists && !registeredRoutes.has(route)) {
      errors.push(`${route}: 未注册的页面四件套`);
    }
  }

  const jsonDirectories = ['pages', 'components'].map((name) => path.join(miniRoot, name));
  for (const directory of jsonDirectories) {
    for (const file of walkFiles(directory).filter((candidate) => (
      path.extname(candidate) === '.json'
    ))) {
      const relative = toPosix(path.relative(miniRoot, file));
      const parsed = parseJson(
        file,
        relative,
        errors,
        scannedFiles
      );
      if (parsed) addJsonRiskErrors(parsed, relative, errors);
    }
  }

  for (const file of walkFiles(miniRoot).filter((candidate) => (
    SOURCE_EXTENSIONS.has(path.extname(candidate))
  ))) {
    const relative = toPosix(path.relative(miniRoot, file));
    if (
      /(?:^|\/)(?:simulated?-analysis|simulate-features|mock-analysis)(?:\.|\/)/i.test(relative)
    ) {
      errors.push(`${relative}: 禁止遗留的模拟分析模块`);
    }
    scanSource(file, miniRoot, errors, scannedFiles);
  }

  verifyStaticContent(miniRoot, errors);
  return {
    errors,
    pageCount: pages.length,
    scannedFileCount: scannedFiles.size
  };
}

function main() {
  const defaultRoot = path.resolve(__dirname, '..');
  const projectRoot = path.resolve(process.argv[2] || defaultRoot);
  const result = verifyProject(projectRoot);

  if (result.errors.length > 0) {
    console.error('Verification failed:');
    for (const error of [...new Set(result.errors)]) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Pages: ${result.pageCount}`);
  console.log(`Scanned files: ${result.scannedFileCount}`);
  console.log('Verification passed');
}

if (require.main === module) main();

module.exports = { verifyProject };
