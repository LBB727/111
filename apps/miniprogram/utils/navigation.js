function safeNavigate(
  wxApi,
  route,
  fallback,
  shouldContinue = () => true,
  onFailure = () => {}
) {
  let fallbackStarted = false;
  let finished = false;
  const failed = () => {
    if (finished || !shouldContinue()) return;
    finished = true;
    onFailure();
  };
  const fail = () => {
    if (fallbackStarted || finished || !shouldContinue()) return;
    fallbackStarted = true;
    try {
      wxApi.redirectTo({
        url: fallback,
        success: () => { finished = true; },
        fail: failed
      });
    } catch (error) {
      failed();
    }
  };
  try {
    wxApi.navigateTo({ url: route, success: () => { finished = true; }, fail });
  } catch (error) {
    fail();
  }
}

function safeRedirect(
  wxApi,
  route,
  fallback,
  shouldContinue = () => true,
  onFailure = () => {}
) {
  let fallbackStarted = false;
  let finished = false;
  const failed = () => {
    if (finished || !shouldContinue()) return;
    finished = true;
    onFailure();
  };
  const fail = () => {
    if (fallbackStarted || finished || !shouldContinue()) return;
    fallbackStarted = true;
    try {
      wxApi.reLaunch({ url: fallback, success: () => { finished = true; }, fail: failed });
    } catch (error) {
      failed();
    }
  };
  try {
    wxApi.redirectTo({ url: route, success: () => { finished = true; }, fail });
  } catch (error) {
    fail();
  }
}

module.exports = { safeNavigate, safeRedirect };
