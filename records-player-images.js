(() => {
  const originalBuildScoringRecords = buildScoringRecords;
  const originalRenderRecords = renderRecords;
  const RECORD_LIMIT = 50;

  normalizeScoringRecords = function normalizeScoringRecordsToTop50(records) {
    if (!Array.isArray(records)) return [];
    return records.slice().sort(compareScoringRecords).slice(0, RECORD_LIMIT);
  };

  function buildPlayerMaps(league = {}) {
    const imageByPid = new Map();
    const imageByName = new Map();
    const nameByPid = new Map();

    for (const players of getLeaguePlayerCollections(league)) {
      for (const player of players) {
        const pid = readOptionalNumber(player?.pid);
        const playerName = getRosterPlayerName(player);
        const imageURL = normalizeLogoUrl(player?.imgURL || '');

        if (pid !== null && playerName !== 'Unknown Player') {
          nameByPid.set(pid, playerName);
        }

        if (!imageURL) continue;

        if (pid !== null && !imageByPid.has(pid)) {
          imageByPid.set(pid, imageURL);
        }

        if (playerName !== 'Unknown Player') {
          const nameKey = playerName.toLocaleLowerCase();
          if (!imageByName.has(nameKey)) {
            imageByName.set(nameKey, imageURL);
          }
        }
      }
    }

    return { imageByPid, imageByName, nameByPid };
  }

  function getHistoricalFeatCollections(league = {}) {
    return [
      league.playerFeats,
      league.statisticalFeats,
      league.statFeats,
      league.playerStatFeats,
    ].filter(Array.isArray);
  }

  function readHistoricalFeatPoints(feat = {}) {
    const candidates = [
      feat.pts,
      feat.points,
      feat?.stat?.pts,
      feat?.stat?.points,
      feat?.stats?.pts,
      feat?.stats?.points,
      feat?.totals?.pts,
      feat?.totals?.points,
    ];

    for (const candidate of candidates) {
      const points = Number(candidate);
      if (Number.isFinite(points)) return points;
    }

    const textCandidates = [feat.feats, feat.description, feat.text, feat.type];
    for (const candidate of textCandidates) {
      const text = Array.isArray(candidate) ? candidate.join(' ') : String(candidate || '');
      const match = text.match(/\b(\d+(?:\.\d+)?)\s*(?:points?|pts?)\b/i);
      if (match) return Number(match[1]);
    }

    return undefined;
  }

  function findGameById(league = {}, gid = '') {
    if (!gid || !Array.isArray(league.games)) return null;
    return league.games.find((game) => readGameId(game) === String(gid)) || null;
  }

  function findFeatTeamEntry(game, feat = {}) {
    const teamEntries = getGameTeamEntries(game || {});
    const tid = readOptionalNumber(feat?.tid);
    const pid = readOptionalNumber(feat?.pid);

    if (tid !== null) {
      const byTid = teamEntries.find((teamEntry) => readOptionalNumber(teamEntry?.tid) === tid);
      if (byTid) return byTid;
    }

    if (pid !== null) {
      const byPlayer = teamEntries.find((teamEntry) => (
        Array.isArray(teamEntry?.players)
        && teamEntry.players.some((player) => readOptionalNumber(player?.pid) === pid)
      ));
      if (byPlayer) return byPlayer;
    }

    return null;
  }

  function getHistoricalFeatName(feat = {}, nameByPid = new Map()) {
    const directName = getRosterPlayerName(feat);
    if (directName !== 'Unknown Player') return directName;
    const pid = readOptionalNumber(feat?.pid);
    return pid === null ? 'Unknown Player' : nameByPid.get(pid) || 'Unknown Player';
  }

  function getHistoricalFeatTeamName(feat = {}, game, teamEntry, teamNameByTidSeason) {
    const directName = typeof feat.teamName === 'string' ? feat.teamName.trim() : '';
    if (directName) return directName;

    if (teamEntry) {
      return getTeamGameName(teamEntry, game || feat, teamNameByTidSeason);
    }

    const tid = readOptionalNumber(feat?.tid);
    const season = readGameSeason(feat);
    if (tid !== null && season !== null) {
      return teamNameByTidSeason.get(buildTidSeasonKey(tid, season)) || `TID ${tid}`;
    }

    const fallback = typeof feat.team === 'string' ? feat.team.trim() : '';
    return fallback || 'Unknown Team';
  }

  function getRecordIdentity(record = {}) {
    const gid = readGameId(record);
    const pid = readOptionalNumber(record?.pid);
    const playerKey = pid === null
      ? String(record?.playerName || '').trim().toLocaleLowerCase()
      : String(pid);

    if (gid) {
      return `gid:${gid}|player:${playerKey}|pts:${Number(record?.points)}`;
    }

    return '';
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

  function buildHistoricalScoringRecords(league, rows, playerMaps) {
    const records = [];
    const teamNameByTidSeason = buildTeamNameByTidSeason(rows);

    for (const feats of getHistoricalFeatCollections(league)) {
      for (const feat of feats) {
        const points = readHistoricalFeatPoints(feat);
        if (!Number.isFinite(points)) continue;

        const gid = readGameId(feat);
        const game = findGameById(league, gid);
        const teamEntry = findFeatTeamEntry(game, feat);
        const teamEntries = getGameTeamEntries(game || {});
        const playerName = getHistoricalFeatName(feat, playerMaps.nameByPid);
        const pid = readOptionalNumber(feat?.pid);
        const tid = readOptionalNumber(feat?.tid ?? teamEntry?.tid);
        const season = readGameSeason(feat) ?? readGameSeason(game || {});
        const imageURL = playerMaps.imageByPid.get(pid)
          || playerMaps.imageByName.get(playerName.toLocaleLowerCase())
          || normalizeLogoUrl(feat?.imgURL || '');

        records.push({
          points,
          playerName,
          pid,
          tid,
          imgURL: imageURL,
          teamName: getHistoricalFeatTeamName(feat, game, teamEntry, teamNameByTidSeason),
          opponentName: typeof feat.opponentName === 'string' && feat.opponentName.trim()
            ? feat.opponentName.trim()
            : teamEntry
              ? getOpponentGameName(teamEntry, teamEntries, game || feat, teamNameByTidSeason)
              : '',
          season,
          gameType: Boolean(feat?.playoffs ?? game?.playoffs) ? 'Playoffs' : 'Regular season',
          gid,
        });
      }
    }

    return records;
  }

  function mergeScoringRecordSources(boxScoreRecords, featRecords) {
    const merged = boxScoreRecords.map((record) => ({ ...record }));
    const exactKeys = new Set();
    const unmatchedFallbackCounts = new Map();

    for (const record of merged) {
      const identity = getRecordIdentity(record);
      if (identity) exactKeys.add(identity);

      const signature = getRecordFallbackSignature(record);
      unmatchedFallbackCounts.set(signature, (unmatchedFallbackCounts.get(signature) || 0) + 1);
    }

    for (const record of featRecords) {
      const identity = getRecordIdentity(record);
      if (identity) {
        if (exactKeys.has(identity)) continue;
        exactKeys.add(identity);
        merged.push(record);
        continue;
      }

      const signature = getRecordFallbackSignature(record);
      const matchingBoxScoreCount = unmatchedFallbackCounts.get(signature) || 0;
      if (matchingBoxScoreCount > 0) {
        unmatchedFallbackCounts.set(signature, matchingBoxScoreCount - 1);
        continue;
      }

      merged.push(record);
    }

    return normalizeScoringRecords(merged);
  }

  buildScoringRecords = function buildScoringRecordsWithImagesAndHistoricalFeats(league, rows) {
    const playerMaps = buildPlayerMaps(league);
    const boxScoreRecords = originalBuildScoringRecords(league, rows).map((record) => {
      const nameKey = String(record?.playerName || '').toLocaleLowerCase();
      return {
        ...record,
        imgURL: playerMaps.imageByPid.get(record?.pid) || playerMaps.imageByName.get(nameKey) || '',
      };
    });
    const featRecords = buildHistoricalScoringRecords(league, rows, playerMaps);
    return mergeScoringRecordSources(boxScoreRecords, featRecords);
  };

  renderRecords = function renderRecordsWithImages(timeline) {
    originalRenderRecords(timeline);

    const records = normalizeScoringRecords(timeline?.scoringRecords);
    const items = recordsWrap?.querySelectorAll('.record-item') || [];

    items.forEach((item, index) => {
      const record = records[index];
      const imageURL = normalizeLogoUrl(record?.imgURL || '');
      const details = item.querySelector('.record-details');
      if (!imageURL || !details) return;

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
      });

      photo.appendChild(image);
      details.prepend(photo);
      details.classList.add('has-player-photo');
      item.classList.add('has-player-photo');
    });
  };

  if (fullTimeline) {
    renderRecords(fullTimeline);
  }
})();
