const test = require('node:test');
const assert = require('node:assert/strict');
const { createPageHarness } = require('./helpers/miniprogram-harness');
const { safeNavigate, safeRedirect } = require('../apps/miniprogram/utils/navigation');
const { inspectPhoto } = require('../apps/miniprogram/services/photo-quality');

function home() {
  const requests = [];
  let resets = 0;
  const app = {
    globalData: { session: {} },
    resetSession() { resets += 1; this.globalData.session = {}; }
  };
  const harness = createPageHarness('home', {
    app,
    wxApi: {
      navigateTo: (options) => requests.push(options),
      redirectTo: (options) => requests.push(options),
      showToast() {}
    }
  });
  harness.page.onShow();
  return { ...harness, requests, resets: () => resets };
}

test('rapid mixed home taps preserve the first flow and navigate once', () => {
  const h = home();
  h.page.onStartManual();
  h.page.onStartPhoto();
  h.page.onViewDemo();
  h.page.onOpenSettings();
  assert.equal(h.requests.length, 1);
  assert.equal(h.resets(), 1);
  assert.equal(h.app.globalData.session.analysisMode, 'manual');
});

test('home returning from another page releases its lock without accepting old failures', () => {
  const h = home();
  h.page.onStartManual();
  const oldRequest = h.requests[0];
  h.page.onShow();
  h.page.onOpenSettings();
  oldRequest.fail();
  assert.equal(h.requests.length, 2);
  assert.equal(h.page._navigating, true);
});

test('home navigation failure allows retry; callbacks after unload stay inert', () => {
  const h = home();
  h.page.onOpenSettings();
  h.invoke(() => h.requests[0].fail());
  h.invoke(() => h.requests[1].fail());
  h.page.onStartPhoto();
  assert.equal(h.requests.length, 3);
  h.page.onUnload();
  h.requests[2].fail();
  assert.equal(h.requests.length, 3);
});

for (const [helper, primary, fallback] of [
  [safeNavigate, 'navigateTo', 'redirectTo'],
  [safeRedirect, 'redirectTo', 'reLaunch']
]) {
  test(`${primary} fallback and final failure run once despite duplicate callbacks`, () => {
    let request;
    let fallbackRequest;
    let fallbackCalls = 0;
    let failures = 0;
    const api = {
      [primary](options) { request = options; },
      [fallback](options) { fallbackCalls += 1; fallbackRequest = options; }
    };
    helper(api, '/target', '/fallback', () => true, () => { failures += 1; });
    request.fail();
    request.fail();
    fallbackRequest.fail();
    fallbackRequest.fail();
    assert.equal(fallbackCalls, 1);
    assert.equal(failures, 1);
  });

  test(`${primary} ignores late failure after success and a cancelled fallback failure`, () => {
    let request;
    let fallbackRequest;
    let active = true;
    let failures = 0;
    const api = {
      [primary](options) { request = options; },
      [fallback](options) { fallbackRequest = options; }
    };
    helper(api, '/target', '/fallback', () => active, () => { failures += 1; });
    request.success();
    request.fail();
    assert.equal(fallbackRequest, undefined);
    helper(api, '/target', '/fallback', () => active, () => { failures += 1; });
    request.fail();
    active = false;
    fallbackRequest.fail();
    assert.equal(failures, 0);
  });
}

test('missing and malformed photo metadata return actionable failed checks', () => {
  for (const value of [null, undefined, [], '', 42]) {
    const result = inspectPhoto(value);
    assert.equal(result.passed, false);
    assert.equal(result.issues.length, 5);
  }
});
