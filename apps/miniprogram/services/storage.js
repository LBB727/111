function createStorage(wxApi) {
  const storage = {
    get(key, fallback = null) {
      try {
        const value = wxApi.getStorageSync(key);
        return { ok: true, value: value === undefined || value === '' ? fallback : value };
      } catch (error) {
        return { ok: false, value: fallback, error };
      }
    },

    set(key, value) {
      try {
        wxApi.setStorageSync(key, value);
        return { ok: true };
      } catch (error) {
        return { ok: false, error };
      }
    },

    remove(key) {
      try {
        wxApi.removeStorageSync(key);
        return { ok: true };
      } catch (error) {
        return { ok: false, error };
      }
    },

    removeMany(keys) {
      const failedKeys = keys.filter((key) => !storage.remove(key).ok);
      return { ok: failedKeys.length === 0, failedKeys };
    }
  };

  return storage;
}

module.exports = { createStorage };
