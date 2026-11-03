(() => {
  const panel = document.getElementById('deadPlayersPanel');
  const wrap = document.getElementById('deadPlayersWrap');
  const classSelect = document.getElementById('deadPlayersYear');
  const sortSelect = document.getElementById('deadPlayersSort');
  const sortDirection = document.getElementById('deadPlayersDirection');
  const searchInput = document.getElementById('deadPlayersSearch');
  const summaryNode = document.getElementById('deadPlayersSummary');
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
    ['deathAge', 'Age at death', 0],
    ['diedYear', 'Year died', 0]
  ];
  const METRICS = Object.fromEntries(SORTS.map(([key, label, digits]) =>
    [key, { key, label, digits }]));
  const TABLE_KEYS = ['diedYear', 'deathAge', 'years', 'gp', 'pts', 'ppg',
    'trb', 'rpg', 'ast', 'apg', 'ws', 'ewa', 'vorp', 'per', 'ws48', 'bpm'];
  const COLUMN_LABELS = {
    diedYear: 'DIED', deathAge: 'AGE', years: 'YRS', gp: 'GP', pts: 'PTS',
    ppg: 'PPG', trb: 'REB', rpg: 'RPG', ast: 'AST', apg: 'APG',
    ws: 'WS', ewa: 'EWA', vorp: 'VORP', per: 'PER', ws48: 'WS/48',
    bpm: 'BPM', min: 'MIN', mpg: 'MPG', stl: 'STL', spg: 'SPG',
    blk: 'BLK', bpg: 'BPG', tp: '3PM', fgPct: 'FG%', tpPct: '3P%',
    ftPct: 'FT%', tov: 'TOV', championships: 'TITLES', mvps: 'MVP',
    allStars: 'AS'
  };
  let currentFile = null;
  let fileVersion = 0;
  let loadedFile = null;
  let inFlight = false;
  let deceased = [];
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
    wrap.replaceChildren(element('p', 'recent-deceased-message', message));
  }
  function getDiedYear(player) {
    // Same official death indicator used by the site's News obituary system.
    const year = integer(player?.diedYear);
    return year !== null && year > 0 ? year : null;
  }
  function playerSummary(player, diedYear) {
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
    const deathAge = born === null ? null : diedYear - born;
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
      diedYear, deathAge: deathAge !== null && deathAge >= 0 && deathAge < 120 ? deathAge : null,
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
    if (key === 'diedYear') return String(value);
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
    const filtered = deceased.filter(p =>
      (targetYear === 'all' || String(p.diedYear) === targetYear) &&
      (!search || p.name.toLocaleLowerCase().includes(search) ||
        String(p.diedYear).includes(search) || p.pos.toLowerCase().includes(search)));
    filtered.sort(comparePlayers);
    const count = filtered.length;
    const yearsLabel = classYears.length
      ? Math.min(...classYears) + '–' + Math.max(...classYears) : 'No death years';
    summaryNode.textContent = deceased.length.toLocaleString() +
      ' deceased players · ' + yearsLabel + ' · Showing ' + count.toLocaleString() +
      ' · Career regular-season statistics';
    if (!count) {
      showMessage('No deceased players match these filters.');
      return;
    }
    const displayed = ['diedYear', sortKey, ...TABLE_KEYS]
      .filter((key, index, keys) => keys.indexOf(key) === index);
    const container = element('div', 'recent-deceased-table-scroll');
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'Sortable statistics for deceased players');
    container.tabIndex = 0;
    const table = element('table', 'recent-deceased-table');
    const caption = element('caption', 'recent-deceased-visually-hidden',
      'Career statistics for every deceased player in this league export');
    table.appendChild(caption);
    const thead = element('thead'), header = element('tr');
    const fixedHeader = element('th', 'recent-deceased-rank-head', '#');
    fixedHeader.scope = 'col';
    header.appendChild(fixedHeader);
    const nameHeader = element('th', 'recent-deceased-player-head', 'Player');
    nameHeader.scope = 'col';
    header.appendChild(nameHeader);
    for (const key of displayed) {
      const th = element('th', key === sortKey ? 'recent-deceased-selected-column' : '');
      th.scope = 'col';
      th.setAttribute('aria-sort', key === sortKey ?
        (direction === 'desc' ? 'descending' : 'ascending') : 'none');
      const button = element('button', 'recent-deceased-sort-head',
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
      row.appendChild(element('td', 'recent-deceased-rank', index + 1));
      const nameCell = element('td', 'recent-deceased-player');
      const playerLink = player.pid !== null
        ? element('a', 'recent-deceased-player-link', player.name)
        : element('span', 'recent-deceased-player-link', player.name);
      if (player.pid !== null) {
        playerLink.href = EXPLORER + player.pid;
        playerLink.target = '_blank';
        playerLink.rel = 'noopener noreferrer';
        playerLink.title = 'Open player profile';
      }
      const identity = element('span', 'recent-deceased-identity');
      const playerContent = element('div', 'recent-deceased-player-content');
      identity.appendChild(playerLink);
      identity.appendChild(element('span', 'recent-deceased-player-detail',
        player.pos + (player.careerStart !== null ?
          ' · ' + player.careerStart + '–' + player.careerEnd : '') +
          (player.deathAge !== null ? ' · Died age ' + player.deathAge : '')));
      if (player.imgURL) {
        const image = element('img', 'recent-deceased-photo');
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
          'recent-deceased-number' + (key === sortKey ? ' recent-deceased-selected-column' : ''),
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
    const options = [new Option('All death years', 'all'),
      ...years.map(year => new Option(String(year), String(year)))];
    classSelect.replaceChildren(...options);
    classSelect.value = years.some(y => String(y) === prior) ? prior : 'all';
  }
  async function loadDeceased(file, version) {
    inFlight = true;
    showMessage('Reading deceased players and career statistics…');
    summaryNode.textContent = 'Loading deceased players from league file.';
    const isCurrent = () => currentFile === file && fileVersion === version;
    try {
      const candidates = new Map();
      const years = new Set();
      const collect = player => {
        if (!isCurrent()) return;
        const year = getDiedYear(player);
        if (year === null) return;
        // Include everyone with a death year, including players who died
        // while active, rather than applying the News page's obituary criteria.
        years.add(year);
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
      // Basketball GM's canonical players array includes living and deceased
      // players. Only seek nonstandard collections as a fallback, avoiding
      // three more full-file decompressions on large historical exports.
      if (!candidates.size) {
        for (const key of ['retiredPlayers', 'releasedPlayers', 'freeAgents']) {
          await stream.forEachTopLevelArrayItem(file, key, collect);
          if (!isCurrent()) return;
        }
      }
      if (!isCurrent()) return;
      deceased = Array.from(candidates.values());
      setClasses([...years].sort((a, b) => b - a));
      loadedFile = file;
      render();
      if (!deceased.length) {
        showMessage('No deceased players were found in this league export.');
        summaryNode.textContent = 'No death records found.';
      }
    } catch (error) {
      if (!isCurrent()) return;
      console.warn('Could not load deceased player records.', error);
      summaryNode.textContent = 'Deceased players unavailable.';
      showMessage('Could not read deceased player statistics from the league file. Try uploading it again.');
    } finally {
      if (isCurrent()) inFlight = false;
    }
  }
  function ensureLoaded() {
    const file = currentFile || hub.getCurrentFile?.();
    if (!file) {
      showMessage('Upload a league file to view deceased players.');
      summaryNode.textContent = '';
      return;
    }
    if (inFlight || loadedFile === file) return;
    void loadDeceased(file, fileVersion);
  }
  function acceptFile(file) {
    if (file === currentFile) return;
    currentFile = file || null;
    fileVersion++;
    loadedFile = null;
    inFlight = false;
    deceased = [];
    classYears = [];
    summaryNode.textContent = '';
    showMessage(file ? 'Open The Dead to load every deceased player.' :
      'Upload a league file to view deceased players.');
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
    if (event.detail?.panelId === 'deadPlayersPanel') ensureLoaded();
  });
  document.getElementById('deadPlayersTabBtn')?.addEventListener('click', () => {
    // The central tab router activates this panel in its microtask.
    window.queueMicrotask(ensureLoaded);
  });
  hub.subscribe(({ file }) => acceptFile(file));
  acceptFile(hub.getCurrentFile?.() || null);
  window.DBLDeadPlayers = Object.freeze({
    sortFields: SORTS.map(([key, label]) => ({ key, label }))
  });
})();