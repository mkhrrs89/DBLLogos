(() => {
  const LEGACY_SAVED_NEWS_KEY = 'dbl-logo-news-feed:v1';
  const DB_NAME = 'dbl-logo-news-cache';
  const DB_VERSION = 1;
  const STORE_NAME = 'feeds';
  const FEED_KEY = 'latest';

  const wrap = document.getElementById('newsWrap');
  const tabBtn = document.getElementById('newsTabBtn');
  const fileInput = document.getElementById('leagueFile');
  const clearBtn = document.getElementById('clearLeagueFileBtn');

  if (!wrap || !tabBtn || !fileInput) return;

  let restoring = false;
  let saveTimer = 0;
  let dbPromise = null;

  restoreSavedNews();

  tabBtn.addEventListener('click', () => {
    if (fileInput.files && fileInput.files.length) return;

    // news.js renders its upload prompt first when the original File object is
    // no longer available after a browser/app restart. Restore the saved feed
    // immediately afterward. IndexedDB is asynchronous, so this may replace
    // the prompt a moment after the tab opens.
    window.setTimeout(() => {
      restoreSavedNews();
    }, 0);
  });

  fileInput.addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    if (file) clearSavedNews();
  });

  clearBtn?.addEventListener('click', () => {
    clearSavedNews();
  });

  const observer = new MutationObserver(() => {
    if (restoring) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveCurrentNews, 160);
  });

  observer.observe(wrap, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  });

  async function saveCurrentNews() {
    if (restoring) return;
    const stories = wrap.querySelectorAll('.news-item');
    if (!stories.length) return;

    const [file] = fileInput.files || [];
    const payload = {
      key: FEED_KEY,
      fileName: file?.name || loadSavedTimelineFileName() || '',
      savedAt: new Date().toISOString(),
      count: stories.length,
      html: wrap.innerHTML,
    };

    // IndexedDB is the primary store because News feeds can exceed the small
    // localStorage quota once player photos/logos and many stories are present.
    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(payload);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Could not save News feed.'));
        tx.onabort = () => reject(tx.error || new Error('Could not save News feed.'));
      });
    } catch (error) {
      console.warn('Could not save the generated News feed in IndexedDB.', error);
    }

    // Keep a best-effort legacy copy for smaller feeds and migration between
    // versions. Quota failures here are harmless because IndexedDB is primary.
    try {
      localStorage.setItem(LEGACY_SAVED_NEWS_KEY, JSON.stringify(payload));
    } catch (error) {
      // Expected for large feeds; do not treat this as a failed save.
    }
  }

  async function restoreSavedNews() {
    // First try the old synchronous cache so existing successful saves still
    // restore instantly after this update.
    const legacy = loadLegacySavedNews();
    if (legacy?.html && legacy?.count) {
      applySavedNews(legacy);
      migrateLegacyToIndexedDb(legacy);
      return true;
    }

    try {
      const db = await openDatabase();
      const saved = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(FEED_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Could not restore News feed.'));
      });

      if (!saved?.html || !Number(saved?.count)) return false;
      applySavedNews(saved);
      return true;
    } catch (error) {
      console.warn('Could not restore the saved News feed from IndexedDB.', error);
      return false;
    }
  }

  function applySavedNews(saved) {
    restoring = true;
    wrap.className = 'news-wrap';
    wrap.innerHTML = saved.html;
    window.setTimeout(() => {
      restoring = false;
    }, 0);
  }

  function loadLegacySavedNews() {
    try {
      const raw = localStorage.getItem(LEGACY_SAVED_NEWS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.html !== 'string' || !Number(parsed.count)) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  async function migrateLegacyToIndexedDb(saved) {
    if (!saved?.html || !saved?.count) return;
    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ ...saved, key: FEED_KEY });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (error) {
      // The legacy cache can still be used, so migration failure is non-fatal.
    }
  }

  async function clearSavedNews() {
    try {
      localStorage.removeItem(LEGACY_SAVED_NEWS_KEY);
    } catch (error) {
      // Ignore storage cleanup failures.
    }

    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(FEED_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (error) {
      console.warn('Could not clear the saved News feed from IndexedDB.', error);
    }
  }

  function openDatabase() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is not available in this browser.'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open the News cache.'));
    });

    return dbPromise;
  }

  function loadSavedTimelineFileName() {
    try {
      const raw = localStorage.getItem('dbl-logo-timeline:v1');
      if (!raw) return '';
      const parsed = JSON.parse(raw);
      return typeof parsed?.fileName === 'string' ? parsed.fileName : '';
    } catch (error) {
      return '';
    }
  }
})();
