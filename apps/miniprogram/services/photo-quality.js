const { PHOTO_LIMITS } = require('../config/constants');

const SUPPORTED_FORMATS = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'jpeg', 'jpg', 'png', 'webp'
]);

function inspectPhoto(meta = {}, limits = PHOTO_LIMITS) {
  meta = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
  const checks = [];
  const issues = [];
  const addCheck = (key, passed, label, message) => {
    checks.push({ key, status: passed ? 'pass' : 'fail', label });
    if (!passed) issues.push({ key, message });
  };
  const decoded = meta && (meta.decoded === true || meta.decodeSuccess === true);
  const width = Number(meta.width);
  const height = Number(meta.height);
  const size = Number(meta.size);
  const hasDimensions = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
  const aspect = hasDimensions ? width / height : 0;
  const type = String(meta.type || '').trim().toLowerCase();

  addCheck('decode', decoded, '图片可读取', '图片无法读取，请重新选择');
  addCheck(
    'resolution',
    hasDimensions && width >= limits.minWidth && height >= limits.minHeight,
    '尺寸合适',
    `图片尺寸至少 ${limits.minWidth} × ${limits.minHeight}`
  );
  addCheck(
    'aspect',
    hasDimensions && aspect >= limits.minAspect && aspect <= limits.maxAspect,
    '宽高比合适',
    '图片宽高比不在支持范围内'
  );
  addCheck(
    'size',
    Number.isFinite(size) && size > 0 && size <= limits.maxBytes,
    '文件大小合适',
    `图片文件不能超过 ${limits.maxBytes / (1024 * 1024)}MB`
  );
  addCheck(
    'format',
    SUPPORTED_FORMATS.has(type),
    '文件格式受支持',
    '请选择 JPEG、PNG 或 WebP 图片'
  );

  return { passed: issues.length === 0, checks, issues };
}

module.exports = { inspectPhoto };
