(() => {
  const CACHE_KEY = 'dbl-logo-shootout-records:v2';

  const tabBtn = document.getElementById('shootoutRecordsTabBtn');
  const panel = document.getElementById('shootoutRecordsPanel');
  const wrap = document.getElementById('shootoutRecordsWrap');
  const sortSelect = document.getElementById('shootoutRecordsSort');
  const fileInput = document.getElementById('leagueFile');
  const clearBtn = document.getElementById('clearLeagueFileBtn');
  const statusMessage = document.getElementById('statusMessage');
  const fileHub = window.DBLLeagueFileHub;
  const stream = window.DBLLeagueStream;

  if (!tabBtn || !panel || !wrap || !stream) return;

  let activeFile = null;
  let fileVersion = 0;
  let loadedVersion = -1;
  let loadingVersion = -1;
  let records = [];
  let shootoutCount = 0;
  let coverageStart = null;
  let coverageEnd = null;
  let detailedGameStart = null;
  let cachedPayload = loadCache();
  let sortKey = sortSelect?.value || 'wins';
  let sortDirection = 'desc';

  sortSelect?.addEventListener('change', () => {
    sortKey = sortSelect.value;
    sortDirection = sortKey === 'name' ? 'asc' : 'desc';
    render();
  });

  tabBtn.addEventListener('click', () => {
    void ensureLoaded();
  });

  window.addEventListener('dbl:tab-change', (event) => {
    if (event.detail?.panelId !== 'shootoutRecordsPanel') return;
    void ensureLoaded();
  });

  const acceptLeagueFile = (file) => {
    if (!file || activeFile === file) return;

    activeFile = file;
    fileVersion += 1;
    loadedVersion = -1;
    loadingVersion = -1;
    records = [];
    shootoutCount = 0;
    coverageStart = null;
    coverageEnd = null;
    detailedGameStart = null;

    const signature = fileSignature(file);
    if (cachedPayload?.signature === signature) {
      records = normalizeCachedRecords(cachedPayload.records);
      shootoutCount = Number(cachedPayload.shootoutCount) || 0;
      coverageStart = readNumber(cachedPayload.coverageStart);
      coverageEnd = readNumber(cachedPayload.coverageEnd);
      detailedGameStart = readNumber(cachedPayload.detailedGameStart);
      loadedVersion = fileVersion;
      if (!panel.hidden) render();
      return;
    }

    if (!panel.hidden) {
      void ensureLoaded();
    }
  };

  if (fileHub) {
    fileHub.subscribe(({ file }) => acceptLeagueFile(file));
  } else {
    fileInput?.addEventListener('change', (event) => {
      const [file] = event.target.files || [];
      acceptLeagueFile(file);
    });
  }

  clearBtn?.addEventListener('click', () => {
    activeFile = null;
    fileVersion += 1;
    loadedVersion = -1;
    loadingVersion = -1;
    records = [];
    shootoutCount = 0;
    coverageStart = null;
    coverageEnd = null;
    detailedGameStart = null;

    try {
      localStorage.removeItem(CACHE_KEY);
      cachedPayload = null;
    } catch (error) {
      console.warn('Could not clear saved shootout records.', error);
    }

    renderEmpty('Load a league file to calculate player shootout records.');
  });

  async function ensureLoaded() {
    const file = activeFile
      || fileHub?.getCurrentFile?.()
      || fileInput?.files?.[0]
      || window.__dblLargeLeagueFile
      || null;

    if (!file) {
      renderEmpty('Load a league file to calculate player shootout records.');
      return;
    }

    if (loadedVersion === fileVersion) {
      render();
      return;
    }

    const version = fileVersion;
    if (loadingVersion === version) return;
    loadingVersion = version;

    showLoading('Reading stored shootout games…');

    try {
      await waitForMainLeagueLoad(version);
      if (!isCurrent(file, version)) return;

      const shootoutsByKey = new Map();
      const participantPids = new Set();
      let earliestDetailedSeason = null;

      await stream.forEachTopLevelArrayItem(file, 'games', (game) => {
        if (!isCurrent(file, version)) return;
        const parsed = parseShootoutGame(game);
        if (!parsed) return;

        const key = getShootoutKey(parsed);
        shootoutsByKey.set(key, parsed);
        participantPids.add(parsed.winner.pid);
        participantPids.add(parsed.loser.pid);

        if (Number.isFinite(parsed.season)) {
          earliestDetailedSeason = earliestDetailedSeason === null
            ? parsed.season
            : Math.min(earliestDetailedSeason, parsed.season);
        }
      });

      if (!isCurrent(file, version)) return;

      showLoading('Backfilling older shootouts from the event log…');

      await stream.forEachTopLevelArrayItem(file, 'events', (event) => {
        if (!isCurrent(file, version)) return;
        const parsed = parseShootoutEvent(event);
        if (!parsed) return;

        const key = getShootoutKey(parsed);
        if (!shootoutsByKey.has(key)) {
          shootoutsByKey.set(key, parsed);
        }

        participantPids.add(parsed.winner.pid);
        participantPids.add(parsed.loser.pid);
      });

      if (!isCurrent(file, version)) return;

      const shootouts = Array.from(shootoutsByKey.values());
      const seasons = shootouts
        .map((shootout) => Number(shootout.season))
        .filter(Number.isFinite);

      coverageStart = seasons.length ? Math.min(...seasons) : null;
      coverageEnd = seasons.length ? Math.max(...seasons) : null;
      detailedGameStart = earliestDetailedSeason;

      showLoading('Matching shootout players to names…');

      const playerInfo = new Map();
      await stream.forEachTopLevelArrayItem(file, 'players', (player) => {
        if (!isCurrent(file, version)) return;
        const pid = readNumber(player?.pid);
        if (pid === null || !participantPids.has(pid)) return;

        playerInfo.set(pid, {
          name: getPlayerName(player),
        });
      });

      if (!isCurrent(file, version)) return;

      records = buildPlayerRecords(shootouts, playerInfo);
      shootoutCount = shootouts.length;
      loadedVersion = version;

      cachedPayload = {
        signature: fileSignature(file),
        shootoutCount,
        coverageStart,
        coverageEnd,
        detailedGameStart,
        records,
      };
      saveCache(cachedPayload);
      render();
    } catch (error) {
      if (!isCurrent(file, version)) return;
      console.error('Could not build shootout records.', error);
      renderEmpty('Could not read shootout records from this league file.');
    } finally {
      if (loadingVersion === version) loadingVersion = -1;
    }
  }

  function parseShootoutGame(game = {}) {
    const won = game?.won && typeof game.won === 'object' ? game.won : {};
    const lost = game?.lost && typeof game.lost === 'object' ? game.lost : {};
    const teams = Array.isArray(game?.teams) ? game.teams : [];
    const teamsByTid = new Map(
      teams
        .filter((team) => Number.isFinite(Number(team?.tid)))
        .map((team) => [Number(team.tid), team]),
    );

    const wonTid = readNumber(won.tid);
    const lostTid = readNumber(lost.tid);
    if (wonTid === null || lostTid === null) return null;

    const wonTeam = teamsByTid.get(wonTid) || {};
    const lostTeam = teamsByTid.get(lostTid) || {};

    const wonShootoutPoints = firstFiniteNumber(won.sPts, wonTeam.sPts);
    const lostShootoutPoints = firstFiniteNumber(lost.sPts, lostTeam.sPts);
    if (wonShootoutPoints === null || lostShootoutPoints === null) return null;

    const shootoutPlay = (Array.isArray(game?.clutchPlays) ? game.clutchPlays : [])
      .slice()
      .reverse()
      .find((play) => /defeated/i.test(String(play)) && /shootout/i.test(String(play)));

    if (!shootoutPlay) return null;

    const participants = extractShootoutParticipants(shootoutPlay);
    if (participants.length < 2) return null;

    const winner = participants[0];
    const loser = participants[1];

    return {
      gid: readNumber(game?.gid),
      season: readNumber(game?.season),
      day: readNumber(game?.day),
      playoffs: game?.playoffs === true,
      regulationScore: {
        winner: readNumber(won.pts),
        loser: readNumber(lost.pts),
      },
      winner: {
        pid: winner.pid,
        name: winner.name,
        makes: wonShootoutPoints,
        attempts: firstFiniteNumber(wonTeam.sAtt),
      },
      loser: {
        pid: loser.pid,
        name: loser.name,
        makes: lostShootoutPoints,
        attempts: firstFiniteNumber(lostTeam.sAtt),
      },
      source: 'game',
    };
  }

  function parseShootoutEvent(event = {}) {
    const text = String(event?.text || '');
    if (!/defeated/i.test(text) || !/shootout/i.test(text)) return null;

    const participants = extractShootoutParticipants(text);
    if (participants.length < 2) return null;

    const shootoutScore = extractShootoutScore(text);
    if (!shootoutScore) return null;

    const gidMatch = text.match(/\/game_log\/[^/"']+\/\d+\/(\d+)/i);
    const regulationMatch = text.match(/>(\d+)\s*[-–]\s*(\d+)\s*\(\d+\s*[-–]\s*\d+\)<\/a>/i);

    return {
      gid: gidMatch ? Number(gidMatch[1]) : null,
      eid: readNumber(event?.eid),
      season: readNumber(event?.season),
      day: null,
      playoffs: false,
      regulationScore: {
        winner: regulationMatch ? Number(regulationMatch[1]) : null,
        loser: regulationMatch ? Number(regulationMatch[2]) : null,
      },
      winner: {
        pid: participants[0].pid,
        name: participants[0].name,
        makes: shootoutScore.winner,
        attempts: null,
      },
      loser: {
        pid: participants[1].pid,
        name: participants[1].name,
        makes: shootoutScore.loser,
        attempts: null,
      },
      source: 'event',
    };
  }

  function extractShootoutScore(text) {
    const matches = Array.from(String(text || '').matchAll(/\((\d+)\s*[-–]\s*(\d+)\)/g));
    if (!matches.length) return null;

    const match = matches[matches.length - 1];
    return {
      winner: Number(match[1]),
      loser: Number(match[2]),
    };
  }

  function getShootoutKey(shootout = {}) {
    if (Number.isFinite(Number(shootout.gid))) {
      return `gid:${Number(shootout.gid)}`;
    }
    if (Number.isFinite(Number(shootout.eid))) {
      return `event:${Number(shootout.eid)}`;
    }
    return [
      'fallback',
      shootout.season,
      shootout.winner?.pid,
      shootout.loser?.pid,
      shootout.winner?.makes,
      shootout.loser?.makes,
    ].join(':');
  }

  function extractShootoutParticipants(html) {
    const participants = [];
    const source = String(html || '');
    const anchorPattern = /<a\b[^>]*href=["'][^"']*\/player\/(\d+)[^"']*["'][^>]*>(.*?)<\/a>/gi;

    let match;
    while ((match = anchorPattern.exec(source)) && participants.length < 2) {
      participants.push({
        pid: Number(match[1]),
        name: decodeHtml(stripTags(match[2])).trim() || `Player ${match[1]}`,
      });
    }

    return participants;
  }

  function buildPlayerRecords(shootouts, playerInfo) {
    const byPid = new Map();

    const ensurePlayer = (pid, fallbackName) => {
      if (byPid.has(pid)) return byPid.get(pid);

      const info = playerInfo.get(pid) || {};
      const record = {
        pid,
        name: info.name || fallbackName || `Player ${pid}`,
        appearances: 0,
        wins: 0,
        losses: 0,
        makes: 0,
        attemptMakes: 0,
        attempts: 0,
        history: [],
      };
      byPid.set(pid, record);
      return record;
    };

    for (const game of shootouts) {
      const winner = ensurePlayer(game.winner.pid, game.winner.name);
      const loser = ensurePlayer(game.loser.pid, game.loser.name);

      winner.appearances += 1;
      winner.wins += 1;
      winner.makes += Number(game.winner.makes) || 0;
      if (Number.isFinite(game.winner.attempts)) {
        winner.attemptMakes += Number(game.winner.makes) || 0;
        winner.attempts += game.winner.attempts;
      }
      winner.history.push(buildHistoryEntry(game, true));

      loser.appearances += 1;
      loser.losses += 1;
      loser.makes += Number(game.loser.makes) || 0;
      if (Number.isFinite(game.loser.attempts)) {
        loser.attemptMakes += Number(game.loser.makes) || 0;
        loser.attempts += game.loser.attempts;
      }
      loser.history.push(buildHistoryEntry(game, false));
    }

    for (const record of byPid.values()) {
      const info = playerInfo.get(record.pid);
      if (info?.name) record.name = info.name;

      record.history.sort((a, b) => {
        const seasonDiff = (Number(b.season) || 0) - (Number(a.season) || 0);
        if (seasonDiff !== 0) return seasonDiff;
        const dayDiff = (Number(b.day) || 0) - (Number(a.day) || 0);
        if (dayDiff !== 0) return dayDiff;
        return (Number(b.gid) || 0) - (Number(a.gid) || 0);
      });
    }

    return Array.from(byPid.values());
  }

  function buildHistoryEntry(game, winnerSide) {
    const own = winnerSide ? game.winner : game.loser;
    const opponent = winnerSide ? game.loser : game.winner;

    return {
      gid: game.gid,
      season: game.season,
      day: game.day,
      playoffs: game.playoffs,
      result: winnerSide ? 'W' : 'L',
      opponentPid: opponent.pid,
      opponentName: opponent.name,
      ownScore: own.makes,
      opponentScore: opponent.makes,
      ownAttempts: own.attempts,
      opponentAttempts: opponent.attempts,
      regulationOwnScore: winnerSide
        ? game.regulationScore.winner
        : game.regulationScore.loser,
      regulationOpponentScore: winnerSide
        ? game.regulationScore.loser
        : game.regulationScore.winner,
      source: game.source || 'game',
    };
  }

  // A single, column-sortable career table. Keep every player's history
  // accessible in the final cell without introducing additional player rows.
  const COLUMNS = [
    {key: 'name', label: 'Player'},
    {key: 'appearances', label: 'SO', title: 'Shootout appearances'},
    {key: 'wins', label: 'W', title: 'Shootout wins'},
    {key: 'losses', label: 'L', title: 'Shootout losses'},
    {key: 'winPct', label: 'Win %', title: 'Shootout win percentage'},
    {key: 'makes', label: 'Makes', title: 'Total shootout makes, including historical results'},
    {key: 'attempts', label: 'Known shots', title: 'Made/attempted shots from games where attempt counts are available; click to sort by known attempts'},
    {key: 'shootPct', label: 'Shoot %', title: 'Shooting percentage from games with known attempts'},
  ];

  function winPercent(player) {
    return player.appearances > 0 ? player.wins / player.appearances : null;
  }
  function shotPercent(player) {
    return player.attempts > 0 ? player.attemptMakes / player.attempts : null;
  }
  function sortableValue(player, key) {
    if (key === 'winPct') return winPercent(player);
    if (key === 'shootPct') return shotPercent(player);
    return key === 'name' ? player.name : Number(player[key]) || 0;
  }
  function compareRecords(a, b) {
    const left = sortableValue(a, sortKey);
    const right = sortableValue(b, sortKey);
    // Unknown percentages belong last, even for ascending sorts.
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    const direction = sortDirection === 'asc' ? 1 : -1;
    const difference = sortKey === 'name'
      ? String(left).localeCompare(String(right), undefined, {sensitivity: 'base'}) * direction
      : ((left ?? 0) - (right ?? 0)) * direction;
    return difference || b.wins - a.wins || a.name.localeCompare(b.name)
      || a.pid - b.pid;
  }
  function sortOn(key) {
    if (sortKey === key) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    else {
      sortKey = key;
      sortDirection = key === 'name' ? 'asc' : 'desc';
    }
    // Keep the original sort dropdown functional and synchronized with
    // column-header sorting.
    if (sortSelect) sortSelect.value = sortKey;
    render();
  }

  function render() {
    wrap.className = 'shootout-records-wrap';
    wrap.replaceChildren();

    if (!records.length) {
      renderEmpty('No stored player shootouts were found in this league file.');
      return;
    }

    const summary = document.createElement('p');
    summary.className = 'shootout-records-summary';
    const summaryParts = [
      `${shootoutCount.toLocaleString()} stored shootouts`,
      `${records.length.toLocaleString()} players`,
    ];
    if (Number.isFinite(coverageStart) && Number.isFinite(coverageEnd)) {
      summaryParts.push(`history ${coverageStart}–${coverageEnd}`);
    }
    if (Number.isFinite(detailedGameStart) && Number.isFinite(coverageEnd)
        && detailedGameStart > coverageStart) {
      summaryParts.push(`attempt data ${detailedGameStart}–${coverageEnd}`);
    }
    summary.textContent = summaryParts.join(' · ');
    wrap.appendChild(summary);

    const scroll = document.createElement('div');
    scroll.className = 'shootout-table-scroll';
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', 'Sortable career shootout results table');
    scroll.tabIndex = 0;

    const table = document.createElement('table');
    table.className = 'shootout-results-table';

    const caption = document.createElement('caption');
    caption.textContent = 'Career shootout results. Click a column heading to sort. Known shots are makes/attempts only where attempts were recorded.';
    table.appendChild(caption);

    const thead = document.createElement('thead');
    const headings = document.createElement('tr');
    const rankTh = document.createElement('th');
    rankTh.scope = 'col';
    rankTh.textContent = '#';
    headings.appendChild(rankTh);

    for (const column of COLUMNS) {
      const th = document.createElement('th');
      th.scope = 'col';
      if (sortKey === column.key) {
        th.setAttribute('aria-sort', sortDirection === 'asc' ? 'ascending' : 'descending');
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'shootout-table-sort' + (sortKey === column.key ? ' is-sorted' : '');
      button.title = column.title || ('Sort by ' + column.label);
      button.setAttribute('aria-label', 'Sort by ' + (column.title || column.label) +
        (sortKey === column.key
          ? ', currently ' + (sortDirection === 'asc' ? 'ascending' : 'descending')
          : ''));
      const label = document.createElement('span');
      label.textContent = column.label;
      const arrow = document.createElement('span');
      arrow.className = 'shootout-sort-indicator';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = sortKey !== column.key ? '↕' :
        sortDirection === 'asc' ? '▲' : '▼';
      button.append(label, arrow);
      button.addEventListener('click', () => sortOn(column.key));
      th.appendChild(button);
      headings.appendChild(th);
    }
    const historyTh = document.createElement('th');
    historyTh.scope = 'col';
    historyTh.textContent = 'History';
    headings.appendChild(historyTh);
    thead.appendChild(headings);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const sorted = records.slice().sort(compareRecords);
    for (const [index, player] of sorted.entries()) {
      tbody.appendChild(buildPlayerRow(player, index + 1));
    }
    table.appendChild(tbody);
    scroll.appendChild(table);
    wrap.appendChild(scroll);
  }

  function numericCell(row, value, label) {
    const td = document.createElement('td');
    td.className = 'shootout-numeric';
    td.textContent = String(value);
    if (label) td.title = label;
    row.appendChild(td);
  }

  function buildPlayerRow(player, rank) {
    const tr = document.createElement('tr');
    tr.className = 'shootout-table-player';

    numericCell(tr, rank);
    const name = document.createElement('th');
    name.scope = 'row';
    name.className = 'shootout-player-name';
    const title = document.createElement('strong');
    title.textContent = player.name;
    const pid = document.createElement('small');
    pid.textContent = 'PID ' + player.pid;
    name.append(title, pid);
    tr.appendChild(name);

    numericCell(tr, player.appearances);
    numericCell(tr, player.wins);
    numericCell(tr, player.losses);
    numericCell(tr, formatPercent(player.wins, player.appearances));
    numericCell(tr, player.makes);
    numericCell(tr, player.attempts > 0
      ? player.attemptMakes + '/' + player.attempts : '—',
      'Known makes / known attempts');
    numericCell(tr, formatPercent(player.attemptMakes, player.attempts));

    const historyCell = document.createElement('td');
    historyCell.className = 'shootout-history-cell';
    const details = document.createElement('details');
    details.className = 'shootout-history';
    const summary = document.createElement('summary');
    summary.textContent = 'Games (' + player.appearances + ')';
    details.appendChild(summary);
    // Defer large game logs until opened; keep one table row per player.
    details.addEventListener('toggle', () => {
      if (!details.open || details.dataset.loaded === 'true') return;
      const history = document.createElement('div');
      history.className = 'shootout-history-list';
      for (const game of player.history) history.appendChild(buildHistoryRow(game));
      details.appendChild(history);
      details.dataset.loaded = 'true';
    });
    historyCell.appendChild(details);
    tr.appendChild(historyCell);
    return tr;
  }

  function buildHistoryRow(game) {
    const row = document.createElement('div');
    row.className = `shootout-history-row is-${game.result === 'W' ? 'win' : 'loss'}`;

    const result = document.createElement('strong');
    result.className = 'shootout-history-result';
    result.textContent = game.result;

    const body = document.createElement('div');
    body.className = 'shootout-history-body';

    const matchup = document.createElement('strong');
    matchup.textContent = `${game.ownScore}–${game.opponentScore} vs. ${game.opponentName}`;

    const metaParts = [];
    if (Number.isFinite(game.season)) metaParts.push(String(game.season));
    if (Number.isFinite(game.day)) metaParts.push(`Day ${game.day}`);
    if (game.playoffs) metaParts.push('Playoffs');
    if (Number.isFinite(game.ownAttempts)) {
      metaParts.push(`${game.ownScore}/${game.ownAttempts} shooting`);
    } else if (game.source === 'event') {
      metaParts.push('attempts not retained');
    }

    const meta = document.createElement('span');
    meta.textContent = metaParts.join(' · ');

    body.append(matchup, meta);
    row.append(result, body);
    return row;
  }

  function formatPercent(numerator, denominator) {
    const top = Number(numerator);
    const bottom = Number(denominator);
    if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= 0) return '—';
    return `${((top / bottom) * 100).toFixed(1)}%`;
  }

  function showLoading(message) {
    renderEmpty(message, true);
  }

  function renderEmpty(message, loading = false) {
    wrap.className = 'shootout-records-wrap empty-state';
    wrap.replaceChildren();

    const empty = document.createElement('div');
    empty.className = 'empty-copy';

    const text = document.createElement('p');
    text.textContent = message;
    if (loading) text.setAttribute('aria-live', 'polite');

    empty.appendChild(text);
    wrap.appendChild(empty);
  }

  async function waitForMainLeagueLoad(version) {
    const startedAt = Date.now();

    while (version === fileVersion && Date.now() - startedAt < 90000) {
      const text = statusMessage?.textContent?.trim() || '';
      if (!/^(Loading|Restoring)\s/i.test(text)) return;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  }

  function isCurrent(file, version) {
    return version === fileVersion && file === (
      activeFile
      || fileHub?.getCurrentFile?.()
      || fileInput?.files?.[0]
      || window.__dblLargeLeagueFile
      || null
    );
  }

  function fileSignature(file) {
    if (!file) return '';
    return [
      String(file.name || ''),
      String(Number(file.size) || 0),
      String(Number(file.lastModified) || 0),
    ].join('|');
  }

  function saveCache(payload) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Could not save shootout records.', error);
    }
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      console.warn('Could not restore saved shootout records.', error);
      return null;
    }
  }

  function normalizeCachedRecords(value) {
    if (!Array.isArray(value)) return [];

    return value
      .filter((record) => record && Number.isFinite(Number(record.pid)))
      .map((record) => ({
        ...record,
        pid: Number(record.pid),
        name: String(record.name || `Player ${record.pid}`),
        appearances: Number(record.appearances) || 0,
        wins: Number(record.wins) || 0,
        losses: Number(record.losses) || 0,
        makes: Number(record.makes) || 0,
        attemptMakes: Number(record.attemptMakes) || 0,
        attempts: Number(record.attempts) || 0,
        history: Array.isArray(record.history) ? record.history : [],
      }));
  }

  function firstFiniteNumber(...values) {
    for (const value of values) {
      if (value === null || value === undefined || value === '') continue;
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return null;
  }

  function readNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function getPlayerName(player = {}) {
    const direct = typeof player.name === 'string' ? player.name.trim() : '';
    if (direct) return direct;

    const first = typeof player.firstName === 'string' ? player.firstName.trim() : '';
    const last = typeof player.lastName === 'string' ? player.lastName.trim() : '';
    return `${first} ${last}`.trim() || (Number.isFinite(Number(player.pid))
      ? `Player ${player.pid}`
      : 'Unknown Player');
  }

  function stripTags(value) {
    return String(value || '').replace(/<[^>]*>/g, '');
  }

  function decodeHtml(value) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value || '');
    return textarea.value;
  }

})();
