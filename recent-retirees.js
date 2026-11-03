(() => {
  const panel = document.getElementById('recentRetireesPanel');
  const wrap = document.getElementById('recentRetireesWrap');
  const classSelect = document.getElementById('recentRetireesClass');
  const sortSelect = document.getElementById('recentRetireesSort');
  const sortDirection = document.getElementById('recentRetireesDirection');
  const searchInput = document.getElementById('recentRetireesSearch');
  const summaryNode = document.getElementById('recentRetireesSummary');
  const hub = window.DBLLeagueFileHub;
  const stream = window.DBLLeagueStream;
  if (!panel || !wrap || !classSelect || !sortSelect || !sortDirection ||
      !searchInput || !summaryNode || !hub || !stream?.forEachTopLevelArrayItem) return;

  const EXPLORER = 'https://icamcmusic-ship-it.github.io/bbgm-league-explorer/#/player/';
  const SORTS = [
    ['ws', 'Win Shares (WS)', 2],
    ['ewa', 'Estimated Wins Added (EWA)', 2],
    ['vorp', 'Value over Replacement (VORP)', 2],
    ['ppg', 'Points per game (PPG)', 1],
    ['pts', 'Career points', 0],
    ['per', 'Player Efficiency Rating (PER)', 1],
    ['ws48', 'Win Shares per 48 (WS/48)', 3],
    ['bpm', 'Box Plus/Minus (BPM)', 1],
    ['gp', 'Games played', 0],
    ['years', 'Seasons played', 0],
    ['min', 'Career minutes', 0],
    ['mpg', 'Minutes per game', 1],
    ['trb', 'Career rebounds', 0],
    ['rpg', 'Rebounds per game', 1],
    ['ast', 'Career assists', 0],
    ['apg', 'Assists per game', 1],
    ['stl', 'Career steals', 0],
    ['spg', 'Steals per game', 1],
    ['blk', 'Career blocks', 0],
    ['bpg', 'Blocks per game', 1],
    ['tp', 'Career three-pointers', 0],
    ['fgPct', 'Field goal %', 1],
    ['tpPct', 'Three-point %', 1],
    ['ftPct', 'Free throw %', 1],
    ['tov', 'Career turnovers', 0],
    ['championships', 'Championships', 0],
    ['mvps', 'MVP awards', 0],
    ['allStars', 'All-Star selections', 0],
    ['age', 'Age at retirement', 0],
    ['retiredYear', 'Year retired', 0]
  ];
  const METRICS = Object.fromEntries(SORTS.map(([key, label, digits]) =>
    [key, { key, label, digits }]));
  const TABLE_KEYS = ['retiredYear', 'age', 'years', 'gp', 'pts', 'ppg',
    'trb', 'rpg', 'ast', 'apg', 'ws', 'ewa', 'vorp', 'per', 'ws48', 'bpm'];
  const COLUMN_LABELS = {
    retiredYear: 'Class', years: 'YRS', gp: 'GP', pts: 'PTS',
    ppg: 'PPG', trb: 'REB', rpg: 'RPG', ast: 'AST', apg: 'APG',
    ws: 'WS', ewa: 'EWA', vorp: 'VORP', per: 'PER', ws48: 'WS/48',
    bpm: 'BPM', min: 'MIN', mpg: 'MPG', stl: 'STL', spg: 'SPG',
    blk: 'BLK', bpg: 'BPG', tp: '3PM', fgPct: 'FG%', tpPct: '3P%',
    ftPct: 'FT%', tov: 'TOV', championships: 'TITLES', mvps: 'MVP',
    allStars: 'AS', age: 'AGE'
  };
  let currentFile = null;
  let fileVersion = 0;
  let loadedFile = null;
  let inFlight = false;
  let retirees = [];
  let classYears = [];
  let sortKey = 'ws';
  let direction = 'desc';

  const numeric = value => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const integer = value => {
    const valueNumber = numeric(value);
    return valueNumber !== null && Number.isInteger(valueNumber) ? valueNumber : null;
  };
  const sum = (rows, key) => rows.reduce((n, row) => {
    let value = numeric(row[key]);
    if (value === null && key === 'trb') {
      const a = numeric(row.orb), b = numeric(row.drb);
      if (a !== null || b !== null) value = (a || 0) + (b || 0);
    }
    if (value === null && key === 'ws') {
      const a = numeric(row.ows), b = numeric(row.dws);
      if (a !== null || b !== null) value = (a || 0) + (b || 0);
    }
    return n + (value ?? 0);
  }, 0);
  function weighted(rows, field) {
    let total = 0, minutes = 0;
    for (const row of rows) {
      const value = numeric(row[field]), min = numeric(row.min);
      if (value === null || min === null || min <= 0) continue;
      total += value * min;
      minutes += min;
    }
    return minutes ? total / minutes : null;
  }
  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = String(text);
    return el;
  }
  function showMessage(message) {
    wrap.replaceChildren(element('p', 'recent-retirees-message', message));
  }
  function getRetiredYear(player) {
    const year = integer(player?.retiredYear ?? player?.retired?.year);
    return year !== null && year > 0 ? year : null;
  }
  function playerSummary(player, retiredYear) {
    const stats = (Array.isArray(player.stats) ? player.stats : [])
      .filter(row => row && !row.playoffs && (numeric(row.gp) ?? 0) > 0);
    // Some exports contain a combined/TOT row in addition to the actual
    // team rows. Never count both versions of a traded player's season.
    const byYear = new Map();
    for (const row of stats) {
      const year = integer(row.season);
      if (year === null) continue;
      const bucket = byYear.get(year) || [];
      bucket.push(row);
      byYear.set(year, bucket);
    }
    const regular = [];
    for (const seasonRows of byYear.values()) {
      const realTeams = seasonRows.filter(row => (integer(row.tid) ?? -1) >= 0);
      regular.push(...(realTeams.length ? realTeams : seasonRows));
    }
    const gp = sum(regular, 'gp'), min = sum(regular, 'min');
    const pts = sum(regular, 'pts'), trb = sum(regular, 'trb');
    const ast = sum(regular, 'ast'), stl = sum(regular, 'stl');
    const blk = sum(regular, 'blk');
    const ws = sum(regular, 'ws');
    const positions = Array.isArray(player.ratings) ? player.ratings : [];
    const lastPos = [...positions].reverse().find(p => typeof p.pos === 'string' && p.pos)?.pos;
    const awardCounts = { championships: 0, mvps: 0, allStars: 0 };
    for (const award of Array.isArray(player.awards) ? player.awards : []) {
      if (award?.type === 'Won Championship') awardCounts.championships++;
      if (award?.type === 'Most Valuable Player') awardCounts.mvps++;
      if (award?.type === 'All-Star') awardCounts.allStars++;
    }
    const born = integer(player?.born?.year);
    const age = born === null ? null : retiredYear - born;
    const url = typeof player.imgURL === 'string' &&
      /^(https?:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i.test(player.imgURL)
        ? player.imgURL : '';
    const pid = integer(player.pid);
    return {
      pid,
      name: [player.firstName, player.lastName].filter(Boolean).join(' ') ||
        player.name || 'Unknown player',
      pos: lastPos || player.pos || '—',
      imgURL: url && url.length < 2000 ? url : '',
      retiredYear, age: age !== null && age > 0 && age < 90 ? age : null,
      years: byYear.size, careerStart: byYear.size ? Math.min(...byYear.keys()) : null,
      careerEnd: byYear.size ? Math.max(...byYear.keys()) : null,
      gp, min, pts, trb, ast, stl, blk, ws,
      ewa: sum(regular, 'ewa'),
      vorp: sum(regular, 'vorp'),
      tp: sum(regular, 'tp'),
      tov: sum(regular, 'tov'),
      ppg: gp > 0 ? pts / gp : null,
      mpg: gp > 0 ? min / gp : null,
      rpg: gp > 0 ? trb / gp : null,
      apg: gp > 0 ? ast / gp : null,
      spg: gp > 0 ? stl / gp : null,
      bpg: gp > 0 ? blk / gp : null,
      ws48: min > 0 ? ws * 48 / min : weighted(regular, 'ws48'),
      per: weighted(regular, 'per'),
      bpm: weighted(regular, 'bpm'),
      fgPct: sum(regular, 'fga') > 0 ? sum(regular, 'fg') * 100 / sum(regular, 'fga') : null,
      tpPct: sum(regular, 'tpa') > 0 ? sum(regular, 'tp') * 100 / sum(regular, 'tpa') : null,
      ftPct: sum(regular, 'fta') > 0 ? sum(regular, 'ft') * 100 / sum(regular, 'fta') : null,
      ...awardCounts
    };
  }
  function format(value, key) {
    if (!Number.isFinite(value)) return '—';
    // Calendar years are identifiers, not quantities: never format 1966 as 1,966.
    if (key === 'retiredYear') return String(value);
    const decimals = METRICS[key]?.digits ?? 0;
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals && ['ws', 'ewa', 'vorp', 'ws48'].includes(key) ? decimals : 0,
      maximumFractionDigits: decimals
    });
  }
  function comparePlayers(a, b) {
    if (sortKey === 'name') return a.name.localeCompare(b.name) * (direction === 'asc' ? 1 : -1);
    const aNumber = a[sortKey], bNumber = b[sortKey];
    // Missing advanced statistics always go at the bottom in both directions.
    if (!Number.isFinite(aNumber)) return Number.isFinite(bNumber) ? 1 : a.name.localeCompare(b.name);
    if (!Number.isFinite(bNumber)) return -1;
    const difference = direction === 'asc' ? aNumber - bNumber : bNumber - aNumber;
    return difference || b.ws - a.ws || a.name.localeCompare(b.name);
  }
  function setSort(key, toggle = false) {
    if (!METRICS[key]) return;
    if (toggle && sortKey === key) direction = direction === 'desc' ? 'asc' : 'desc';
    else if (sortKey !== key) {
      sortKey = key;
      direction = 'desc';
    }
    sortSelect.value = sortKey;
    sortDirection.textContent = direction === 'desc' ? 'High → Low' : 'Low → High';
    sortDirection.setAttribute('aria-label',
      (direction === 'desc' ? 'Descending' : 'Ascending') + ' by ' + METRICS[sortKey].label);
    render();
  }
  function render() {
    if (!loadedFile) return;
    const targetYear = classSelect.value;
    const search = searchInput.value.trim().toLocaleLowerCase();
    const filtered = retirees.filter(p =>
      (targetYear === 'all' || String(p.retiredYear) === targetYear) &&
      (!search || p.name.toLocaleLowerCase().includes(search) ||
        String(p.retiredYear).includes(search) || p.pos.toLowerCase().includes(search)));
    filtered.sort(comparePlayers);
    const count = filtered.length;
    const yearsLabel = classYears.join(', ');
    summaryNode.textContent = retirees.length.toLocaleString() + ' retirees across the ' +
      (classYears.length === 3 ? 'latest three classes' : classYears.length + ' available classes') +
      ' (' + yearsLabel + ') · Showing ' + count.toLocaleString() +
      ' · Career regular-season statistics';
    if (!count) {
      showMessage('No retirees match these filters.');
      return;
    }
    const displayed = ['retiredYear', sortKey, ...TABLE_KEYS]
      .filter((key, index, keys) => keys.indexOf(key) === index);
    const container = element('div', 'recent-retirees-table-scroll');
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'Sortable recent retirees statistics');
    container.tabIndex = 0;
    const table = element('table', 'recent-retirees-table');
    const caption = element('caption', 'recent-retirees-visually-hidden',
      'Career statistics of players in the latest three retirement classes');
    table.appendChild(caption);
    const thead = element('thead'), header = element('tr');
    const fixedHeader = element('th', 'recent-retirees-rank-head', '#');
    fixedHeader.scope = 'col';
    header.appendChild(fixedHeader);
    const nameHeader = element('th', 'recent-retirees-player-head', 'Player');
    nameHeader.scope = 'col';
    header.appendChild(nameHeader);
    for (const key of displayed) {
      const th = element('th', key === sortKey ? 'recent-retirees-selected-column' : '');
      th.scope = 'col';
      th.setAttribute('aria-sort', key === sortKey ?
        (direction === 'desc' ? 'descending' : 'ascending') : 'none');
      const button = element('button', 'recent-retirees-sort-head',
        (COLUMN_LABELS[key] || key) + (key === sortKey ? (direction === 'desc' ? ' ↓' : ' ↑') : ''));
      button.type = 'button';
      button.title = 'Sort by ' + METRICS[key].label;
      button.addEventListener('click', () => setSort(key, true));
      th.appendChild(button);
      header.appendChild(th);
    }
    thead.appendChild(header);
    table.appendChild(thead);
    const tbody = element('tbody');
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < filtered.length; index++) {
      const player = filtered[index];
      const row = element('tr');
      row.appendChild(element('td', 'recent-retirees-rank', index + 1));
      const nameCell = element('td', 'recent-retirees-player');
      const playerLink = player.pid !== null
        ? element('a', 'recent-retirees-player-link', player.name)
        : element('span', 'recent-retirees-player-link', player.name);
      if (player.pid !== null) {
        playerLink.href = EXPLORER + player.pid;
        playerLink.target = '_blank';
        playerLink.rel = 'noopener noreferrer';
        playerLink.title = 'Open player profile';
      }
      const identity = element('span', 'recent-retirees-identity');
      const playerContent = element('div', 'recent-retirees-player-content');
      identity.appendChild(playerLink);
      identity.appendChild(element('span', 'recent-retirees-player-detail',
        player.pos + (player.careerStart !== null ?
          ' · ' + player.careerStart + '–' + player.careerEnd : '') +
          (player.age !== null ? ' · Retired age ' + player.age : '')));
      if (player.imgURL) {
        const image = element('img', 'recent-retirees-photo');
        image.src = player.imgURL;
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => image.remove());
        playerContent.appendChild(image);
      }
      playerContent.appendChild(identity);
      nameCell.appendChild(playerContent);
      row.appendChild(nameCell);
      for (const key of displayed) {
        row.appendChild(element('td',
          'recent-retirees-number' + (key === sortKey ? ' recent-retirees-selected-column' : ''),
          format(player[key], key)));
      }
      fragment.appendChild(row);
    }
    tbody.appendChild(fragment);
    table.appendChild(tbody);
    container.appendChild(table);
    wrap.replaceChildren(container);
  }
  function setClasses(years) {
    classYears = years;
    const prior = classSelect.value;
    const options = [new Option('All three classes', 'all'),
      ...years.map(year => new Option(String(year) + ' retiring class', String(year)))];
    classSelect.replaceChildren(...options);
    classSelect.value = years.some(y => String(y) === prior) ? prior : 'all';
  }
  async function loadRetirees(file, version) {
    inFlight = true;
    showMessage('Reading retirement classes and career statistics…');
    summaryNode.textContent = 'Loading recent retirement classes from league file.';
    const isCurrent = () => currentFile === file && fileVersion === version;
    try {
      const candidates = new Map();
      const years = new Set();
      const collect = player => {
        if (!isCurrent()) return;
        const year = getRetiredYear(player);
        if (year === null) return;
        const tid = integer(player.tid);
        // An active player should not appear in the retirement listing.
        if (tid !== null && tid >= 0) return;
        if (!years.has(year)) {
          years.add(year);
          if (years.size > 3) {
            const oldest = Math.min(...years);
            years.delete(oldest);
            for (const [key, candidate] of candidates) {
              if (candidate.retiredYear === oldest) candidates.delete(key);
            }
          }
        }
        if (!years.has(year)) return;
        const pid = integer(player.pid);
        const key = pid === null
          ? [player.firstName, player.lastName, player.born?.year].join('|')
          : String(pid);
        const incoming = playerSummary(player, year);
        const existing = candidates.get(key);
        if (!existing || incoming.gp > existing.gp ||
            (incoming.gp === existing.gp && incoming.pts > existing.pts)) {
          candidates.set(key, incoming);
        }
      };
      await stream.forEachTopLevelArrayItem(file, 'players', collect);
      if (!isCurrent()) return;
      // Older/custom exports may place retired players in a separate array.
      // Avoid additional large-file decompressions when the standard players
      // collection already contains the retirement classes.
      if (!candidates.size) {
        for (const key of ['retiredPlayers', 'releasedPlayers', 'freeAgents']) {
          await stream.forEachTopLevelArrayItem(file, key, collect);
          if (!isCurrent()) return;
          if (candidates.size) break;
        }
      }
      if (!isCurrent()) return;
      retirees = Array.from(candidates.values());
      setClasses([...years].sort((a, b) => b - a));
      loadedFile = file;
      render();
      if (!retirees.length) {
        showMessage('No retirement years were found in this league export.');
        summaryNode.textContent = 'No retirement classes found.';
      }
    } catch (error) {
      if (!isCurrent()) return;
      console.warn('Could not load recent retirement classes.', error);
      summaryNode.textContent = 'Recent retirees unavailable.';
      showMessage('Could not read retired player statistics from the league file. Try uploading it again.');
    } finally {
      if (isCurrent()) inFlight = false;
    }
  }
  function ensureLoaded() {
    const file = currentFile || hub.getCurrentFile?.();
    if (!file) {
      showMessage('Upload a league file to view recent retirees.');
      summaryNode.textContent = '';
      return;
    }
    if (inFlight || loadedFile === file) return;
    void loadRetirees(file, fileVersion);
  }
  function acceptFile(file) {
    if (file === currentFile) return;
    currentFile = file || null;
    fileVersion++;
    loadedFile = null;
    inFlight = false;
    retirees = [];
    classYears = [];
    summaryNode.textContent = '';
    showMessage(file ? 'Open Recent Retirees to load the latest three retirement classes.' :
      'Upload a league file to view recent retirees.');
    if (!panel.hidden && file) ensureLoaded();
  }
  for (const [key, label] of SORTS) {
    const option = element('option', '', label);
    option.value = key;
    sortSelect.appendChild(option);
  }
  sortSelect.value = sortKey;
  classSelect.addEventListener('change', render);
  searchInput.addEventListener('input', render);
  sortSelect.addEventListener('change', () => setSort(sortSelect.value));
  sortDirection.addEventListener('click', () => {
    direction = direction === 'desc' ? 'asc' : 'desc';
    setSort(sortKey);
  });
  window.addEventListener('dbl:tab-change', event => {
    if (event.detail?.panelId === 'recentRetireesPanel') ensureLoaded();
  });
  document.getElementById('recentRetireesTabBtn')?.addEventListener('click', () => {
    // The central tab router activates this panel in its microtask.
    window.queueMicrotask(ensureLoaded);
  });
  hub.subscribe(({ file }) => acceptFile(file));
  acceptFile(hub.getCurrentFile?.() || null);
  window.DBLRecentRetirees = Object.freeze({
    sortFields: SORTS.map(([key, label]) => ({ key, label }))
  });
})();