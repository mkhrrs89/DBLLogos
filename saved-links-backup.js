(() => {
  const KEYS = {
    banners: 'dbl-logo-banners:v1',
    uniforms: 'dbl-logo-uniforms:v1',
    headshotBackgrounds: 'dbl-logo-headshot-backgrounds:v1',
    headshotBackgroundStatuses: 'dbl-logo-headshot-background-statuses:v1',
  };
  const FORMAT = 'dbl-saved-links';
  const exportButton = document.getElementById('exportSavedLinksBtn');
  const importButton = document.getElementById('importSavedLinksBtn');
  const fileInput = document.getElementById('savedLinksImportFile');
  const status = document.getElementById('savedLinksStatus');
  if (!exportButton || !importButton || !fileInput) return;

  function report(message) {
    if (status) status.textContent = message;
  }

  function cleanMap(value, category) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid ' + category + ' link data.');
    }
    const cleaned = {};
    for (const [key, url] of Object.entries(value)) {
      if (category === 'headshotBackgrounds' || category === 'headshotBackgroundStatuses') {
        const year = Number(key);
        if (!Number.isInteger(year) || year < 1916 || year > 2045) continue;
      }
      if (category === 'headshotBackgroundStatuses') {
        if (url === 'confirmed' || url === 'unsure' || url === 'disliked') cleaned[String(Number(key))] = url;
        continue;
      }
      if (typeof url !== 'string' || !url.trim()) continue;
      cleaned[String(key)] = url.trim();
    }
    return cleaned;
  }

  function readMap(key, category) {
    try {
      return cleanMap(JSON.parse(localStorage.getItem(key) || '{}'), category);
    } catch (error) {
      console.warn('Could not read ' + category + ' for export.', error);
      throw new Error('Could not read saved ' + category + ' links. Export cancelled.');
    }
  }

  exportButton.addEventListener('click', () => {
    try {
      const links = Object.fromEntries(Object.entries(KEYS).map(([name, key]) => [name, readMap(key, name)]));
      const payload = { format: FORMAT, version: 2, exportedAt: new Date().toISOString(), links };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'dbl-saved-links-' + new Date().toISOString().replace(/:/g, '-').replace(/\..*$/, '') + '.json';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      report('Exported banners, uniforms, headshot background links, and border selections.');
    } catch (error) {
      report(error?.message || 'Export failed.');
    }
  });

  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      if (data?.format !== FORMAT || !data.links || typeof data.links !== 'object' || Array.isArray(data.links)) {
        throw new Error('Select a DBL Saved Links backup file.');
      }
      const incoming = {};
      for (const [category, key] of Object.entries(KEYS)) {
        if (!Object.hasOwn(data.links, category)) continue;
        incoming[category] = cleanMap(data.links[category], category);
      }
      if (!Object.keys(incoming).length) throw new Error('The backup does not contain supported link collections.');

      // An import changes only collections provided by the backup. Never
      // delete/reset the league file, or unrelated local app preferences.
      const previous = {};
      const updated = [];
      try {
        for (const [category, values] of Object.entries(incoming)) {
          previous[category] = localStorage.getItem(KEYS[category]);
          localStorage.setItem(KEYS[category], JSON.stringify(values));
          updated.push(category);
        }
      } catch (error) {
        for (const category of updated) {
          try {
            if (previous[category] === null) localStorage.removeItem(KEYS[category]);
            else localStorage.setItem(KEYS[category], previous[category]);
          } catch (ignored) {
            console.warn('Could not roll back a failed saved-links import.', ignored);
          }
        }
        throw new Error('Could not save imported links on this device.');
      }
      window.dispatchEvent(new CustomEvent('dbl:saved-links-imported', {
        detail: {
          banners: 'banners' in incoming,
          uniforms: 'uniforms' in incoming,
          headshotBackgrounds: 'headshotBackgrounds' in incoming,
          headshotBackgroundStatuses: 'headshotBackgroundStatuses' in incoming,
        },
      }));
      report('Imported saved links: ' + Object.keys(incoming).join(', ') + '.');
    } catch (error) {
      report('Import failed: ' + (error?.message || 'Invalid file.'));
    }
  });
})();