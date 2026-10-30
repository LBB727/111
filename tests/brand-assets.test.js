const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const miniprogramRoot = path.join(projectRoot, 'apps', 'miniprogram');
const iconPath = path.join(projectRoot, 'output', '本色衣橱-应用图标-1024.png');
const svgPaths = [
  'assets/branding/brand-mark.svg',
  'assets/styling/overall-womenswear.svg',
  'assets/styling/overall-menswear.svg',
  'assets/styling/overall-neutral.svg',
  'assets/styling/overall-mixed.svg',
  'assets/styling/item-top.svg',
  'assets/styling/item-outerwear.svg',
  'assets/styling/item-trousers.svg',
  'assets/styling/item-skirt.svg',
  'assets/styling/item-dress.svg',
  'assets/styling/item-shoes.svg',
  'assets/styling/item-bag.svg',
  'assets/styling/technical-jacket.svg',
  'assets/styling/technical-trousers.svg',
  'assets/styling/technical-skirt.svg',
  'assets/styling/technical-dress.svg'
].map((relativePath) => path.join(miniprogramRoot, relativePath));

function readPngDimensions(filePath) {
  const png = fs.readFileSync(filePath);
  assert.deepEqual(
    [...png.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    'application icon must be a PNG'
  );
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20)
  };
}

test('upload icon is a real 1024 by 1024 PNG and the in-app mark stays vector', () => {
  assert.equal(fs.existsSync(iconPath), true, 'missing application icon');
  assert.deepEqual(readPngDimensions(iconPath), { width: 1024, height: 1024 });

  const brandMarkPath = svgPaths[0];
  assert.equal(fs.existsSync(brandMarkPath), true, 'missing brand mark');
  assert.match(fs.readFileSync(brandMarkPath, 'utf8'), /<svg\b[^>]*viewBox=/);
});

test('all original SVG assets are small, local, inert, faceless, and font-free', () => {
  const forbidden = [
    /<image\b/i,
    /(?:href|src)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:\/\//i,
    /@font-face|font-family/i,
    /<script\b|on(?:load|click|error)\s*=/i,
    /<(?:text|foreignObject)\b/i,
    /\b(?:eye|eyes|mouth|nose|face)\b/i
  ];

  for (const filePath of svgPaths) {
    assert.equal(fs.existsSync(filePath), true, `missing ${path.basename(filePath)}`);
    const source = fs.readFileSync(filePath, 'utf8');
    assert.ok(Buffer.byteLength(source) < 30 * 1024, `${path.basename(filePath)} exceeds 30 KB`);
    assert.match(source, /^<svg\b/);
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(filePath)} matched ${pattern}`);
    }
  }
});

test('styling illustrations use the approved canvas sizes and local brand palette', () => {
  const allowedColors = new Set([
    '#F7F4ED', '#617560', '#465A47', '#B98A69',
    '#1F2A44', '#F4EFE6', '#A84A3A', '#171514',
    '#FFFFFF', 'none'
  ]);

  for (const filePath of svgPaths.slice(1)) {
    const source = fs.readFileSync(filePath, 'utf8');
    assert.match(source, /viewBox="0 0 (?:320 420|240 240)"/);
    const colors = [...source.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(colors.every((color) => allowedColors.has(color)), path.basename(filePath));
  }
});
