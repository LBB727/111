const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const miniRoot = path.resolve(__dirname, '../apps/miniprogram');

function collectFiles(directory, extension, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(target, extension, files);
    else if (target.endsWith(extension)) files.push(target);
  }
  return files;
}

test('Mini Program WXSS uses explicit state classes instead of unsupported attribute selectors', () => {
  const styles = collectFiles(miniRoot, '.wxss')
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');

  assert.doesNotMatch(styles, /\[[^\]]+\]/);
});

test('recommendation controls expose expanded and selected state to assistive technology', () => {
  const markup = fs.readFileSync(
    path.join(miniRoot, 'components/recommendation-card/index.wxml'),
    'utf8'
  );

  assert.match(markup, /<button[\s\S]*?aria-expanded="\{\{expanded\}\}"/);
  assert.match(markup, /aria-checked="\{\{favorite\}\}"/);
  for (const state of [
    'liked', 'owned', 'tried', 'not-for-me', 'suppress-similar'
  ]) {
    assert.match(
      markup,
      new RegExp(`aria-checked="\\{\\{feedback === '${state}'\\}\\}"`)
    );
  }
  assert.ok((markup.match(/aria-hidden="true"/g) || []).length >= 4);
});

test('critical Mini Program copy is not line-clamped or placed in fixed-height text boxes', () => {
  const styleFiles = collectFiles(miniRoot, '.wxss');
  const criticalSelector = /__(?:title|subtitle|description|action|reason|alternative|basis|value|copy|disclaimer|hint|note|label)(?![-\w])/;

  for (const file of styleFiles) {
    const styles = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(
      styles,
      /(?:-webkit-)?line-clamp\s*:|text-overflow\s*:/,
      path.relative(miniRoot, file)
    );

    for (const rule of styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, selector, declarations] = rule;
      if (!criticalSelector.test(selector)) continue;
      assert.doesNotMatch(
        declarations,
        /(?:^|[;\s])(?:height|max-height)\s*:/,
        `${path.relative(miniRoot, file)} ${selector.trim()}`
      );
    }
  }
});
