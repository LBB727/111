const path = require('node:path');

const miniprogramRoot = path.resolve(__dirname, '../../apps/miniprogram');

function runWithGlobals(values, callback) {
  const previous = {};
  const owned = {};

  Object.entries(values).forEach(([name, value]) => {
    owned[name] = Object.prototype.hasOwnProperty.call(global, name);
    previous[name] = global[name];
    global[name] = value;
  });

  try {
    return callback();
  } finally {
    Object.keys(values).forEach((name) => {
      if (owned[name]) global[name] = previous[name];
      else delete global[name];
    });
  }
}

function loadDefinition(registerName, modulePath) {
  let definition;
  runWithGlobals({
    [registerName](value) {
      definition = value;
    }
  }, () => {
    delete require.cache[require.resolve(modulePath)];
    require(modulePath);
  });
  return definition;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createScheduler() {
  let nextId = 1;
  let runner = (callback) => callback();
  const jobs = [];

  return {
    setRunner(nextRunner) {
      runner = nextRunner;
    },

    setTimeout(callback, delay) {
      const job = {
        id: nextId,
        callback,
        delay,
        canceled: false,
        ran: false
      };
      nextId += 1;
      jobs.push(job);
      return job.id;
    },

    clearTimeout(id) {
      const job = jobs.find((candidate) => candidate.id === id);
      if (job) job.canceled = true;
    },

    pendingDelays() {
      return jobs
        .filter((job) => !job.canceled && !job.ran)
        .map((job) => job.delay);
    },

    runByDelay(delay) {
      const job = jobs.find((candidate) => (
        candidate.delay === delay
        && !candidate.canceled
        && !candidate.ran
      ));
      if (!job) throw new Error(`No pending timer for ${delay}ms`);
      job.ran = true;
      runner(job.callback);
      return job;
    },

    invoke(job) {
      runner(job.callback);
    },

    jobs
  };
}

function createPageHarness(route, options = {}) {
  const pagePath = path.join(miniprogramRoot, 'pages', route, 'index.js');
  const definition = loadDefinition('Page', pagePath);
  const scheduler = options.scheduler || createScheduler();
  const session = options.session || {};
  const app = options.app || {
    globalData: { session },
    resetSession() {}
  };
  const wxApi = options.wxApi || {};
  const globals = {
    getApp: () => app,
    wx: wxApi,
    setTimeout: scheduler.setTimeout.bind(scheduler),
    clearTimeout: scheduler.clearTimeout.bind(scheduler)
  };
  const invoke = (callback) => runWithGlobals(globals, callback);
  scheduler.setRunner(invoke);

  const page = {
    ...definition,
    data: clone(definition.data || {}),
    setData(patch) {
      this.data = { ...this.data, ...patch };
    }
  };

  Object.entries(definition).forEach(([name, handler]) => {
    if (typeof handler !== 'function') return;
    page[name] = function invokePageHandler(...args) {
      return invoke(() => handler.apply(this, args));
    };
  });

  return { page, scheduler, app, wxApi, invoke };
}

function createComponentHarness(componentPath, properties = {}) {
  const absolutePath = path.join(miniprogramRoot, componentPath);
  const definition = loadDefinition('Component', absolutePath);
  const events = [];
  const component = {
    properties,
    data: clone(definition.data || {}),
    setData(patch) {
      this.data = { ...this.data, ...patch };
    },
    triggerEvent(name, detail) {
      events.push({ name, detail });
    }
  };

  Object.entries(definition.methods || {}).forEach(([name, handler]) => {
    component[name] = function invokeComponentHandler(...args) {
      return handler.apply(this, args);
    };
  });

  return { component, events };
}

module.exports = {
  createComponentHarness,
  createPageHarness,
  createScheduler
};
