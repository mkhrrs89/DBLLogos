(() => {
  const CACHE_KEY = 'dbl-logo-shootout-records:v1';

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
  let cachedPayload = loadCache();

  sortSelect?.addEventListener('change', render);

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

    const signature = fileSignature(file);
    if (cachedPayload?.signature === signature) {
      records = normalizeCachedRecords(cachedPayload.records);
      shootoutCount = Number(cachedPayload.shootoutCount) || 0;
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

      const shootouts = [];
      const participantPids = new Set();

      await stream.forEachTopLevelArrayItem(file, 'games', (game) => {
        if (!isCurrent(file, version)) return;
        const parsed = parseShootoutGame(game);
        if (!parsed) return;

        shootouts.push(parsed);
        participantPids.add(parsed.winner.pid);
        participantPids.add(parsed.loser.pid);
      });

      if (!isCurrent(file, version)) return;

      showLoading('Matching shootout players to photos…');

      const playerInfo = new Map();
      await stream.forEachTopLevelArrayItem(file, 'players', (player) => {
        if (!isCurrent(file, version)) return;
        const pid = readNumber(player?.pid);
        if (pid === null || !participantPids.has(pid)) return;

        playerInfo.set(pid, {
          name: getPlayerName(player),
          imgURL: normalizeImageUrl(player?.imgURL),
        });
      });

      if (!isCurrent(file, version)) return;

      records = buildPlayerRecords(shootouts, playerInfo);
      shootoutCount = shootouts.length;
      loadedVersion = version;

      cachedPayload = {
        signature: fileSignature(file),
        shootoutCount,
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
    };
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
        imgURL: info.imgURL || '',
        appearances: 0,
        wins: 0,
        losses: 0,
        makes: 0,
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
      winner.attempts += Number(game.winner.attempts) || 0;
      winner.history.push(buildHistoryEntry(game, true));

      loser.appearances += 1;
      loser.losses += 1;
      loser.makes += Number(game.loser.makes) || 0;
      loser.attempts += Number(game.loser.attempts) || 0;
      loser.history.push(buildHistoryEntry(game, false));
    }

    for (const record of byPid.values()) {
      const info = playerInfo.get(record.pid);
      if (info?.name) record.name = info.name;
      if (info?.imgURL) record.imgURL = info.imgURL;

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
    };
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
    summary.textContent = `${shootoutCount.toLocaleString()} stored shootouts · ${records.length.toLocaleString()} players`;
    wrap.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'shootout-player-grid';

    const sorted = records.slice().sort(compareRecords);
    for (const [index, player] of sorted.entries()) {
      list.appendChild(buildPlayerCard(player, index + 1));
    }

    wrap.appendChild(list);
  }

  function compareRecords(a, b) {
    const mode = sortSelect?.value || 'wins';
    const winPct = (player) => player.appearances > 0 ? player.wins / player.appearances : 0;
    const shootPct = (player) => player.attempts > 0 ? player.makes / player.attempts : 0;

    const comparators = {
      wins: () => (b.wins - a.wins)
        || (b.appearances - a.appearances)
        || (winPct(b) - winPct(a)),
      appearances: () => (b.appearances - a.appearances)
        || (b.wins - a.wins),
      winPct: () => (winPct(b) - winPct(a))
        || (b.appearances - a.appearances)
        || (b.wins - a.wins),
      shootPct: () => (shootPct(b) - shootPct(a))
        || (b.attempts - a.attempts)
        || (b.makes - a.makes),
      makes: () => (b.makes - a.makes)
        || (b.attempts - a.attempts),
      attempts: () => (b.attempts - a.attempts)
        || (b.makes - a.makes),
    };

    const difference = (comparators[mode] || comparators.wins)();
    return difference || a.name.localeCompare(b.name);
  }

  function buildPlayerCard(player, rank) {
    const card = document.createElement('article');
    card.className = 'shootout-player-card';

    const main = document.createElement('div');
    main.className = 'shootout-player-main';

    const rankBadge = document.createElement('span');
    rankBadge.className = 'shootout-player-rank';
    rankBadge.textContent = `#${rank}`;

    const photo = buildPlayerPhoto(player);

    const identity = document.createElement('div');
    identity.className = 'shootout-player-identity';

    const name = document.createElement('h3');
    name.textContent = player.name;

    const pid = document.createElement('span');
    pid.textContent = `PID ${player.pid}`;

    identity.append(name, pid);

    const record = document.createElement('div');
    record.className = 'shootout-player-record';

    const recordValue = document.createElement('strong');
    recordValue.textContent = `${player.wins}–${player.losses}`;

    const recordLabel = document.createElement('span');
    recordLabel.textContent = 'W–L';

    record.append(recordValue, recordLabel);
    main.append(rankBadge, photo, identity, record);

    const stats = document.createElement('div');
    stats.className = 'shootout-player-stats';

    stats.append(
      buildStat('Shootouts', player.appearances),
      buildStat('Makes', player.makes),
      buildStat('Attempts', player.attempts),
      buildStat('Shootout %', formatPercent(player.makes, player.attempts)),
      buildStat('Win %', formatPercent(player.wins, player.appearances)),
    );

    const details = document.createElement('details');
    details.className = 'shootout-history';

    const summary = document.createElement('summary');
    summary.textContent = `Game-by-game history (${player.appearances})`;
    details.appendChild(summary);

    const history = document.createElement('div');
    history.className = 'shootout-history-list';

    for (const game of player.history) {
      history.appendChild(buildHistoryRow(game));
    }

    details.appendChild(history);
    card.append(main, stats, details);
    return card;
  }

  function buildPlayerPhoto(player) {
    const photo = document.createElement('div');
    photo.className = 'shootout-player-photo';

    if (player.imgURL) {
      const image = document.createElement('img');
      image.src = player.imgURL;
      image.alt = `${player.name} portrait`;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => {
        image.remove();
        addPhotoPlaceholder(photo, player.name);
      }, { once: true });
      photo.appendChild(image);
    } else {
      addPhotoPlaceholder(photo, player.name);
    }

    return photo;
  }

  function addPhotoPlaceholder(photo, name) {
    photo.classList.add('is-placeholder');
    const initials = document.createElement('span');
    initials.textContent = getInitials(name);
    photo.appendChild(initials);
  }

  function buildStat(label, value) {
    const item = document.createElement('div');
    item.className = 'shootout-stat';

    const statLabel = document.createElement('span');
    statLabel.textContent = label;

    const statValue = document.createElement('strong');
    statValue.textContent = String(value);

    item.append(statLabel, statValue);
    return item;
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
        imgURL: normalizeImageUrl(record.imgURL),
        appearances: Number(record.appearances) || 0,
        wins: Number(record.wins) || 0,
        losses: Number(record.losses) || 0,
        makes: Number(record.makes) || 0,
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

  function normalizeImageUrl(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function stripTags(value) {
    return String(value || '').replace(/<[^>]*>/g, '');
  }

  function decodeHtml(value) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value || '');
    return textarea.value;
  }

  function getInitials(name) {
    return String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || '?';
  }
})();
