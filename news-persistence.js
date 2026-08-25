(() => {
  const SAVED_NEWS_KEY = 'dbl-logo-news-feed:v1';
  const wrap = document.getElementById('newsWrap');
  const tabBtn = document.getElementById('newsTabBtn');
  const fileInput = document.getElementById('leagueFile');
  const clearBtn = document.getElementById('clearLeagueFileBtn');

  if (!wrap || !tabBtn || !fileInput) return;

  let restoring = false;
  let saveTimer = 0;

  restoreSavedNews();

  tabBtn.addEventListener('click', () => {
    // news.js runs its click handler first. When there is no freshly selected
    // File object after an app/browser restart, it will temporarily render its
    // upload prompt. Restore the previously generated feed immediately after.
    window.setTimeout(() => {
      if (!(fileInput.files && fileInput.files.length)) restoreSavedNews();
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
    saveTimer = window.setTimeout(saveCurrentNews, 120);
  });

  observer.observe(wrap, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  });

  function saveCurrentNews() {
    if (restoring) return;
    const stories = wrap.querySelectorAll('.news-item');
    if (!stories.length) return;

    const [file] = fileInput.files || [];
    const payload = {
      fileName: file?.name || loadSavedTimelineFileName() || '',
      savedAt: new Date().toISOString(),
      count: stories.length,
      html: wrap.innerHTML,
    };

    try {
      localStorage.setItem(SAVED_NEWS_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Could not save the generated News feed locally.', error);
    }
  }

  function restoreSavedNews() {
    const saved = loadSavedNews();
    if (!saved?.html || !saved?.count) return false;

    restoring = true;
    wrap.className = 'news-wrap';
    wrap.innerHTML = saved.html;
    window.setTimeout(() => {
      restoring = false;
    }, 0);
    return true;
  }

  function loadSavedNews() {
    try {
      const raw = localStorage.getItem(SAVED_NEWS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.html !== 'string' || !Number(parsed.count)) return null;
      return parsed;
    } catch (error) {
      console.warn('Could not restore the saved News feed.', error);
      return null;
    }
  }

  function clearSavedNews() {
    try {
      localStorage.removeItem(SAVED_NEWS_KEY);
    } catch (error) {
      console.warn('Could not clear the saved News feed.', error);
    }
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
