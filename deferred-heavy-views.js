(() => {
  const stream = window.DBLLeagueStream;
  const fileInput = document.getElementById('leagueFile');
  const clearBtn = document.getElementById('clearLeagueFileBtn');
  const hallTabBtn = document.getElementById('hallOfFameTabBtn');
  const recordsTabBtn = document.getElementById('recordsTabBtn');
  const hallWrap = document.getElementById('hallOfFameWrap');
  const recordsWrapEl = document.getElementById('recordsWrap');

  if (!stream || !fileInput) return;

  let pendingFile = null;
  let fileVersion = 0;
  let hallLoadedVersion = 0;
  let recordsLoadedVersion = 0;
  let hallLoadingVersion = 0;
  let recordsLoadingVersion = 0;

  fileInput.addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    fileVersion += 1;
    pendingFile = file && stream.isLargeFile(file) ? file : null;
    hallLoadedVersion = 0;
    recordsLoadedVersion = 0;
    hallLoadingVersion = 0;
    recordsLoadingVersion = 0;
  });

  clearBtn?.addEventListener('click', () => {
    fileVersion += 1;
    pendingFile = null;
    hallLoadedVersion = 0;
    recordsLoadedVersion = 0;
    hallLoadingVersion = 0;
    recordsLoadingVersion = 0;
  });

  hallTabBtn?.addEventListener('click', () => {
    loadHallOfFameForLargeFile();
  });

  recordsTabBtn?.addEventListener('click', () => {
    loadRecordsForLargeFile();
  });

  async function loadHallOfFameForLargeFile() {
    if (!pendingFile || !stream.isLargeFile(pendingFile)) return;
    const version = fileVersion;
    if (hallLoadedVersion === version || hallLoadingVersion === version) return;
    hallLoadingVersion = version;

    showLoading(hallWrap, 'Loading Hall of Fame players...');

    try {
      const hofPlayers = [];

      await stream.forEachTopLevelArrayItem(pendingFile, 'players', (player) => {
        if (player?.hof) hofPlayers.push(player);
      });
      if (!isCurrent(version)) return;

      await stream.forEachTopLevelArrayItem(pendingFile, 'releasedPlayers', (player) => {
        if (player?.hof) hofPlayers.push(player);
      });
      if (!isCurrent(version)) return;

      const gameAttributes = await stream.readTopLevelValue(pendingFile, 'gameAttributes');
      if (!isCurrent(version)) return;

      const hallOfFamePlayers = buildHallOfFamePlayers({
        players: hofPlayers,
        gameAttributes: gameAttributes || {},
      });

      if (!isCurrent(version)) return;
      if (fullTimeline) fullTimeline.hallOfFamePlayers = hallOfFamePlayers;
      if (currentTimeline) currentTimeline.hallOfFamePlayers = hallOfFamePlayers;
      renderHallOfFame(fullTimeline);
      persistCurrentTimeline();
      hallLoadedVersion = version;
    } catch (error) {
      console.error('Could not build Hall of Fame from the large league file.', error);
      showLoading(hallWrap, 'Could not load Hall of Fame data from this file.');
    } finally {
      if (hallLoadingVersion === version) hallLoadingVersion = 0;
    }
  }

  async function loadRecordsForLargeFile() {
    if (!pendingFile || !stream.isLargeFile(pendingFile)) return;
    const version = fileVersion;
    if (recordsLoadedVersion === version || recordsLoadingVersion === version) return;
    recordsLoadingVersion = version;

    showLoading(recordsWrapEl, 'Building scoring records...');

    try {
      const playerMaps = await buildPlayerMapsFromFile(pendingFile, version);
      if (!isCurrent(version)) return;

      const teamNameByTidSeason = buildTeamNameByTidSeason(fullTimeline?.rows || []);
      const records = [];

      await stream.forEachTopLevelArrayItem(pendingFile, 'games', (game) => {
        const teamEntries = getGameTeamEntries(game);
        for (const teamEntry of teamEntries) {
          const players = Array.isArray(teamEntry?.players) ? teamEntry.players : [];
          for (const player of players) {
            const points = readPlayerPoints(player);
            if (!Number.isFinite(points)) continue;

            const pid = readOptionalNumber(player?.pid);
            const playerName = getPlayerGameName(player, playerMaps.nameByPid);
            const imageURL = (pid !== null ? playerMaps.imageByPid.get(pid) : '')
              || playerMaps.imageByName.get(playerName.toLocaleLowerCase())
              || '';

            addScoringRecord(records, {
              points,
              playerName,
              pid,
              tid: Number.isFinite(teamEntry?.tid) ? teamEntry.tid : readOptionalNumber(player?.tid),
              teamName: getTeamGameName(teamEntry, game, teamNameByTidSeason),
              opponentName: getOpponentGameName(teamEntry, teamEntries, game, teamNameByTidSeason),
              season: readGameSeason(game),
              gameType: game?.playoffs ? 'Playoffs' : 'Regular season',
              gid: readGameId(game),
              imgURL: imageURL,
            });
          }
        }
      });
      if (!isCurrent(version)) return;

      const seenExact = new Set(records.map(getRecordIdentity).filter(Boolean));
      const seenFallback = new Set(records.map(getRecordFallbackSignature));

      await stream.forEachTopLevelArrayItem(pendingFile, 'playerFeats', (feat) => {
        const points = readFeatPoints(feat);
        if (!Number.isFinite(points)) return;

        const pid = readOptionalNumber(feat?.pid);
        const directName = getRosterPlayerName(feat);
        const playerName = directName !== 'Unknown Player'
          ? directName
          : pid === null
            ? 'Unknown Player'
            : playerMaps.nameByPid.get(pid) || 'Unknown Player';
        const tid = readOptionalNumber(feat?.tid);
        const oppTid = readOptionalNumber(feat?.oppTid ?? feat?.opponentTid);
        const season = readGameSeason(feat);
        const record = {
          points,
          playerName,
          pid,
          tid,
          teamName: getTimelineTeamName(teamNameByTidSeason, tid, season),
          opponentName: getTimelineTeamName(teamNameByTidSeason, oppTid, season, ''),
          season,
          gameType: feat?.playoffs ? 'Playoffs' : 'Regular season',
          gid: readGameId(feat),
          imgURL: (pid !== null ? playerMaps.imageByPid.get(pid) : '')
            || playerMaps.imageByName.get(playerName.toLocaleLowerCase())
            || normalizeLogoUrl(feat?.imgURL || ''),
        };

        const exact = getRecordIdentity(record);
        const fallback = getRecordFallbackSignature(record);
        if ((exact && seenExact.has(exact)) || (!exact && seenFallback.has(fallback))) return;
        if (exact) seenExact.add(exact);
        seenFallback.add(fallback);
        addScoringRecord(records, record);
      });
      if (!isCurrent(version)) return;

      const normalized = normalizeScoringRecords(records);
      if (fullTimeline) fullTimeline.scoringRecords = normalized;
      if (currentTimeline) currentTimeline.scoringRecords = normalized;
      renderRecords(fullTimeline);
      persistCurrentTimeline();
      recordsLoadedVersion = version;
    } catch (error) {
      console.error('Could not build scoring records from the large league file.', error);
      showLoading(recordsWrapEl, 'Could not load scoring records from this file.');
    } finally {
      if (recordsLoadingVersion === version) recordsLoadingVersion = 0;
    }
  }

  async function buildPlayerMapsFromFile(file, version) {
    const imageByPid = new Map();
    const imageByName = new Map();
    const nameByPid = new Map();

    const ingest = (player) => {
      const pid = readOptionalNumber(player?.pid);
      const playerName = getRosterPlayerName(player);
      const imageURL = normalizeLogoUrl(player?.imgURL || '');

      if (pid !== null && playerName !== 'Unknown Player') {
        nameByPid.set(pid, playerName);
      }
      if (!imageURL) return;
      if (pid !== null && !imageByPid.has(pid)) imageByPid.set(pid, imageURL);
      if (playerName !== 'Unknown Player') {
        const key = playerName.toLocaleLowerCase();
        if (!imageByName.has(key)) imageByName.set(key, imageURL);
      }
    };

    await stream.forEachTopLevelArrayItem(file, 'players', ingest);
    if (!isCurrent(version)) return { imageByPid, imageByName, nameByPid };
    await stream.forEachTopLevelArrayItem(file, 'releasedPlayers', ingest);
    return { imageByPid, imageByName, nameByPid };
  }

  function readFeatPoints(feat = {}) {
    const candidates = [
      feat.pts,
      feat.points,
      feat?.stat?.pts,
      feat?.stats?.pts,
      feat?.totals?.pts,
    ];
    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value)) return value;
    }
    return undefined;
  }

  function getTimelineTeamName(map, tid, season, fallback = 'Unknown Team') {
    if (tid === null || tid === undefined) return fallback;
    if (Number.isFinite(season)) {
      const exact = map.get(buildTidSeasonKey(tid, season));
      if (exact) return exact;
    }
    return `TID ${tid}`;
  }

  function getRecordIdentity(record = {}) {
    const gid = readGameId(record);
    const pid = readOptionalNumber(record?.pid);
    const playerKey = pid === null
      ? String(record?.playerName || '').trim().toLocaleLowerCase()
      : String(pid);
    return gid ? `gid:${gid}|player:${playerKey}|pts:${Number(record?.points)}` : '';
  }

  function getRecordFallbackSignature(record = {}) {
    const pid = readOptionalNumber(record?.pid);
    const playerKey = pid === null
      ? String(record?.playerName || '').trim().toLocaleLowerCase()
      : String(pid);
    const tid = readOptionalNumber(record?.tid);
    const teamKey = tid === null
      ? String(record?.teamName || '').trim().toLocaleLowerCase()
      : String(tid);
    return [
      playerKey,
      Number(record?.season) || '',
      teamKey,
      Number(record?.points),
      String(record?.gameType || ''),
    ].join('|');
  }

  function persistCurrentTimeline() {
    if (!pendingFile || !fullTimeline) return;
    try {
      persistTimeline(pendingFile.name, fullTimeline);
    } catch (error) {
      console.warn('Could not persist deferred large-file view data.', error);
    }
  }

  function showLoading(wrap, message) {
    if (!wrap) return;
    wrap.className = wrap.id === 'recordsWrap' ? 'records-wrap empty-state' : 'hof-wrap empty-state';
    const empty = document.createElement('div');
    empty.className = 'empty-copy';
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    empty.appendChild(paragraph);
    wrap.replaceChildren(empty);
  }

  function isCurrent(version) {
    return version === fileVersion && Boolean(pendingFile);
  }
})();
