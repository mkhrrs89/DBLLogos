(() => {
  if (window.DBLLeagueFileHub) return;

  const DB_NAME = 'zengm-companion-league-file-cache';
  const DB_VERSION = 1;
  const STORE_NAME = 'files';
  const CACHE_KEY = 'latest';

  let currentFile = null;
  let version = 0;
  let stateEpoch = 0;
  let dbPromise = null;
  const subscribers = new Set();

  function getSnapshot(source = 'current') {
    return {
      file: currentFile,
      version,
      source,
    };
  }

  function notify(source) {
    const snapshot = getSnapshot(source);
    window.queueMicrotask(() => {
      for (const subscriber of subscribers) {
        try {
          subscriber(snapshot);
        } catch (error) {
          console.error('League file subscriber failed.', error);
        }
      }

      window.dispatchEvent(new CustomEvent('dbl:league-file', {
        detail: snapshot,
      }));
    });
  }

  function publish(file, source = 'upload') {
    if (!(file instanceof Blob)) return null;

    currentFile = normalizeFile(file);
    version += 1;
    stateEpoch += 1;
    notify(source);

    if (source !== 'restore') {
      void persistFile(currentFile);
    }

    return getSnapshot(source);
  }

  function clear(source = 'clear') {
    currentFile = null;
    version += 1;
    stateEpoch += 1;
    notify(source);
    void clearPersistedFile();
  }

  function subscribe(callback, { immediate = true } = {}) {
    if (typeof callback !== 'function') return () => {};
    subscribers.add(callback);

    if (immediate && currentFile) {
      const snapshot = getSnapshot('current');
      window.queueMicrotask(() => {
        if (!subscribers.has(callback)) return;
        try {
          callback(snapshot);
        } catch (error) {
          console.error('League file subscriber failed.', error);
        }
      });
    }

    return () => subscribers.delete(callback);
  }

  function normalizeFile(file, metadata = {}) {
    if (typeof File !== 'undefined' && file instanceof File) return file;

    const name = metadata.name || file?.name || 'league.json';
    const type = metadata.type || file?.type || 'application/json';
    const lastModified = Number(metadata.lastModified || file?.lastModified) || Date.now();

    try {
      return new File([file], name, { type, lastModified });
    } catch (error) {
      try {
        Object.defineProperties(file, {
          name: { value: name, configurable: true },
          lastModified: { value: lastModified, configurable: true },
        });
      } catch (defineError) {
        // Blob-only fallback still works with the readers in this app.
      }
      return file;
    }
  }

  function openDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open league file cache.'));
    }).catch((error) => {
      console.warn('Could not open the persistent league file cache.', error);
      return null;
    });

    return dbPromise;
  }

  async function persistFile(file) {
    const db = await openDb();
    if (!db || !file) return;

    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({
          key: CACHE_KEY,
          file,
          name: file.name || 'league.json',
          type: file.type || 'application/json',
          lastModified: Number(file.lastModified) || Date.now(),
          size: Number(file.size) || 0,
          savedAt: new Date().toISOString(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Could not save league file.'));
        tx.onabort = () => reject(tx.error || new Error('League file save was aborted.'));
      });
    } catch (error) {
      console.warn('Could not persist the loaded league file. It will remain available until this page closes.', error);
    }
  }

  async function clearPersistedFile() {
    const db = await openDb();
    if (!db) return;

    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(CACHE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Could not clear saved league file.'));
        tx.onabort = () => reject(tx.error || new Error('League file clear was aborted.'));
      });
    } catch (error) {
      console.warn('Could not clear the persistent league file cache.', error);
    }
  }

  async function restorePersistedFile() {
    const restoreEpoch = stateEpoch;
    const db = await openDb();
    if (!db || restoreEpoch !== stateEpoch || currentFile) return;

    try {
      const record = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(CACHE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Could not restore league file.'));
      });

      if (!record?.file || restoreEpoch !== stateEpoch || currentFile) return;

      currentFile = normalizeFile(record.file, record);
      version += 1;
      notify('restore');
    } catch (error) {
      console.warn('Could not restore the previously loaded league file.', error);
    }
  }

  window.DBLLeagueFileHub = {
    publish,
    clear,
    subscribe,
    getCurrentFile: () => currentFile,
    getVersion: () => version,
    ready: restorePersistedFile(),
  };

  document.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
    if (input.id !== 'leagueFile' && !input.matches('[data-league-file-input]')) return;

    const [file] = input.files || [];
    if (file) publish(file, 'upload');
  }, true);

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#clearLeagueFileBtn')) clear('clear');
  }, true);
})();
