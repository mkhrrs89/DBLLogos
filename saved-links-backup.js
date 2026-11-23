(() => {
  const KEYS = {
    banners: 'dbl-logo-banners:v1',
    uniforms: 'dbl-logo-uniforms:v1',
    headshotBackgrounds: 'dbl-logo-headshot-backgrounds:v1',
    headshotBackgroundStatuses: 'dbl-logo-headshot-background-statuses:v1',
  };
  const FORMAT = 'dbl-saved-links';
  const market = window.DBLCardMarket;
  const NOTES_KEY = 'dbl-home-notes:v1';
  const STORYLINES_KEY = 'dbl-storylines:v1';
  const SHORTCUTS_KEY = 'dbl-shortcuts:v1';
  const NOTES_MAX_LENGTH = 120000;
  function validateStorylines(value) {
    if (!window.DBLStorylines?.validateSnapshot)
      throw new Error('Storylines could not be validated for the backup.');
    return window.DBLStorylines.validateSnapshot(value);
  }
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
      // Flush unsaved typing before taking the backup snapshot; abort rather
      // than silently exporting an older copy of the notes.
      if (window.DBLHomeNotes?.save && !window.DBLHomeNotes.save())
        throw new Error('Notes could not be saved. Export cancelled to protect them.');
      const links = Object.fromEntries(Object.entries(KEYS).map(([name, key]) => [name, readMap(key, name)]));
      const notes = localStorage.getItem(NOTES_KEY) || '';
      if (notes.length > NOTES_MAX_LENGTH) throw new Error('Saved notes exceed the backup limit.');
      const storylines=validateStorylines(JSON.parse(localStorage.getItem(STORYLINES_KEY) ||
        '{"version":1,"items":[]}'));
      if (!market?.listPlayerMultipliers || !market?.mergePlayerMultipliers)
        throw Error('Player multipliers are unavailable. Export cancelled to avoid an incomplete backup.');
      const shortcuts = window.DBLShortcuts?.exportSnapshot?.();
      if (!shortcuts)
        throw Error('Shortcuts are unavailable. Export cancelled to avoid an incomplete backup.');
      const payload = { format: FORMAT, version: 6, exportedAt: new Date().toISOString(),
        links, notes, storylines, shortcuts,
        playerValueMultipliers:market.listPlayerMultipliers() };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'dbl-saved-links-' + new Date().toISOString().replace(/:/g, '-').replace(/\..*$/, '') + '.json';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      report('Exported saved links, Home notes, Storylines, Shortcuts, and player card value multipliers.');
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
      // Older v1/v2 backups have no notes field and must NEVER erase notes.
      if (Object.hasOwn(data, 'notes')) {
        if (typeof data.notes !== 'string' || data.notes.length > NOTES_MAX_LENGTH)
          throw new Error('The backup contains invalid Home notes.');
        incoming.notes = data.notes;
      }
      // v1-v3 backups predate Storylines. Omission MUST preserve any entries
      // the user already created on this device.
      if (Object.hasOwn(data, 'storylines'))
        incoming.storylines=validateStorylines(data.storylines);
      // Backups predating Shortcuts must preserve pins already on this device.
      if (Object.hasOwn(data, 'shortcuts')) {
        if (!window.DBLShortcuts?.validateSnapshot)
          throw Error('Shortcuts are unavailable for import.');
        incoming.shortcuts = window.DBLShortcuts.validateSnapshot(data.shortcuts);
      }
      // Field is optional on old exports. If present (even as null), validate
      // strictly before changing any of the other saved-link records.
      const hasMultipliers = Object.hasOwn(data, 'playerValueMultipliers');
      const importedMultipliers = hasMultipliers ? data.playerValueMultipliers : null;
      const multiplierPreview = hasMultipliers
        ? market.previewPlayerMultiplierMerge(importedMultipliers) : null;
      if (!Object.keys(incoming).length && !hasMultipliers)
        throw new Error('The backup does not contain supported saved data.');

      // An import changes only collections provided by the backup. Never
      // delete/reset the league file, or unrelated local app preferences.
      const previous = {};
      const updated = [];
      try {
        for (const [category, values] of Object.entries(incoming)) {
          const key = category === 'notes' ? NOTES_KEY :
            category === 'storylines' ? STORYLINES_KEY :
            category === 'shortcuts' ? SHORTCUTS_KEY : KEYS[category];
          previous[category] = localStorage.getItem(key);
          localStorage.setItem(key, category === 'notes' ? values : JSON.stringify(values));
          updated.push(category);
        }
        // Apply last, so a rejected multiplier write can roll back links,
        // notes and Storylines without changing any in-memory multiplier.
        if (hasMultipliers) {
          const merged = market.mergePlayerMultipliers(importedMultipliers);
          if (!merged.ok)
            throw Error(merged.error || 'Could not save imported player value multipliers.');
        }
      } catch (error) {
        for (const category of updated) {
          try {
            const key = category === 'notes' ? NOTES_KEY :
            category === 'storylines' ? STORYLINES_KEY :
            category === 'shortcuts' ? SHORTCUTS_KEY : KEYS[category];
            if (previous[category] === null) localStorage.removeItem(key);
            else localStorage.setItem(key, previous[category]);
          } catch (ignored) {
            console.warn('Could not roll back a failed saved-links import.', ignored);
          }
        }
        throw new Error(error?.message || 'Could not save imported links on this device.');
      }
      window.dispatchEvent(new CustomEvent('dbl:saved-links-imported', {
        detail: {
          banners: 'banners' in incoming,
          uniforms: 'uniforms' in incoming,
          headshotBackgrounds: 'headshotBackgrounds' in incoming,
          headshotBackgroundStatuses: 'headshotBackgroundStatuses' in incoming,
          notes: 'notes' in incoming,
          storylines: 'storylines' in incoming,
          shortcuts: 'shortcuts' in incoming,
          playerValueMultipliers: hasMultipliers,
        },
      }));
      report('Imported saved links: ' + Object.keys(incoming).join(', ') +
        (multiplierPreview ? (Object.keys(incoming).length ? '; ' : '') +
          'player value multipliers (' + multiplierPreview.added + ' added, ' +
          multiplierPreview.updated + ' updated)' : '') + '.');
    } catch (error) {
      report('Import failed: ' + (error?.message || 'Invalid file.'));
    }
  });
})();