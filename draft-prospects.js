(() => {
  const stream = window.DBLLeagueStream;
  const tabBtn = document.getElementById('draftProspectsTabBtn');
  const panel = document.getElementById('draftProspectsPanel');
  const wrap = document.getElementById('draftProspectsWrap');
  const searchInput = document.getElementById('draftProspectsSearch');
  const duplicateNamesBtn = document.getElementById('draftProspectsDuplicateNamesBtn');
  const hideLowPotentialBtn = document.getElementById('draftProspectsHideLowPotentialBtn');
  const fileInput = document.getElementById('leagueFile');
  const fileHub = window.DBLLeagueFileHub;
  const clearBtn = document.getElementById('clearLeagueFileBtn');
  const statusMessage = document.getElementById('statusMessage');

  if (!stream || !tabBtn || !panel || !wrap || !searchInput || !fileInput) return;

  const DB_NAME = 'dbl-logo-draft-prospects-cache';
  const DB_VERSION = 1;
  const STORE_NAME = 'tables';
  const CACHE_KEY = 'latest';

  const WATCH_LABELS = new Map([
    [1, 'Red'],
    [2, 'Green'],
    [3, 'Family'],
    [4, 'Yellow'],
    [5, 'Purple'],
    [6, 'Hoopland'],
    [7, 'K&P / Street'],
    [8, 'Presidents'],
  ]);

  const COLUMNS = [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'draftYear', label: 'Class', type: 'number' },
    { key: 'potential', label: 'Pot', type: 'number' },
    { key: 'watch', label: 'Watch List', type: 'number' },
    { key: 'position', label: 'Pos', type: 'text' },
    { key: 'age', label: 'Age', type: 'number' },
    { key: 'rating', label: 'Rating', type: 'number' },
  ];

  let pendingFile = null;
  let fileVersion = 0;
  let loadedVersion = -1;
  let loadingVersion = -1;
  let prospects = [];
  let sortKey = 'draftYear';
  let sortDirection = 'asc';
  let filterDraftYear = null;
  let duplicateNamesOnly = false;
  let hideBelow65Potential = false;
  let dbPromise = null;

  const restorePromise = restoreSavedProspects();

  searchInput.addEventListener('input', () => {
    if (prospects.length) render();
  });

  searchInput.addEventListener('search', () => {
    if (prospects.length) render();
  });

  duplicateNamesBtn?.addEventListener('click', () => {
    duplicateNamesOnly = !duplicateNamesOnly;
    render();
    saveProspects(pendingFile || fileHub?.getCurrentFile?.() || fileInput.files?.[0] || null);
  });

  hideLowPotentialBtn?.addEventListener('click', () => {
    hideBelow65Potential = !hideBelow65Potential;
    updateHideLowPotentialButton();
    render();
    saveProspects(pendingFile || fileHub?.getCurrentFile?.() || fileInput.files?.[0] || null);
  });

  tabBtn.addEventListener('click', async () => {
    activateTab();
    await restorePromise;
    if (prospects.length && loadedVersion === fileVersion) {
      render();
    } else {
      buildProspects();
    }
  });

  document.querySelectorAll('.tab-btn').forEach((button) => {
    if (button === tabBtn) return;
    button.addEventListener('click', () => {
      panel.hidden = true;
      tabBtn.classList.remove('active');
      tabBtn.setAttribute('aria-selected', 'false');
    });
  });

  const acceptLeagueFile = async (file) => {
    if (!file || pendingFile === file) return;
    pendingFile = file;
    fileVersion += 1;
    loadedVersion = -1;
    loadingVersion = -1;
    prospects = [];
    filterDraftYear = null;
    duplicateNamesOnly = false;
    hideBelow65Potential = false;
    searchInput.value = '';
    updateDuplicateNamesButton();
    updateHideLowPotentialButton();

    await clearSavedProspects();

    if (!panel.hidden) {
      buildProspects();
    }
  };

  if (fileHub) {
    fileHub.subscribe(({ file }) => {
      void acceptLeagueFile(file);
    });
  } else {
    fileInput.addEventListener('change', (event) => {
      const [file] = event.target.files || [];
      void acceptLeagueFile(file);
    });
  }

  clearBtn?.addEventListener('click', async () => {
    pendingFile = null;
    fileVersion += 1;
    loadedVersion = -1;
    loadingVersion = -1;
    prospects = [];
    filterDraftYear = null;
    duplicateNamesOnly = false;
    hideBelow65Potential = false;
    searchInput.value = '';
    updateDuplicateNamesButton();
    updateHideLowPotentialButton();
    await clearSavedProspects();
    renderEmpty('Load or re-upload a league file to show draft prospects.');
  });

  function activateTab() {
    document.querySelectorAll('.page > .panel[id]').forEach((section) => {
      section.hidden = section !== panel;
    });
    document.querySelectorAll('.tab-btn').forEach((button) => {
      const active = button === tabBtn;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panel.hidden = false;
  }

  async function buildProspects() {
    const version = fileVersion;
    if (loadingVersion === version) return;

    const file = pendingFile
      || fileHub?.getCurrentFile?.()
      || fileInput.files?.[0]
      || window.__dblLargeLeagueFile
      || null;
    if (!file) {
      if (prospects.length && loadedVersion === fileVersion) {
        render();
        return;
      }
      renderEmpty('Load or re-upload a league file to show draft prospects.');
      return;
    }

    loadingVersion = version;
    renderEmpty('Reading draft prospects…', true);

    try {
      await waitForMainLoad();
      if (version !== fileVersion) return;

      const gameAttributes = await stream.readTopLevelValue(file, 'gameAttributes');
      const currentSeason = finiteNumber(unwrapGameAttributeValue(gameAttributes?.season));
      if (version !== fileVersion) return;

      const next = [];
      await stream.forEachTopLevelArrayItem(file, 'players', (player) => {
        if (version !== fileVersion) return;
        if (Number(player?.tid) !== -2) return;

        const ratings = getLatestRatings(player);
        const draftYear = finiteNumber(player?.draft?.year);
        const watch = finiteNumber(player?.watch) ?? 0;
        const bornYear = finiteNumber(player?.born?.year);
        const explicitAge = finiteNumber(player?.age);
        const age = currentSeason !== null && bornYear !== null
          ? currentSeason - bornYear
          : explicitAge;

        next.push({
          pid: finiteNumber(player?.pid),
          name: getPlayerName(player),
          draftYear,
          watch,
          position: cleanText(ratings?.pos ?? player?.pos) || '—',
          age,
          rating: finiteNumber(ratings?.ovr),
          potential: finiteNumber(ratings?.pot),
        });
      });

      if (version !== fileVersion) return;

      prospects = next;
      loadedVersion = version;
      loadingVersion = -1;

      if (!prospects.length) {
        renderEmpty('No draft prospects were found in this league file.');
        return;
      }

      await saveProspects(file);
      render();
    } catch (error) {
      if (version !== fileVersion) return;
      loadingVersion = -1;
      console.error('Could not build Draft Prospects.', error);
      renderEmpty('Could not build Draft Prospects from this league file.');
    }
  }

  async function waitForMainLoad() {
    while (/^Loading\b/i.test(statusMessage?.textContent?.trim() || '')) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  }

  function unwrapGameAttributeValue(value) {
    if (!Array.isArray(value) || !value.length) return value;
    const latest = value[value.length - 1];
    if (latest && typeof latest === 'object' && Object.prototype.hasOwnProperty.call(latest, 'value')) {
      return latest.value;
    }
    return value;
  }

  function getLatestRatings(player) {
    const rows = Array.isArray(player?.ratings) ? player.ratings : [];
    let best = null;
    let bestSeason = -Infinity;
    let bestIndex = -1;

    rows.forEach((row, index) => {
      if (!row || typeof row !== 'object') return;
      const season = finiteNumber(row.season);
      const comparableSeason = season ?? -Infinity;
      if (!best || comparableSeason > bestSeason || (comparableSeason === bestSeason && index > bestIndex)) {
        best = row;
        bestSeason = comparableSeason;
        bestIndex = index;
      }
    });

    return best;
  }

  function getPlayerName(player) {
    const combined = `${cleanText(player?.firstName)} ${cleanText(player?.lastName)}`.trim();
    if (combined) return combined;
    const explicit = cleanText(player?.name);
    if (explicit) return explicit;
    const pid = finiteNumber(player?.pid);
    return pid === null ? 'Unknown player' : `Player ${pid}`;
  }

  function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  async function saveProspects(file) {
    if (!prospects.length) return;

    const payload = {
      key: CACHE_KEY,
      savedAt: new Date().toISOString(),
      fileName: file?.name || loadSavedTimelineFileName() || '',
      sortKey,
      sortDirection,
      filterDraftYear,
      duplicateNamesOnly,
      hideBelow65Potential,
      prospects,
    };

    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(payload);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Could not save Draft Prospects.'));
        tx.onabort = () => reject(tx.error || new Error('Could not save Draft Prospects.'));
      });
    } catch (error) {
      console.warn('Could not save Draft Prospects in IndexedDB.', error);
    }
  }

  async function restoreSavedProspects() {
    try {
      const db = await openDatabase();
      const saved = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(CACHE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Could not restore Draft Prospects.'));
      });

      if (!saved || !Array.isArray(saved.prospects) || !saved.prospects.length) return false;

      prospects = saved.prospects;
      if (COLUMNS.some((column) => column.key === saved.sortKey)) {
        sortKey = saved.sortKey;
      }
      if (saved.sortDirection === 'asc' || saved.sortDirection === 'desc') {
        sortDirection = saved.sortDirection;
      }

      const savedFilter = finiteNumber(saved.filterDraftYear);
      filterDraftYear = savedFilter !== null && prospects.some((prospect) => prospect.draftYear === savedFilter)
        ? savedFilter
        : null;
      duplicateNamesOnly = saved.duplicateNamesOnly === true;
      hideBelow65Potential = saved.hideBelow65Potential === true;

      loadedVersion = fileVersion;

      if (!panel.hidden) render();
      return true;
    } catch (error) {
      console.warn('Could not restore saved Draft Prospects from IndexedDB.', error);
      return false;
    }
  }

  async function clearSavedProspects() {
    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(CACHE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Could not clear Draft Prospects.'));
        tx.onabort = () => reject(tx.error || new Error('Could not clear Draft Prospects.'));
      });
    } catch (error) {
      console.warn('Could not clear saved Draft Prospects from IndexedDB.', error);
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
      request.onerror = () => reject(request.error || new Error('Could not open the Draft Prospects cache.'));
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

  function render() {
    wrap.className = 'draft-prospects-wrap';
    wrap.replaceChildren();

    const duplicateNameSet = getExactDuplicateNameSet(prospects);
    updateDuplicateNamesButton(duplicateNameSet);
    updateHideLowPotentialButton();

    const classFilteredProspects = filterDraftYear === null
      ? prospects
      : prospects.filter((prospect) => prospect.draftYear === filterDraftYear);
    const duplicateFilteredProspects = duplicateNamesOnly
      ? classFilteredProspects.filter((prospect) => duplicateNameSet.has(String(prospect.name || '')))
      : classFilteredProspects;
    const potentialFilteredProspects = hideBelow65Potential
      ? duplicateFilteredProspects.filter((prospect) => (
        !Number.isFinite(prospect.potential) || prospect.potential >= 65
      ))
      : duplicateFilteredProspects;
    const nameQuery = searchInput.value.trim().toLocaleLowerCase();
    const filteredProspects = nameQuery
      ? potentialFilteredProspects.filter((prospect) => String(prospect.name || '').toLocaleLowerCase().includes(nameQuery))
      : potentialFilteredProspects;
    const sorted = [...filteredProspects].sort(compareProspects);

    const summary = document.createElement('div');
    summary.className = 'draft-prospects-summary';

    const count = document.createElement('p');
    count.className = 'draft-prospects-count';
    const years = prospects.map((prospect) => prospect.draftYear).filter(Number.isFinite);
    const minYear = years.length ? Math.min(...years) : null;
    const maxYear = years.length ? Math.max(...years) : null;

    if (filterDraftYear !== null || duplicateNamesOnly || hideBelow65Potential || nameQuery) {
      const details = [
        `${filteredProspects.length.toLocaleString()} prospect${filteredProspects.length === 1 ? '' : 's'}`,
      ];
      if (filterDraftYear !== null) details.push(`Class ${filterDraftYear}`);
      if (duplicateNamesOnly) details.push('duplicate names only');
      if (hideBelow65Potential) details.push('Pot 65+ only');
      if (nameQuery) details.push(`matching “${searchInput.value.trim()}”`);
      details.push(`${prospects.length.toLocaleString()} total`);
      count.textContent = details.join(' • ');

      summary.append(count);
      if (filterDraftYear !== null) {
        const clearFilter = document.createElement('button');
        clearFilter.type = 'button';
        clearFilter.className = 'draft-prospects-clear-filter';
        clearFilter.textContent = 'Clear class filter';
        clearFilter.addEventListener('click', () => setDraftYearFilter(null));
        summary.append(clearFilter);
      }
    } else {
      count.textContent = `${prospects.length.toLocaleString()} prospect${prospects.length === 1 ? '' : 's'}${minYear !== null && maxYear !== null ? ` • Draft classes ${minYear}–${maxYear}` : ''}`;
      summary.append(count);
    }

    wrap.append(summary);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'draft-prospects-table-wrap';

    const table = document.createElement('table');
    table.className = 'draft-prospects-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');

    COLUMNS.forEach((column) => {
      const th = document.createElement('th');

      const button = document.createElement('button');
      button.type = 'button';
      button.className = `draft-prospects-sort${sortKey === column.key ? ' is-active' : ''}`;
      button.dataset.sortKey = column.key;
      button.setAttribute('aria-label', `Sort by ${column.label}`);

      const label = document.createElement('span');
      label.textContent = column.label;

      const indicator = document.createElement('span');
      indicator.className = 'draft-prospects-sort-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      indicator.textContent = sortKey === column.key ? (sortDirection === 'asc' ? '▲' : '▼') : '';

      button.append(label, indicator);
      button.addEventListener('click', () => setSort(column.key));
      th.append(button);
      headRow.append(th);
    });

    thead.append(headRow);
    table.append(thead);

    const tbody = document.createElement('tbody');
    if (!sorted.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = COLUMNS.length;
      cell.className = 'draft-prospects-no-results';
      cell.textContent = filterDraftYear !== null || duplicateNamesOnly || hideBelow65Potential || nameQuery
        ? 'No prospects match the active filters.'
        : 'No draft prospects were found.';
      row.append(cell);
      tbody.append(row);
    } else {
      sorted.forEach((prospect) => {
        const row = document.createElement('tr');

        row.append(
          makeCell(prospect.name, 'draft-prospect-name'),
          makeDraftYearCell(prospect.draftYear),
          makeCell(formatValue(prospect.potential), 'draft-prospect-number'),
          makeWatchCell(prospect.watch),
          makeCell(prospect.position),
          makeCell(formatValue(prospect.age), 'draft-prospect-number'),
          makeCell(formatValue(prospect.rating), 'draft-prospect-number'),
        );

        tbody.append(row);
      });
    }

    table.append(tbody);
    tableWrap.append(table);
    wrap.append(tableWrap);
  }

  function getExactDuplicateNameSet(rows) {
    const counts = new Map();

    for (const prospect of Array.isArray(rows) ? rows : []) {
      const name = String(prospect?.name || '');
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }

    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([name]) => name),
    );
  }

  function updateDuplicateNamesButton(duplicateNameSet = getExactDuplicateNameSet(prospects)) {
    if (!duplicateNamesBtn) return;

    const duplicateProspectCount = prospects.reduce(
      (total, prospect) => total + (duplicateNameSet.has(String(prospect?.name || '')) ? 1 : 0),
      0,
    );

    duplicateNamesBtn.textContent = duplicateProspectCount
      ? `Duplicate names (${duplicateProspectCount.toLocaleString()})`
      : 'Duplicate names';
    duplicateNamesBtn.classList.toggle('is-active', duplicateNamesOnly);
    duplicateNamesBtn.setAttribute('aria-pressed', duplicateNamesOnly ? 'true' : 'false');
    duplicateNamesBtn.disabled = prospects.length > 0 && duplicateProspectCount === 0;

    if (duplicateProspectCount === 0 && duplicateNamesOnly) {
      duplicateNamesOnly = false;
      duplicateNamesBtn.classList.remove('is-active');
      duplicateNamesBtn.setAttribute('aria-pressed', 'false');
    }
  }

  function updateHideLowPotentialButton() {
    if (!hideLowPotentialBtn) return;

    hideLowPotentialBtn.classList.toggle('is-active', hideBelow65Potential);
    hideLowPotentialBtn.setAttribute('aria-pressed', hideBelow65Potential ? 'true' : 'false');
    hideLowPotentialBtn.textContent = 'Hide Pot <65';
  }

  function makeCell(text, className = '') {
    const td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }

  function makeDraftYearCell(year) {
    const td = document.createElement('td');
    if (!Number.isFinite(year)) {
      td.textContent = '—';
      return td;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `draft-class-filter-button${filterDraftYear === year ? ' is-active' : ''}`;
    button.textContent = String(year);
    button.setAttribute('aria-pressed', filterDraftYear === year ? 'true' : 'false');
    button.setAttribute(
      'aria-label',
      filterDraftYear === year ? `Clear draft class ${year} filter` : `Show only draft class ${year}`,
    );
    button.addEventListener('click', () => setDraftYearFilter(year));
    td.append(button);
    return td;
  }

  function makeWatchCell(watch) {
    const td = document.createElement('td');
    if (!watch) {
      td.textContent = '—';
      return td;
    }

    const chip = document.createElement('span');
    chip.className = `draft-watch ${WATCH_LABELS.has(watch) ? `watch-${watch}` : 'watch-other'}`;

    const dot = document.createElement('span');
    dot.className = 'draft-watch-dot';
    dot.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.textContent = WATCH_LABELS.get(watch) || `Color ${watch}`;

    chip.append(dot, label);
    td.append(chip);
    return td;
  }

  function formatValue(value) {
    return Number.isFinite(value) ? String(value) : '—';
  }

  function setSort(key) {
    if (sortKey === key) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDirection = key === 'rating' || key === 'potential' ? 'desc' : 'asc';
    }
    render();
    saveProspects(pendingFile || fileInput.files?.[0] || null);
  }

  function setDraftYearFilter(year) {
    const nextYear = finiteNumber(year);
    filterDraftYear = nextYear !== null && filterDraftYear !== nextYear ? nextYear : null;
    render();
    saveProspects(pendingFile || fileInput.files?.[0] || null);
  }

  function compareProspects(a, b) {
    const column = COLUMNS.find((candidate) => candidate.key === sortKey) || COLUMNS[1];
    const direction = sortDirection === 'asc' ? 1 : -1;
    const aValue = a[column.key];
    const bValue = b[column.key];

    const aMissing = column.type === 'number' ? !Number.isFinite(aValue) : !String(aValue || '').trim();
    const bMissing = column.type === 'number' ? !Number.isFinite(bValue) : !String(bValue || '').trim();
    if (aMissing !== bMissing) return aMissing ? 1 : -1;

    let result = 0;
    if (!aMissing && !bMissing) {
      if (column.type === 'number') {
        result = aValue - bValue;
      } else {
        result = String(aValue).localeCompare(String(bValue), undefined, { sensitivity: 'base', numeric: true });
      }
    }

    if (result !== 0) return result * direction;

    if (sortKey === 'watch') {
      const aPotential = Number.isFinite(a.potential) ? a.potential : null;
      const bPotential = Number.isFinite(b.potential) ? b.potential : null;
      const aPotentialMissing = aPotential === null;
      const bPotentialMissing = bPotential === null;

      if (aPotentialMissing !== bPotentialMissing) return aPotentialMissing ? 1 : -1;
      if (!aPotentialMissing && !bPotentialMissing) {
        const potentialResult = bPotential - aPotential;
        if (potentialResult !== 0) return potentialResult;
      }
    }

    const yearA = Number.isFinite(a.draftYear) ? a.draftYear : Infinity;
    const yearB = Number.isFinite(b.draftYear) ? b.draftYear : Infinity;
    result = yearA - yearB;
    if (result !== 0) return result * direction;

    result = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    return result * direction;
  }

  function renderEmpty(message, loading = false) {
    wrap.className = 'draft-prospects-wrap empty-state';
    wrap.replaceChildren();
    const copy = document.createElement('div');
    copy.className = 'empty-copy';
    const p = document.createElement('p');
    p.textContent = message;
    if (loading) p.setAttribute('aria-live', 'polite');
    copy.append(p);
    wrap.append(copy);
  }
})();