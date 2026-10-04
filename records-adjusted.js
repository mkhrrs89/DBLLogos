(() => {
  const CACHE_KEY = 'dbl-logo-adjusted-scoring-records:v1';
  const RECORD_LIMIT = 50;

  const rawBtn = document.getElementById('recordsRawSubtabBtn');
  const adjustedBtn = document.getElementById('recordsAdjustedSubtabBtn');
  const rawWrap = document.getElementById('recordsWrap');
  const adjustedWrap = document.getElementById('recordsAdjustedWrap');
  const subtitle = document.getElementById('recordsSubtitle');
  const recordsTabBtn = document.getElementById('recordsTabBtn');
  const fileInput = document.getElementById('leagueFile');
  const clearBtn = document.getElementById('clearLeagueFileBtn');
  const statusMessage = document.getElementById('statusMessage');
  const fileHub = window.DBLLeagueFileHub;
  const stream = window.DBLLeagueStream;

  if (!rawBtn || !adjustedBtn || !rawWrap || !adjustedWrap || !stream) return;

  let activeView = 'raw';
  let activeFile = null;
  let fileVersion = 0;
  let loadedVersion = -1;
  let loadingVersion = -1;
  let adjustedRecords = [];
  let environment = null;
  let cachedPayload = loadCache();

  rawBtn.addEventListener('click', () => setView('raw'));
  adjustedBtn.addEventListener('click', () => {
    setView('adjusted');
    void ensureAdjustedRecords();
  });

  recordsTabBtn?.addEventListener('click', () => {
    if (activeView === 'adjusted') void ensureAdjustedRecords();
  });

  window.addEventListener('dbl:tab-change', (event) => {
    if (event.detail?.panelId !== 'recordsPanel') return;
    if (activeView === 'adjusted') void ensureAdjustedRecords();
  });

  const acceptLeagueFile = (file) => {
    if (!file || activeFile === file) return;

    activeFile = file;
    fileVersion += 1;
    loadedVersion = -1;
    loadingVersion = -1;
    adjustedRecords = [];
    environment = null;

    const signature = fileSignature(file);
    if (cachedPayload?.signature === signature) {
      adjustedRecords = normalizeSavedRecords(cachedPayload.records);
      environment = normalizeSavedEnvironment(cachedPayload.environment);
      if (adjustedRecords.length && environment) {
        loadedVersion = fileVersion;
        if (activeView === 'adjusted') renderAdjustedRecords();
        return;
      }
    }

    if (activeView === 'adjusted') void ensureAdjustedRecords();
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
    adjustedRecords = [];
    environment = null;

    try {
      localStorage.removeItem(CACHE_KEY);
      cachedPayload = null;
    } catch (error) {
      console.warn('Could not clear adjusted scoring records.', error);
    }

    renderEmpty('Load a league file to calculate adjusted single-game scoring records.');
  });

  function setView(view) {
    activeView = view === 'adjusted' ? 'adjusted' : 'raw';
    const adjusted = activeView === 'adjusted';

    rawBtn.classList.toggle('active', !adjusted);
    rawBtn.setAttribute('aria-selected', String(!adjusted));
    adjustedBtn.classList.toggle('active', adjusted);
    adjustedBtn.setAttribute('aria-selected', String(adjusted));

    rawWrap.hidden = adjusted;
    adjustedWrap.hidden = !adjusted;

    if (subtitle) {
      subtitle.textContent = adjusted
        ? 'Top 50 single-game scoring totals translated to the current in-game scoring environment.'
        : 'Top 50 single-game scoring totals by any player in the loaded league file.';
    }
  }

  async function ensureAdjustedRecords() {
    const file = activeFile
      || fileHub?.getCurrentFile?.()
      || fileInput?.files?.[0]
      || window.__dblLargeLeagueFile
      || null;

    if (!file) {
      renderEmpty('Load a league file to calculate adjusted single-game scoring records.');
      return;
    }

    if (loadedVersion === fileVersion && adjustedRecords.length && environment) {
      renderAdjustedRecords();
      return;
    }

    const version = fileVersion;
    if (loadingVersion === version) return;
    loadingVersion = version;

    renderEmpty('Preparing adjusted scoring records…', true);

    try {
      await waitForMainLeagueLoad(version);
      if (!isCurrent(file, version)) return;

      await waitForPrimaryRecords();
      if (!isCurrent(file, version)) return;

      renderEmpty('Building historical scoring environments…', true);

      const seasonEnvironment = new Map();
      await stream.forEachTopLevelArrayItem(file, 'teams', (team) => {
        if (!isCurrent(file, version)) return;

        const stats = Array.isArray(team?.stats) ? team.stats : [];
        for (const row of stats) {
          if (row?.playoffs) continue;

          const season = readNumber(row?.season);
          const gp = readNumber(row?.gp);
          const pts = readNumber(row?.pts);
          const minutes = readNumber(row?.min);
          if (season === null || gp === null || gp <= 0) continue;

          const current = seasonEnvironment.get(season) || {
            teamGames: 0,
            points: 0,
            teamMinutes: 0,
            minuteRows: [],
          };

          current.teamGames += gp;
          if (pts !== null) current.points += pts;

          if (minutes !== null && minutes > 0) {
            current.teamMinutes += minutes;
            current.minuteRows.push(minutes / gp / 5);
          }

          seasonEnvironment.set(season, current);
        }
      });

      if (!isCurrent(file, version)) return;

      renderEmpty('Reading current league settings…', true);
      const gameAttributes = await stream.readTopLevelValue(file, 'gameAttributes');
      if (!isCurrent(file, version)) return;

      const currentSeason = readNumber(gameAttributes?.season)
        ?? Math.max(...Array.from(seasonEnvironment.keys()));
      const currentQuarterLength = readNumber(resolveHistoricalValue(gameAttributes?.quarterLength, currentSeason));
      const currentNumPeriods = readNumber(resolveHistoricalValue(gameAttributes?.numPeriods, currentSeason));
      const explicitCurrentLength = currentQuarterLength !== null && currentNumPeriods !== null
        ? currentQuarterLength * currentNumPeriods
        : null;

      const metricsBySeason = buildSeasonMetrics(seasonEnvironment);
      const currentMetrics = metricsBySeason.get(currentSeason) || null;
      const currentGameLength = explicitCurrentLength
        || currentMetrics?.gameLength
        || 48;
      const currentLeaguePpg = currentMetrics?.leaguePpg || null;

      if (!Number.isFinite(currentLeaguePpg) || currentLeaguePpg <= 0) {
        throw new Error('Current-season league scoring average could not be calculated.');
      }

      renderEmpty('Matching player minutes and photos…', true);

      const playerInfoByPid = new Map();
      const playerInfoByName = new Map();
      const playerSeasonTotals = new Map();

      const ingestPlayer = (player) => {
        const pid = readNumber(player?.pid);
        const name = getPlayerName(player);
        const imageURL = normalizeImageUrl(player?.imgURL);

        if (pid !== null) {
          playerInfoByPid.set(pid, { name, imgURL: imageURL });
        }
        if (name !== 'Unknown Player') {
          const key = name.toLocaleLowerCase();
          const existing = playerInfoByName.get(key);
          if (!existing || (!existing.imgURL && imageURL)) {
            playerInfoByName.set(key, { name, imgURL: imageURL, pid });
          }
        }

        if (pid === null) return;

        const stats = Array.isArray(player?.stats) ? player.stats : [];
        for (const row of stats) {
          if (row?.playoffs) continue;
          const season = readNumber(row?.season);
          const gp = readNumber(row?.gp);
          const min = readNumber(row?.min);
          if (season === null || gp === null || gp <= 0 || min === null || min < 0) continue;

          const key = playerSeasonKey(pid, season);
          const totals = playerSeasonTotals.get(key) || { gp: 0, min: 0 };
          totals.gp += gp;
          totals.min += min;
          playerSeasonTotals.set(key, totals);
        }
      };

      let playerCount = 0;
      await stream.forEachTopLevelArrayItem(file, 'players', (player) => {
        if (!isCurrent(file, version)) return;
        playerCount += 1;
        ingestPlayer(player);
      });

      if (playerCount === 0) {
        for (const collection of ['retiredPlayers', 'releasedPlayers', 'freeAgents']) {
          await stream.forEachTopLevelArrayItem(file, collection, (player) => {
            if (!isCurrent(file, version)) return;
            ingestPlayer(player);
          });
          if (!isCurrent(file, version)) return;
        }
      }

      if (!isCurrent(file, version)) return;

      const playerMpgBySeason = new Map();
      for (const [key, totals] of playerSeasonTotals.entries()) {
        if (totals.gp > 0) playerMpgBySeason.set(key, totals.min / totals.gp);
      }

      renderEmpty('Adjusting stored game performances…', true);

      const teamNameByTidSeason = buildTeamNameMapFromTimeline();
      const records = [];

      await stream.forEachTopLevelArrayItem(file, 'games', (game) => {
        if (!isCurrent(file, version)) return;

        const season = readGameSeasonSafe(game);
        const teamEntries = getTeamEntries(game);

        for (const teamEntry of teamEntries) {
          const players = Array.isArray(teamEntry?.players) ? teamEntry.players : [];
          for (const player of players) {
            const points = readPlayerPointsSafe(player);
            if (!Number.isFinite(points)) continue;

            const pid = readNumber(player?.pid);
            const playerName = getGamePlayerName(player, pid, playerInfoByPid);
            const gameMinutes = firstFiniteNumber(player?.min, player?.minutes);
            const seasonMpg = pid !== null && season !== null
              ? playerMpgBySeason.get(playerSeasonKey(pid, season))
              : null;

            const adjustment = calculateAdjustedPoints({
              points,
              season,
              gameMinutes,
              seasonMpg,
              metricsBySeason,
              currentLeaguePpg,
              currentGameLength,
            });
            if (!adjustment) continue;

            const tid = readNumber(teamEntry?.tid) ?? readNumber(player?.tid);
            const imageURL = getPlayerImage(pid, playerName, playerInfoByPid, playerInfoByName);

            addAdjustedRecord(records, {
              points,
              adjustedPoints: adjustment.adjustedPoints,
              playerName,
              pid,
              tid,
              imgURL: imageURL,
              teamName: getTeamName(teamEntry, season, teamNameByTidSeason),
              opponentName: getOpponentName(teamEntry, teamEntries, season, teamNameByTidSeason),
              season,
              gameType: game?.playoffs ? 'Playoffs' : 'Regular season',
              gid: readGameIdSafe(game),
              gameMinutes,
              seasonMpg,
              sourceLeaguePpg: adjustment.sourceLeaguePpg,
              sourceGameLength: adjustment.sourceGameLength,
              currentLeaguePpg,
              currentGameLength,
            });
          }
        }
      });

      if (!isCurrent(file, version)) return;

      renderEmpty('Adding historical scoring feats…', true);

      for (const collection of ['playerFeats', 'statisticalFeats', 'statFeats', 'playerStatFeats']) {
        await stream.forEachTopLevelArrayItem(file, collection, (feat) => {
          if (!isCurrent(file, version)) return;

          const points = readFeatPoints(feat);
          if (!Number.isFinite(points)) return;

          const season = readGameSeasonSafe(feat);
          const pid = readNumber(feat?.pid);
          const playerName = getFeatPlayerName(feat, pid, playerInfoByPid);
          const gameMinutes = firstFiniteNumber(
            feat?.min,
            feat?.minutes,
            feat?.stats?.min,
            feat?.stat?.min,
            feat?.totals?.min,
          );
          const seasonMpg = pid !== null && season !== null
            ? playerMpgBySeason.get(playerSeasonKey(pid, season))
            : null;

          const adjustment = calculateAdjustedPoints({
            points,
            season,
            gameMinutes,
            seasonMpg,
            metricsBySeason,
            currentLeaguePpg,
            currentGameLength,
          });
          if (!adjustment) return;

          const tid = readNumber(feat?.tid);
          const oppTid = readNumber(feat?.oppTid ?? feat?.opponentTid);
          const gid = readGameIdSafe(feat);

          const candidate = {
            points,
            adjustedPoints: adjustment.adjustedPoints,
            playerName,
            pid,
            tid,
            imgURL: getPlayerImage(pid, playerName, playerInfoByPid, playerInfoByName)
              || normalizeImageUrl(feat?.imgURL),
            teamName: getTimelineTeamName(teamNameByTidSeason, tid, season),
            opponentName: getTimelineTeamName(teamNameByTidSeason, oppTid, season, ''),
            season,
            gameType: feat?.playoffs ? 'Playoffs' : 'Regular season',
            gid,
            gameMinutes,
            seasonMpg,
            sourceLeaguePpg: adjustment.sourceLeaguePpg,
            sourceGameLength: adjustment.sourceGameLength,
            currentLeaguePpg,
            currentGameLength,
          };

          if (isDuplicateOfRetainedRecord(records, candidate)) return;
          addAdjustedRecord(records, candidate);
        });

        if (!isCurrent(file, version)) return;
      }

      adjustedRecords = records.slice().sort(compareAdjustedRecords).slice(0, RECORD_LIMIT);
      environment = {
        currentSeason,
        currentLeaguePpg,
        currentGameLength,
      };
      loadedVersion = version;

      cachedPayload = {
        signature: fileSignature(file),
        environment,
        records: adjustedRecords,
      };
      saveCache(cachedPayload);
      renderAdjustedRecords();
    } catch (error) {
      if (!isCurrent(file, version)) return;
      console.error('Could not build adjusted scoring records.', error);
      renderEmpty('Could not calculate adjusted single-game scoring records from this league file.');
    } finally {
      if (loadingVersion === version) loadingVersion = -1;
    }
  }

  function buildSeasonMetrics(rawBySeason) {
    const result = new Map();

    for (const [season, raw] of rawBySeason.entries()) {
      if (!(raw.teamGames > 0)) continue;

      const leaguePpg = raw.points / raw.teamGames;
      const rowLengths = raw.minuteRows
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((a, b) => a - b);

      let gameLength = null;
      if (rowLengths.length) {
        const middle = Math.floor(rowLengths.length / 2);
        const median = rowLengths.length % 2
          ? rowLengths[middle]
          : (rowLengths[middle - 1] + rowLengths[middle]) / 2;
        gameLength = Math.max(1, Math.round(median));
      }

      result.set(season, {
        leaguePpg,
        gameLength,
      });
    }

    return result;
  }

  function calculateAdjustedPoints({
    points,
    season,
    gameMinutes,
    seasonMpg,
    metricsBySeason,
    currentLeaguePpg,
    currentGameLength,
  }) {
    const source = metricsBySeason.get(season);
    if (!source || !(source.leaguePpg > 0)) return null;

    const sourceGameLength = source.gameLength || currentGameLength;
    if (!(sourceGameLength > 0) || !(currentGameLength > 0)) return null;

    // Step 1: translate the source regulation length to today's length.
    const gameLengthFactor = currentGameLength / sourceGameLength;

    // Step 2: compare scoring rates per regulation minute. This separates the
    // scoring environment from game length so the two are not double-counted.
    const sourceScoringRate = source.leaguePpg / sourceGameLength;
    const currentScoringRate = currentLeaguePpg / currentGameLength;
    const scoringEnvironmentFactor = currentScoringRate / sourceScoringRate;

    // Step 3: softly correct for a record game that used substantially more or
    // fewer minutes than that player's normal workload. sqrt + clamping keeps
    // this contextual rather than allowing tiny-minute games to dominate.
    let workloadFactor = 1;
    if (
      Number.isFinite(gameMinutes) && gameMinutes > 0
      && Number.isFinite(seasonMpg) && seasonMpg > 0
    ) {
      workloadFactor = Math.sqrt(seasonMpg / gameMinutes);
      workloadFactor = Math.min(1.15, Math.max(0.85, workloadFactor));
    }

    const adjustedPoints = points
      * gameLengthFactor
      * scoringEnvironmentFactor
      * workloadFactor;

    if (!Number.isFinite(adjustedPoints)) return null;

    return {
      adjustedPoints,
      sourceLeaguePpg: source.leaguePpg,
      sourceGameLength,
      workloadFactor,
    };
  }

  function addAdjustedRecord(records, record) {
    if (
      records.length >= RECORD_LIMIT
      && compareAdjustedRecords(record, records[records.length - 1]) >= 0
    ) {
      return;
    }

    const insertIndex = records.findIndex(
      (existing) => compareAdjustedRecords(record, existing) < 0,
    );

    if (insertIndex === -1) records.push(record);
    else records.splice(insertIndex, 0, record);

    if (records.length > RECORD_LIMIT) records.length = RECORD_LIMIT;
  }

  function compareAdjustedRecords(a = {}, b = {}) {
    const adjustedDifference = (Number(b.adjustedPoints) || 0) - (Number(a.adjustedPoints) || 0);
    if (Math.abs(adjustedDifference) > 1e-9) return adjustedDifference;

    const rawDifference = (Number(b.points) || 0) - (Number(a.points) || 0);
    if (rawDifference !== 0) return rawDifference;

    const seasonDifference = (Number(b.season) || 0) - (Number(a.season) || 0);
    if (seasonDifference !== 0) return seasonDifference;

    return String(a.playerName || '').localeCompare(String(b.playerName || ''));
  }

  function isDuplicateOfRetainedRecord(records, candidate) {
    const gid = String(candidate.gid || '');
    const pid = candidate.pid;
    if (gid && pid !== null) {
      return records.some((record) => (
        String(record.gid || '') === gid
        && record.pid === pid
        && Number(record.points) === Number(candidate.points)
      ));
    }

    return records.some((record) => (
      !record.gid
      && !candidate.gid
      && record.pid === candidate.pid
      && Number(record.season) === Number(candidate.season)
      && Number(record.tid) === Number(candidate.tid)
      && Number(record.points) === Number(candidate.points)
      && String(record.gameType) === String(candidate.gameType)
    ));
  }

  function renderAdjustedRecords() {
    adjustedWrap.replaceChildren();

    if (!adjustedRecords.length || !environment) {
      renderEmpty('No qualifying scoring performances were found.');
      return;
    }

    adjustedWrap.className = 'records-wrap';

    const context = document.createElement('p');
    context.className = 'records-adjusted-context';
    context.textContent = `Adjusted to ${environment.currentSeason}: ${formatOne(environment.currentGameLength)}-minute games · ${formatOne(environment.currentLeaguePpg)} league PPG`;

    const list = document.createElement('ol');
    list.className = 'records-list';

    adjustedRecords.forEach((record) => {
      const item = document.createElement('li');
      item.className = 'record-item';

      const points = document.createElement('strong');
      points.className = 'record-points';
      points.textContent = `${formatOne(record.adjustedPoints)} pts`;
      points.title = `Raw: ${record.points} points`;

      const details = document.createElement('div');
      details.className = 'record-details';

      const imageURL = normalizeImageUrl(record.imgURL);
      if (imageURL) {
        const photo = document.createElement('div');
        photo.className = 'record-player-photo';

        const image = document.createElement('img');
        image.src = imageURL;
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.setAttribute('aria-hidden', 'true');
        image.addEventListener('error', () => {
          photo.remove();
          details.classList.remove('has-player-photo');
          item.classList.remove('has-player-photo');
        }, { once: true });

        photo.appendChild(image);
        details.appendChild(photo);
        details.classList.add('has-player-photo');
        item.classList.add('has-player-photo');
      }

      const player = document.createElement('strong');
      player.textContent = record.playerName;

      const meta = document.createElement('span');
      meta.className = 'record-meta';
      const opponentText = record.opponentName ? ` vs ${record.opponentName}` : '';
      const gidText = record.gid ? ` · Game ${record.gid}` : '';
      meta.textContent = `${record.season || 'Unknown season'} · ${record.teamName}${opponentText} · ${record.gameType}${gidText}`;

      details.append(player, meta);
      item.append(points, details);
      list.appendChild(item);
    });

    adjustedWrap.append(context, list);
  }

  function renderEmpty(message, loading = false) {
    adjustedWrap.className = 'records-wrap empty-state';
    adjustedWrap.replaceChildren();

    const empty = document.createElement('div');
    empty.className = 'empty-copy';

    const text = document.createElement('p');
    text.textContent = message;
    if (loading) text.setAttribute('aria-live', 'polite');

    empty.appendChild(text);
    adjustedWrap.appendChild(empty);
  }

  function buildTeamNameMapFromTimeline() {
    const map = new Map();
    const rows = Array.isArray(window.fullTimeline?.rows)
      ? window.fullTimeline.rows
      : Array.isArray(fullTimeline?.rows)
        ? fullTimeline.rows
        : [];

    for (const row of rows) {
      if (!(row?.entriesByYear instanceof Map)) continue;
      for (const [season, entry] of row.entriesByYear.entries()) {
        map.set(`${row.tid}:${season}`, entry?.teamName || row.latestLocation || `TID ${row.tid}`);
      }
    }

    return map;
  }

  function getTimelineTeamName(map, tid, season, fallback = 'Unknown Team') {
    if (tid === null || tid === undefined) return fallback;
    if (season !== null && season !== undefined) {
      const exact = map.get(`${tid}:${season}`);
      if (exact) return exact;
    }
    return fallback || `TID ${tid}`;
  }

  function getTeamEntries(game = {}) {
    if (Array.isArray(game.teams)) return game.teams;
    const teams = [];
    if (game.won && typeof game.won === 'object') teams.push(game.won);
    if (game.lost && typeof game.lost === 'object') teams.push(game.lost);
    return teams;
  }

  function getTeamName(teamEntry, season, map) {
    const region = String(teamEntry?.region || '').trim();
    const name = String(teamEntry?.name || '').trim();
    if (region || name) return [region, name].filter(Boolean).join(' ').trim();

    const tid = readNumber(teamEntry?.tid);
    return getTimelineTeamName(map, tid, season, tid === null ? 'Unknown Team' : `TID ${tid}`);
  }

  function getOpponentName(teamEntry, teams, season, map) {
    const opponent = teams.find((candidate) => candidate !== teamEntry);
    return opponent ? getTeamName(opponent, season, map) : '';
  }

  function getGamePlayerName(player, pid, infoByPid) {
    const direct = getPlayerName(player);
    if (direct !== 'Unknown Player') return direct;
    return pid !== null ? infoByPid.get(pid)?.name || 'Unknown Player' : 'Unknown Player';
  }

  function getFeatPlayerName(feat, pid, infoByPid) {
    const direct = getPlayerName(feat);
    if (direct !== 'Unknown Player') return direct;
    return pid !== null ? infoByPid.get(pid)?.name || 'Unknown Player' : 'Unknown Player';
  }

  function getPlayerImage(pid, name, infoByPid, infoByName) {
    if (pid !== null) {
      const byPid = infoByPid.get(pid)?.imgURL;
      if (byPid) return byPid;
    }
    return infoByName.get(String(name || '').toLocaleLowerCase())?.imgURL || '';
  }

  function getPlayerName(player = {}) {
    const direct = typeof player.name === 'string' ? player.name.trim() : '';
    if (direct) return direct;
    const first = typeof player.firstName === 'string' ? player.firstName.trim() : '';
    const last = typeof player.lastName === 'string' ? player.lastName.trim() : '';
    return [first, last].filter(Boolean).join(' ') || 'Unknown Player';
  }

  function readPlayerPointsSafe(player = {}) {
    const value = Number(player.pts ?? player.points ?? player?.stat?.pts ?? player?.stats?.pts);
    return Number.isFinite(value) ? value : undefined;
  }

  function readFeatPoints(feat = {}) {
    const candidates = [
      feat?.pts,
      feat?.points,
      feat?.stat?.pts,
      feat?.stats?.pts,
      feat?.totals?.pts,
    ];

    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value)) return value;
    }

    const textCandidates = [feat?.feats, feat?.description, feat?.text, feat?.type];
    for (const candidate of textCandidates) {
      const text = Array.isArray(candidate) ? candidate.join(' ') : String(candidate || '');
      const match = text.match(/\b(\d+(?:\.\d+)?)\s*(?:points?|pts?)\b/i);
      if (match) return Number(match[1]);
    }

    return undefined;
  }

  function readGameSeasonSafe(value = {}) {
    return readNumber(value?.season ?? value?.year);
  }

  function readGameIdSafe(value = {}) {
    const gid = value?.gid ?? value?.id;
    return gid === null || gid === undefined ? '' : String(gid);
  }

  function playerSeasonKey(pid, season) {
    return `${pid}:${season}`;
  }

  function resolveHistoricalValue(value, season) {
    if (!Array.isArray(value)) return value;

    let resolved;
    let bestStart = -Infinity;
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue;
      const start = entry.start === null || entry.start === undefined
        ? -Infinity
        : Number(entry.start);
      if (!Number.isFinite(start) && start !== -Infinity) continue;
      if (start <= season && start >= bestStart) {
        resolved = entry.value;
        bestStart = start;
      }
    }
    return resolved;
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

  function normalizeImageUrl(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function formatOne(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(1) : '—';
  }

  function fileSignature(file) {
    return [
      String(file?.name || ''),
      String(Number(file?.size) || 0),
      String(Number(file?.lastModified) || 0),
    ].join('|');
  }

  async function waitForMainLeagueLoad(version) {
    const startedAt = Date.now();
    while (version === fileVersion && Date.now() - startedAt < 90000) {
      const text = statusMessage?.textContent?.trim() || '';
      if (!/^(Loading|Restoring)\s/i.test(text)) return;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  }

  async function waitForPrimaryRecords() {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 90000) {
      const text = rawWrap?.textContent?.trim() || '';
      if (!/^Building scoring records/i.test(text)) return;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
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

  function saveCache(payload) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Could not save adjusted scoring records.', error);
    }
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      console.warn('Could not restore adjusted scoring records.', error);
      return null;
    }
  }

  function normalizeSavedEnvironment(value) {
    if (!value || typeof value !== 'object') return null;
    const currentSeason = readNumber(value.currentSeason);
    const currentLeaguePpg = readNumber(value.currentLeaguePpg);
    const currentGameLength = readNumber(value.currentGameLength);
    if (currentSeason === null || currentLeaguePpg === null || currentGameLength === null) return null;
    return { currentSeason, currentLeaguePpg, currentGameLength };
  }

  function normalizeSavedRecords(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter((record) => record && Number.isFinite(Number(record.adjustedPoints)))
      .slice(0, RECORD_LIMIT)
      .map((record) => ({
        ...record,
        pid: readNumber(record.pid),
        tid: readNumber(record.tid),
        points: Number(record.points) || 0,
        adjustedPoints: Number(record.adjustedPoints) || 0,
        imgURL: normalizeImageUrl(record.imgURL),
      }))
      .sort(compareAdjustedRecords);
  }

  setView('raw');
})();
