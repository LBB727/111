const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createComponentHarness,
  createPageHarness
} = require('./helpers/miniprogram-harness');

const miniprogramRoot = path.resolve(__dirname, '../apps/miniprogram');

function tapChoice({ options, value, multiple = false, index }) {
  const harness = createComponentHarness(
    'components/choice-group/index.js',
    { options, value, multiple }
  );
  Object.assign(harness.component.data, { options, value, multiple });
  harness.component.onSelect({ currentTarget: { dataset: { index } } });
  return harness.events[0];
}

test('profile renders every selection as a full tap-target choice group', () => {
  const config = JSON.parse(fs.readFileSync(
    path.join(miniprogramRoot, 'pages/profile/index.json'),
    'utf8'
  ));
  const markup = fs.readFileSync(
    path.join(miniprogramRoot, 'pages/profile/index.wxml'),
    'utf8'
  );
  const styles = fs.readFileSync(
    path.join(miniprogramRoot, 'pages/profile/index.wxss'),
    'utf8'
  );

  assert.equal(
    config.usingComponents?.['choice-group'],
    '../../components/choice-group/index'
  );
  assert.equal(
    config.usingComponents?.['step-header'],
    '../../components/step-header/index'
  );
  const choiceBlocks = [...markup.matchAll(/<choice-group\b([\s\S]*?)\/>/g)]
    .map((match) => match[1]);
  const expectedBindings = [
    ['表达方向', 'options.presentationMode', 'form.presentationMode', false, 'onPresentationModeChange'],
    ['当前场景（可多选）', 'options.scene', 'form.scenes', true, 'onScenesChange'],
    ['活动环境（可多选）', 'options.activityContext', 'form.activityContext', true, 'onActivityContextChange'],
    ['希望呈现（可多选）', 'options.desiredEffects', 'form.desiredEffects', true, 'onDesiredEffectsChange']
  ];

  assert.equal(choiceBlocks.length, expectedBindings.length);
  choiceBlocks.forEach((block, index) => {
    const [label, options, value, multiple, handler] = expectedBindings[index];
    assert.match(block, new RegExp(`label="${label}"`));
    assert.match(block, new RegExp(`options="\\{\\{${options.replace('.', '\\.')}\\}\\}"`));
    assert.match(block, new RegExp(`value="\\{\\{${value.replace('.', '\\.')}\\}\\}"`));
    assert.equal(/(?:^|\s)multiple(?:\s|$)/.test(block), multiple);
    assert.match(block, new RegExp(`bind:change="${handler}"`));
  });
  assert.doesNotMatch(markup, /<(?:radio|checkbox)(?:\s|>)/);
  assert.doesNotMatch(markup, /\.includes\s*\(/);
  assert.equal((markup.match(/profile-error--choice/g) || []).length, 4);
  assert.match(styles, /\.profile-section__title\s*\{/);
  assert.match(styles, /\.profile-error\s*\{[^}]*margin-top:\s*12rpx/s);
  assert.match(styles, /\.profile-error--choice\s*\{[^}]*margin-top:\s*-24rpx/s);
});

test('tap-based single and multiple choices update the profile form', () => {
  const { page } = createPageHarness('profile');

  const presentationEvent = tapChoice({
    options: page.data.options.presentationMode,
    value: page.data.form.presentationMode,
    index: 2
  });
  assert.deepEqual(presentationEvent, {
    name: 'change',
    detail: { value: 'neutral' }
  });
  page.onPresentationModeChange({ detail: presentationEvent.detail });
  assert.equal(page.data.form.presentationMode, 'neutral');

  const sceneEvent = tapChoice({
    options: page.data.options.scene,
    value: page.data.form.scenes,
    multiple: true,
    index: 0
  });
  assert.deepEqual(sceneEvent, {
    name: 'change',
    detail: { value: ['commute'] }
  });
  page.onScenesChange({ detail: sceneEvent.detail });
  assert.deepEqual(page.data.form.scenes, ['commute']);

  const deselectSceneEvent = tapChoice({
    options: page.data.options.scene,
    value: page.data.form.scenes,
    multiple: true,
    index: 0
  });
  assert.deepEqual(deselectSceneEvent, {
    name: 'change',
    detail: { value: [] }
  });
  page.onScenesChange({ detail: deselectSceneEvent.detail });
  assert.deepEqual(page.data.form.scenes, []);
});
