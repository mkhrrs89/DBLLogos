(() => {
  const stream = window.DBLLeagueStream;
  const tabBtn = document.getElementById('draftProspectsTabBtn');
  const panel = document.getElementById('draftProspectsPanel');
  const wrap = document.getElementById('draftProspectsWrap');
  const fileInput = document.getElementById('leagueFile');
  const clearBtn = document.getElementById('clearLeagueFileBtn');
  const statusMessage = document.getElementById('statusMessage');

  if (!stream || !tabBtn || !panel || !wrap || !fileInput) return;

  const WATCH_LABELS = new Map([
    [1, 'Red'],
    [2, 'Green'],
    [3, 'Blue'],
    [4, 'Yellow'],
    [5, 'Purple'],
    [6, 'Pink'],
    [7, 'Aqua'],
    [8, 'Orange'],
  ]);

  const COLUMNS = [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'draftYear', label: 'Draft Class', type: 'number' },
    { key: 'watch', label: 'Watch List', type: 'number' },
    { key: 'position', label: 'Position', type: 'text' },
    { key: 'age', label: 'Age', type: 'number' },
    { key: 'rating', label: 'Rating', type: 'number' },
    { key: 'potential', label: 'Potential', type: 'number' },
  ];

  let pendingFile = null;
  let fileVersion = 0;
  let loadedVersion = -1;
  let loadingVersion = -1;
  let prospects = [];
  let sortKey = 'draftYear';
  let sortDirection = 'asc';

  tabBtn.addEventListener('click', () => {
    activateTab();
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

  fileInput.addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    pendingFile = file || null;
    fileVersion += 1;
    loadedVersion = -1;
    loadingVersion = -1;
    prospects = [];

    if (!panel.hidden && pendingFile) {
      buildProspects();
    } else if (!pendingFile) {
      renderEmpty('Load or re-upload a league file to show draft prospects.');
    }
  });

  clearBtn?.addEventListener('click', () => {
    pendingFile = null;
    fileVersion += 1;
    loadedVersion = -1;
    loadingVersion = -1;
    prospects = [];
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

    const file = pendingFile || fileInput.files?.[0] || window.__dblLargeLeagueFile || null;
    if (!file) {
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

  function render() {
    wrap.className = 'draft-prospects-wrap';
    wrap.replaceChildren();

    const sorted = [...prospects].sort(compareProspects);

    const count = document.createElement('p');
    count.className = 'draft-prospects-count';
    const years = prospects.map((prospect) => prospect.draftYear).filter(Number.isFinite);
    const minYear = years.length ? Math.min(...years) : null;
    const maxYear = years.length ? Math.max(...years) : null;
    count.textContent = `${prospects.length.toLocaleString()} prospect${prospects.length === 1 ? '' : 's'}${minYear !== null && maxYear !== null ? ` • Draft classes ${minYear}–${maxYear}` : ''}`;
    wrap.append(count);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'draft-prospects-table-wrap';

    const table = document.createElement('table');
    table.className = 'draft-prospects-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');

    COLUMNS.forEach((column) => {
      const th = document.createElement('th');
      if (column.key === 'age' || column.key === 'rating' || column.key === 'potential') {
        th.className = 'draft-prospect-number';
      }

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
    sorted.forEach((prospect) => {
      const row = document.createElement('tr');

      row.append(
        makeCell(prospect.name, 'draft-prospect-name'),
        makeCell(formatValue(prospect.draftYear)),
        makeWatchCell(prospect.watch),
        makeCell(prospect.position),
        makeCell(formatValue(prospect.age), 'draft-prospect-number'),
        makeCell(formatValue(prospect.rating), 'draft-prospect-number'),
        makeCell(formatValue(prospect.potential), 'draft-prospect-number'),
      );

      tbody.append(row);
    });

    table.append(tbody);
    tableWrap.append(table);
    wrap.append(tableWrap);
  }

  function makeCell(text, className = '') {
    const td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
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

    if (result === 0) {
      const yearA = Number.isFinite(a.draftYear) ? a.draftYear : Infinity;
      const yearB = Number.isFinite(b.draftYear) ? b.draftYear : Infinity;
      result = yearA - yearB;
    }
    if (result === 0) {
      result = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    }

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
