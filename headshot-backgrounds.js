(() => {
  const FIRST_YEAR = 1916;
  const LAST_YEAR = 2045;
  const STORAGE_KEY = 'dbl-logo-headshot-backgrounds:v1';
  const STATUS_STORAGE_KEY = 'dbl-logo-headshot-background-statuses:v1';
  const STATUS_CYCLE = ['', 'confirmed', 'unsure', 'disliked'];
  const STATUS_LABELS = {
    '': 'No selection',
    confirmed: 'Confirmed',
    unsure: 'Unsure',
    disliked: 'Do not like',
  };
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

  function normalizeStatuses(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Expected an object of year-to-review statuses.');
    }
    const cleaned = {};
    for (const [year, status] of Object.entries(value)) {
      const numericYear = Number(year);
      if (!Number.isInteger(numericYear) || numericYear < FIRST_YEAR || numericYear > LAST_YEAR) continue;
      if (STATUS_CYCLE.includes(status) && status) cleaned[String(numericYear)] = status;
    }
    return cleaned;
  }

  function loadStatuses() {
    try {
      return normalizeStatuses(JSON.parse(localStorage.getItem(STATUS_STORAGE_KEY) || '{}'));
    } catch (error) {
      console.warn('Could not read saved headshot background statuses.', error);
      return {};
    }
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
  let statusesByYear = loadStatuses();

  function saveStatuses() {
    try {
      localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(statusesByYear));
      return true;
    } catch (error) {
      console.warn('Could not save headshot background statuses.', error);
      setStatus('Could not save border selections on this device. Export a backup before leaving.');
      return false;
    }
  }

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
    // Only replace the image: the status label and its click target must remain.
    frame.querySelector('img')?.remove();
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

  function applyReviewStatus(frame, key) {
    const current = statusesByYear[key] || '';
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
    const borderColors = {
      confirmed: '#22b8a5',
      unsure: '#e8c542',
      disliked: '#e04a52',
    };
    const color = borderColors[current] || '';
    frame.dataset.reviewStatus = current;
    // A CSS overlay draws over the image instead of changing the frame's
    // content box: its 2:3 image area never shrinks or letterboxes on selection.
    frame.style.setProperty('--headshot-rating-border-color', color || 'transparent');
    frame.style.boxShadow = color ? '0 0 0 2px ' + color : 'none';
    frame.setAttribute('aria-label',
      'Background for ' + key + ': ' + STATUS_LABELS[current]
      + '. Activate to mark ' + STATUS_LABELS[next] + '.');
    frame.title = key + ': ' + STATUS_LABELS[current] + ' — click to mark ' + STATUS_LABELS[next];
    const marker = frame.querySelector('.headshot-background-rating-label');
    if (marker) {
      marker.textContent = current ? STATUS_LABELS[current] : '';
      marker.hidden = !current;
    }
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

      const frame = document.createElement('button');
      frame.type = 'button';
      frame.className = 'headshot-background-frame';
      applyReviewStatus(frame, key);
      frame.addEventListener('click', () => {
        const previous = statusesByYear[key] || '';
        const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(previous) + 1) % STATUS_CYCLE.length];
        if (next) statusesByYear[key] = next;
        else delete statusesByYear[key];
        if (!saveStatuses()) {
          if (previous) statusesByYear[key] = previous;
          else delete statusesByYear[key];
        }
        applyReviewStatus(frame, key);
      });
      const ratingLabel = document.createElement('span');
      ratingLabel.className = 'headshot-background-rating-label';
      ratingLabel.hidden = true;
      frame.appendChild(ratingLabel);
      setPreview(frame, linksByYear[key] || '', key);
      applyReviewStatus(frame, key);

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
      version: 2,
      exportedAt: new Date().toISOString(),
      linksByYear: { ...linksByYear },
      statusesByYear: { ...statusesByYear },
    }, 'dbl-headshot-background-links-' + now + '.json');
    setStatus('Exported ' + Object.keys(linksByYear).length + ' headshot background links and '
      + Object.keys(statusesByYear).length + ' border selections.');
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
      // Older headshot exports lack statusesByYear. Keep existing selections
      // intact when one of those files is imported.
      const containsStatuses = Object.hasOwn(parsed, 'statusesByYear');
      const importedStatuses = containsStatuses ? normalizeStatuses(parsed.statusesByYear) : null;
      // Roll back both collections if either write fails, without touching the
      // banner/uniform collections or uploaded league file.
      const previousLinks = linksByYear;
      const previousStatuses = statusesByYear;
      const previousRawLinks = localStorage.getItem(STORAGE_KEY);
      const previousRawStatuses = localStorage.getItem(STATUS_STORAGE_KEY);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
        if (containsStatuses) {
          localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(importedStatuses));
        }
      } catch (storageError) {
        try {
          if (previousRawLinks === null) localStorage.removeItem(STORAGE_KEY);
          else localStorage.setItem(STORAGE_KEY, previousRawLinks);
          if (containsStatuses) {
            if (previousRawStatuses === null) localStorage.removeItem(STATUS_STORAGE_KEY);
            else localStorage.setItem(STATUS_STORAGE_KEY, previousRawStatuses);
          }
        } catch (rollbackError) {
          console.warn('Could not fully restore links after failed import.', rollbackError);
        }
        linksByYear = previousLinks;
        statusesByYear = previousStatuses;
        throw new Error('Could not save imported headshot links and borders on this device.');
      }
      linksByYear = cleaned;
      if (containsStatuses) statusesByYear = importedStatuses;
      render();
      setStatus('Imported ' + Object.keys(cleaned).length + ' headshot background links'
        + (containsStatuses ? ' and ' + Object.keys(importedStatuses).length + ' border selections' : ' (existing border selections kept)')
        + ' from ' + file.name + '.');
    } catch (error) {
      setStatus('Import failed: ' + (error?.message || 'Invalid file.'));
    }
  });

  window.addEventListener('dbl:saved-links-imported', (event) => {
    if (!event.detail?.headshotBackgrounds && !event.detail?.headshotBackgroundStatuses) return;
    if (event.detail.headshotBackgrounds) linksByYear = load();
    if (event.detail.headshotBackgroundStatuses) statusesByYear = loadStatuses();
    render();
    setStatus('Headshot background links and border selections updated from the saved-links backup.');
  });

  // React to other browser tabs updating these independent links.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY && event.key !== STATUS_STORAGE_KEY) return;
    if (event.key === STORAGE_KEY) linksByYear = load();
    if (event.key === STATUS_STORAGE_KEY) statusesByYear = loadStatuses();
    render();
  });

  render(); // All 130 slots are independent of uploaded league history.
})();