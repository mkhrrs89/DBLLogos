(() => {
  const FIRST_YEAR = 1916;
  const LAST_YEAR = 2045;
  const STORAGE_KEY = 'dbl-logo-headshot-backgrounds:v1';
  const FORMAT = 'dbl-headshot-backgrounds';
  const wrap = document.getElementById('headshotBackgroundsWrap');
  const importButton = document.getElementById('importHeadshotBackgroundsBtn');
  const exportButton = document.getElementById('exportHeadshotBackgroundsBtn');
  const importFile = document.getElementById('headshotBackgroundsImportFile');
  const status = document.getElementById('headshotBackgroundsStatus');
  if (!wrap || !importButton || !exportButton || !importFile) return;

  function normalizeLinks(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Expected an object of year-to-image links.');
    }
    const cleaned = {};
    for (const [year, url] of Object.entries(value)) {
      const numericYear = Number(year);
      if (!Number.isInteger(numericYear) || numericYear < FIRST_YEAR || numericYear > LAST_YEAR) continue;
      if (typeof url !== 'string') continue;
      const trimmed = url.trim();
      if (trimmed) cleaned[String(numericYear)] = trimmed;
    }
    return cleaned;
  }

  function load() {
    try {
      return normalizeLinks(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    } catch (error) {
      console.warn('Could not read saved headshot background links.', error);
      return {};
    }
  }

  let linksByYear = load();
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(linksByYear));
      return true;
    } catch (error) {
      console.warn('Could not save headshot background links.', error);
      setStatus('Could not save links on this device. Export a backup before leaving.');
      return false;
    }
  }
  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function setPreview(frame, url, year) {
    frame.replaceChildren();
    if (!url) return;
    const image = document.createElement('img');
    image.src = url;
    image.alt = 'Headshot background for ' + year;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    // Keep failed/offline image slots blank without erasing saved URLs.
    image.addEventListener('error', () => image.remove(), { once: true });
    frame.appendChild(image);
  }

  function render() {
    const fragment = document.createDocumentFragment();
    for (let year = FIRST_YEAR; year <= LAST_YEAR; year += 1) {
      const key = String(year);
      const card = document.createElement('article');
      card.className = 'banner-card headshot-background-card';

      const heading = document.createElement('h3');
      heading.className = 'banner-year';
      heading.textContent = key;

      const frame = document.createElement('div');
      frame.className = 'headshot-background-frame';
      frame.setAttribute('aria-label', 'Background image for ' + key);
      setPreview(frame, linksByYear[key] || '', key);

      const field = document.createElement('input');
      field.className = 'banner-url-input';
      field.type = 'url';
      field.value = linksByYear[key] || '';
      field.placeholder = 'https://example.com/background.png';
      field.setAttribute('aria-label', 'Headshot background image link for ' + key);
      field.autocomplete = 'off';
      field.addEventListener('input', () => {
        const url = field.value.trim();
        if (url) linksByYear[key] = url;
        else delete linksByYear[key];
        save();
      });
      // Avoid loading a remote image on every keystroke.
      field.addEventListener('change', () => setPreview(frame, field.value.trim(), key));

      card.append(heading, frame, field);
      fragment.appendChild(card);
    }
    wrap.replaceChildren(fragment);
  }

  function downloadJson(payload, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  exportButton.addEventListener('click', () => {
    const now = new Date().toISOString().replace(/:/g, '-').replace(/\..*$/, '');
    downloadJson({
      format: FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      linksByYear: { ...linksByYear },
    }, 'dbl-headshot-background-links-' + now + '.json');
    setStatus('Exported ' + Object.keys(linksByYear).length + ' headshot background links.');
  });

  importButton.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    importFile.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.format !== FORMAT) throw new Error('Select a Headshot Backgrounds export.');
      const cleaned = normalizeLinks(parsed.linksByYear);
      // Replace only this collection. Never touch banner/uniform or league data.
      const prior = linksByYear;
      linksByYear = cleaned;
      if (!save()) {
        linksByYear = prior;
        return;
      }
      render();
      setStatus('Imported ' + Object.keys(cleaned).length + ' headshot background links from ' + file.name + '.');
    } catch (error) {
      setStatus('Import failed: ' + (error?.message || 'Invalid file.'));
    }
  });

  window.addEventListener('dbl:saved-links-imported', (event) => {
    if (!event.detail?.headshotBackgrounds) return;
    linksByYear = load();
    render();
    setStatus('Headshot background links restored from the saved-links backup.');
  });

  // React to other browser tabs updating these independent links.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    linksByYear = load();
    render();
  });

  render(); // All 130 slots are independent of uploaded league history.
})();