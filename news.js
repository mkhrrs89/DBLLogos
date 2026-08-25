(() => {
  const stream = window.DBLLeagueStream;
  const tabBtn = document.getElementById('newsTabBtn');
  const panel = document.getElementById('newsPanel');
  const wrap = document.getElementById('newsWrap');
  const fileInput = document.getElementById('leagueFile');
  const clearBtn = document.getElementById('clearLeagueFileBtn');
  const statusMessage = document.getElementById('statusMessage');

  if (!stream || !tabBtn || !panel || !wrap || !fileInput) return;

  const STATS = [
    { key: 'pts', label: 'points', singular: 'point' },
    { key: 'trb', label: 'rebounds', singular: 'rebound' },
    { key: 'ast', label: 'assists', singular: 'assist' },
    { key: 'stl', label: 'steals', singular: 'steal' },
    { key: 'blk', label: 'blocks', singular: 'block' },
  ];
  const NEAR_RATIO = 0.95;
  const CAREER_CHASE_RATIOS = [0.90, 0.95];

  let pendingFile = null;
  let fileVersion = 0;
  let loadedVersion = 0;
  let loadingVersion = 0;
  let items = [];

  tabBtn.addEventListener('click', () => {
    activateTab();
    if (items.length && loadedVersion === fileVersion) {
      render(items);
    } else {
      buildNews();
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
    fileVersion += 1;
    pendingFile = file || null;
    loadedVersion = 0;
    loadingVersion = 0;
    items = [];
    if (!panel.hidden && pendingFile) buildNews();
    else if (!pendingFile) renderEmpty();
  });

  clearBtn?.addEventListener('click', () => {
    fileVersion += 1;
    pendingFile = null;
    loadedVersion = 0;
    loadingVersion = 0;
    items = [];
    renderEmpty();
  });

  function activateTab() {
    document.querySelectorAll('.page > .panel[id]').forEach((section) => {
      if (section !== panel) section.hidden = true;
    });
    document.querySelectorAll('.tab-btn').forEach((button) => {
      button.classList.remove('active');
      button.setAttribute('aria-selected', 'false');
    });
    panel.hidden = false;
    tabBtn.classList.add('active');
    tabBtn.setAttribute('aria-selected', 'true');
  }

  async function buildNews() {
    if (!pendingFile) {
      renderEmpty();
      return;
    }

    const file = pendingFile;
    const version = fileVersion;
    if (loadingVersion === version || loadedVersion === version) return;
    loadingVersion = version;

    try {
      await waitForMainLoad(file.name, version);
      if (!isCurrent(file, version)) return;

      showLoading('Reading player histories…');
      const playerData = await readPlayerHistories(file, version);
      if (!isCurrent(file, version)) return;

      const generated = [];
      generated.push(...buildSeasonAndCareerNews(playerData.rows));

      showLoading('Scanning games for record performances…');
      generated.push(...await buildSingleGameNews(file, version, playerData));
      if (!isCurrent(file, version)) return;

      generated.sort(compareNewsItems);
      items = dedupeItems(generated);
      loadedVersion = version;
      render(items);
    } catch (error) {
      console.error('Could not build record news.', error);
      showLoading('Could not build News from this league file.');
    } finally {
      if (loadingVersion === version) loadingVersion = 0;
    }
  }

  async function waitForMainLoad(fileName, version) {
    if (!statusMessage) return;
    const startedAt = Date.now();
    while (version === fileVersion && Date.now() - startedAt < 90000) {
      const text = statusMessage.textContent || '';
      if (text.startsWith(`Loaded ${fileName}`)) return;
      if (statusMessage.classList.contains('error') && !text.startsWith('Loading ')) return;
      await delay(100);
    }
  }

  async function readPlayerHistories(file, version) {
    const rows = [];
    const nameByPid = new Map();
    const imageByPid = new Map();
    const imageByName = new Map();
    const seenPlayers = new Set();

    await stream.forEachTopLevelArrayItem(file, 'players', (player) => {
      if (!isCurrent(file, version)) return;
      const pid = readOptionalNumber(player?.pid);
      const name = getPlayerName(player);
      const imageURL = normalizeUrl(player?.imgURL || '');
      const playerKey = pid === null
        ? `${name}|${player?.born?.year ?? ''}`
        : `pid:${pid}`;
      if (seenPlayers.has(playerKey)) return;
      seenPlayers.add(playerKey);
      if (pid !== null) {
        nameByPid.set(pid, name);
        if (imageURL) imageByPid.set(pid, imageURL);
      }
      if (imageURL && name !== 'Unknown Player') {
        imageByName.set(name.toLocaleLowerCase(), imageURL);
      }

      const statsRows = (Array.isArray(player?.stats) ? player.stats : [])
        .filter((row) => !row?.playoffs && Number(row?.gp) > 0 && Number.isFinite(Number(row?.season)))
        .slice()
        .sort((a, b) => Number(a.season) - Number(b.season));

      const cumulative = { pts: 0, trb: 0, ast: 0, stl: 0, blk: 0 };
      for (const statRow of statsRows) {
        const values = {};
        for (const stat of STATS) {
          const value = readStat(statRow, stat.key);
          values[stat.key] = Number.isFinite(value) ? value : 0;
          cumulative[stat.key] += values[stat.key];
        }

        rows.push({
          season: Number(statRow.season),
          pid,
          name,
          imgURL: imageURL,
          tid: readOptionalNumber(statRow?.tid),
          pts: values.pts,
          trb: values.trb,
          ast: values.ast,
          stl: values.stl,
          blk: values.blk,
          cPts: cumulative.pts,
          cTrb: cumulative.trb,
          cAst: cumulative.ast,
          cStl: cumulative.stl,
          cBlk: cumulative.blk,
        });
      }
    });

    rows.sort((a, b) => a.season - b.season || a.name.localeCompare(b.name));
    return { rows, nameByPid, imageByPid, imageByName };
  }

  function buildSeasonAndCareerNews(rows) {
    const result = [];
    if (!rows.length) return result;

    const seasonRecords = new Map();
    const careerRecords = new Map();
    const careerMilestones = new Set();
    let index = 0;

    while (index < rows.length) {
      const season = rows[index].season;
      const seasonRows = [];
      while (index < rows.length && rows[index].season === season) {
        seasonRows.push(rows[index]);
        index += 1;
      }

      for (const stat of STATS) {
        buildSeasonRecordItem(result, seasonRows, season, stat, seasonRecords);
        buildCareerRecordItems(result, seasonRows, season, stat, careerRecords, careerMilestones);
      }
    }

    return result;
  }

  function buildSeasonRecordItem(result, seasonRows, season, stat, records) {
    const ranked = seasonRows
      .filter((row) => Number(row[stat.key]) > 0)
      .sort((a, b) => Number(b[stat.key]) - Number(a[stat.key]));
    if (!ranked.length) return;

    const best = ranked[0];
    const value = Number(best[stat.key]);
    const previous = records.get(stat.key);

    if (!previous) {
      records.set(stat.key, { value, name: best.name, season });
      return;
    }

    if (value > previous.value) {
      result.push(makeItem({
        season,
        order: 2_000_000_000,
        type: 'Single-season record',
        headline: `${best.name} set a new single-season ${stat.label} record with ${formatNumber(value)}.`,
        detail: `The previous record was ${formatNumber(previous.value)}, held by ${previous.name} (${previous.season}).`,
        key: `season-record|${season}|${stat.key}|${best.pid ?? best.name}|${value}`,
      }, best));
      records.set(stat.key, { value, name: best.name, season });
      return;
    }

    if (value === previous.value && best.name !== previous.name) {
      result.push(makeItem({
        season,
        order: 1_990_000_000,
        type: 'Single-season record',
        headline: `${best.name} matched the single-season ${stat.label} record at ${formatNumber(value)}.`,
        detail: `${previous.name} first reached that total in ${previous.season}.`,
        key: `season-tie|${season}|${stat.key}|${best.pid ?? best.name}|${value}`,
      }, best));
      return;
    }

    if (previous.value > 0 && value < previous.value && value / previous.value >= NEAR_RATIO) {
      const gap = previous.value - value;
      result.push(makeItem({
        season,
        order: 1_980_000_000,
        type: 'Season record chase',
        headline: `${best.name} came within ${formatGap(gap, stat)} of the single-season ${stat.label} record.`,
        detail: `${best.name} finished with ${formatNumber(value)}; the record remained ${formatNumber(previous.value)} by ${previous.name}.`,
        key: `season-near|${season}|${stat.key}|${best.pid ?? best.name}|${value}`,
      }, best));
    }
  }

  function buildCareerRecordItems(result, seasonRows, season, stat, records, milestoneSet) {
    const careerKey = `c${stat.key[0].toUpperCase()}${stat.key.slice(1)}`;
    const ranked = seasonRows
      .filter((row) => Number(row[careerKey]) > 0)
      .sort((a, b) => Number(b[careerKey]) - Number(a[careerKey]));
    if (!ranked.length) return;

    const best = ranked[0];
    const value = Number(best[careerKey]);
    const previous = records.get(stat.key);

    if (!previous) {
      records.set(stat.key, { value, name: best.name, pid: best.pid, season });
      return;
    }

    if (value > previous.value) {
      const sameHolder = previous.pid !== null && best.pid !== null
        ? previous.pid === best.pid
        : previous.name === best.name;
      result.push(makeItem({
        season,
        order: 1_970_000_000,
        type: 'Career record',
        headline: sameHolder
          ? `${best.name} extended the career ${stat.label} record to ${formatNumber(value)}.`
          : `${best.name} became the career ${stat.label} leader with ${formatNumber(value)}.`,
        detail: sameHolder
          ? `The record stood at ${formatNumber(previous.value)} entering the season.`
          : `${best.name} passed ${previous.name}, whose record was ${formatNumber(previous.value)}.`,
        key: `career-record|${season}|${stat.key}|${best.pid ?? best.name}|${value}`,
      }, best));
      records.set(stat.key, { value, name: best.name, pid: best.pid, season });
    } else if (value === previous.value && best.name !== previous.name) {
      result.push(makeItem({
        season,
        order: 1_960_000_000,
        type: 'Career record',
        headline: `${best.name} tied the career ${stat.label} record at ${formatNumber(value)}.`,
        detail: `${previous.name} had held the mark entering the season.`,
        key: `career-tie|${season}|${stat.key}|${best.pid ?? best.name}|${value}`,
      }, best));
    }

    for (const row of ranked) {
      const rowValue = Number(row[careerKey]);
      if (!(rowValue > 0) || rowValue >= previous.value) continue;
      const ratio = rowValue / previous.value;
      for (const milestone of CAREER_CHASE_RATIOS) {
        if (ratio < milestone) continue;
        const playerKey = row.pid === null ? row.name : String(row.pid);
        const milestoneKey = `${playerKey}|${stat.key}|${milestone}`;
        if (milestoneSet.has(milestoneKey)) continue;
        milestoneSet.add(milestoneKey);
        const pct = Math.round(milestone * 100);
        const gap = previous.value - rowValue;
        result.push(makeItem({
          season,
          order: 1_950_000_000 + pct,
          type: 'Career record chase',
          headline: `${row.name} reached ${pct}% of the career ${stat.label} record.`,
          detail: `${row.name} had ${formatNumber(rowValue)}, ${formatGap(gap, stat)} behind ${previous.name}'s mark of ${formatNumber(previous.value)}.`,
          key: `career-chase|${season}|${stat.key}|${playerKey}|${pct}`,
        }, row));
      }
    }
  }

  async function buildSingleGameNews(file, version, playerData) {
    const result = [];
    const records = new Map();
    let gameCounter = 0;
    let currentSeason = null;
    let nearByStat = new Map();

    const flushNear = () => {
      for (const [statKey, candidate] of nearByStat.entries()) {
        const stat = STATS.find((entry) => entry.key === statKey);
        if (!stat || !candidate) continue;
        const gap = candidate.recordValue - candidate.value;
        result.push(makeItem({
          season: candidate.season,
          order: candidate.order,
          type: 'Single-game record chase',
          headline: `${candidate.name} came within ${formatGap(gap, stat)} of the single-game ${stat.label} record.`,
          detail: `${candidate.name} posted ${formatNumber(candidate.value)}; the record at the time was ${formatNumber(candidate.recordValue)} by ${candidate.recordHolder}.`,
          key: `game-near|${candidate.season}|${stat.key}|${candidate.gid}|${candidate.pid ?? candidate.name}|${candidate.value}`,
        }, candidate));
      }
      nearByStat = new Map();
    };

    await stream.forEachTopLevelArrayItem(file, 'games', (game) => {
      if (!isCurrent(file, version)) return;
      gameCounter += 1;
      const season = readGameSeason(game);
      if (!Number.isFinite(season)) return;
      if (currentSeason !== null && season !== currentSeason) flushNear();
      currentSeason = season;
      const gid = game?.gid ?? game?.id ?? gameCounter;
      const order = readOrder(gid, gameCounter);

      for (const teamEntry of getGameTeams(game)) {
        const players = Array.isArray(teamEntry?.players) ? teamEntry.players : [];
        for (const player of players) {
          const pid = readOptionalNumber(player?.pid);
          const name = getGamePlayerName(player, pid, playerData.nameByPid);
          const tid = readOptionalNumber(teamEntry?.tid ?? player?.tid);
          const playerImageURL = resolvePlayerImage(player, pid, name, playerData);

          for (const stat of STATS) {
            const value = readGameStat(player, stat.key);
            if (!Number.isFinite(value) || value <= 0) continue;
            const previous = records.get(stat.key);

            if (!previous) {
              records.set(stat.key, { value, name, pid, season, gid });
              continue;
            }

            if (value > previous.value) {
              result.push(makeItem({
                season,
                order,
                type: 'Single-game record',
                headline: `${name} set a new single-game ${stat.label} record with ${formatNumber(value)}.`,
                detail: `${teamNameFor(tid, season)}${teamNameFor(tid, season) ? ' · ' : ''}Previous record: ${formatNumber(previous.value)} by ${previous.name}.`,
                key: `game-record|${season}|${stat.key}|${gid}|${pid ?? name}|${value}`,
              }, { name, pid, tid, imgURL: playerImageURL }));
              records.set(stat.key, { value, name, pid, season, gid });
              nearByStat.delete(stat.key);
              continue;
            }

            if (value === previous.value && name !== previous.name) {
              result.push(makeItem({
                season,
                order,
                type: 'Single-game record',
                headline: `${name} tied the single-game ${stat.label} record at ${formatNumber(value)}.`,
                detail: `${previous.name} already shared the mark.`,
                key: `game-tie|${season}|${stat.key}|${gid}|${pid ?? name}|${value}`,
              }, { name, pid, tid, imgURL: playerImageURL }));
              continue;
            }

            if (previous.value > 0 && value < previous.value && value / previous.value >= NEAR_RATIO) {
              const existing = nearByStat.get(stat.key);
              const ratio = value / previous.value;
              if (!existing || ratio > existing.ratio || (ratio === existing.ratio && value > existing.value)) {
                nearByStat.set(stat.key, {
                  season,
                  order,
                  gid,
                  pid,
                  name,
                  tid,
                  imgURL: playerImageURL,
                  value,
                  recordValue: previous.value,
                  recordHolder: previous.name,
                  ratio,
                });
              }
            }
          }
        }
      }
    });

    flushNear();
    return result;
  }

  function makeItem(item, player = {}) {
    return {
      ...item,
      playerName: player?.name || '',
      pid: readOptionalNumber(player?.pid),
      tid: readOptionalNumber(player?.tid),
      playerImageURL: normalizeUrl(player?.imgURL || ''),
    };
  }

  function compareNewsItems(a, b) {
    if (b.season !== a.season) return b.season - a.season;
    if (b.order !== a.order) return b.order - a.order;
    return a.headline.localeCompare(b.headline);
  }

  function dedupeItems(source) {
    const seen = new Set();
    const result = [];
    for (const item of source) {
      if (!item?.key || seen.has(item.key)) continue;
      seen.add(item.key);
      result.push(item);
    }
    return result;
  }

  function render(newsItems) {
    wrap.replaceChildren();
    if (!Array.isArray(newsItems) || !newsItems.length) {
      wrap.className = 'news-wrap empty-state';
      const empty = document.createElement('div');
      empty.className = 'empty-copy';
      const paragraph = document.createElement('p');
      paragraph.textContent = 'No record-related news was found in this league file.';
      empty.appendChild(paragraph);
      wrap.appendChild(empty);
      return;
    }

    wrap.className = 'news-wrap';
    const fragment = document.createDocumentFragment();
    for (const item of newsItems) {
      const article = document.createElement('article');
      article.className = 'news-item';

      const season = document.createElement('div');
      season.className = 'news-season';
      season.textContent = String(item.season);

      const visuals = buildNewsVisuals(item);

      const content = document.createElement('div');
      content.className = 'news-content';

      const type = document.createElement('span');
      type.className = 'news-type';
      type.textContent = item.type;

      const headline = document.createElement('h3');
      headline.className = 'news-headline';
      headline.textContent = item.headline;

      content.append(type, headline);
      if (item.detail) {
        const detail = document.createElement('p');
        detail.className = 'news-detail';
        detail.textContent = item.detail;
        content.appendChild(detail);
      }

      article.append(season, visuals, content);
      fragment.appendChild(article);
    }
    wrap.appendChild(fragment);
  }

  function buildNewsVisuals(item) {
    const visuals = document.createElement('div');
    visuals.className = 'news-visuals';

    const playerPhoto = document.createElement('div');
    playerPhoto.className = 'news-player-photo';
    if (item.playerImageURL) {
      const image = document.createElement('img');
      image.src = item.playerImageURL;
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.alt = item.playerName ? `${item.playerName} portrait` : 'Player portrait';
      playerPhoto.appendChild(image);
    } else {
      playerPhoto.classList.add('is-placeholder');
      const initials = document.createElement('span');
      initials.textContent = getInitials(item.playerName);
      playerPhoto.appendChild(initials);
    }

    const teamLogo = document.createElement('div');
    teamLogo.className = 'news-team-logo';
    const team = teamInfoFor(item.tid, item.season);
    if (team.logoURL) {
      const image = document.createElement('img');
      image.src = team.logoURL;
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.alt = team.name ? `${team.name} logo` : 'Team logo';
      teamLogo.appendChild(image);
    } else {
      teamLogo.classList.add('is-placeholder');
    }

    visuals.append(playerPhoto, teamLogo);
    return visuals;
  }

  function showLoading(message) {
    wrap.className = 'news-wrap empty-state';
    wrap.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'empty-copy';
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    empty.appendChild(paragraph);
    wrap.appendChild(empty);
  }

  function renderEmpty() {
    showLoading('Load or re-upload a league file to generate record news.');
  }

  function readStat(row, key) {
    if (key === 'trb') {
      const direct = Number(row?.trb ?? row?.reb ?? row?.rebounds);
      if (Number.isFinite(direct)) return direct;
      const orb = Number(row?.orb);
      const drb = Number(row?.drb);
      if (Number.isFinite(orb) || Number.isFinite(drb)) {
        return (Number.isFinite(orb) ? orb : 0) + (Number.isFinite(drb) ? drb : 0);
      }
      return undefined;
    }
    const aliases = {
      pts: ['pts', 'points'],
      ast: ['ast', 'assists'],
      stl: ['stl', 'steals'],
      blk: ['blk', 'blocks'],
    };
    for (const field of aliases[key] || [key]) {
      const value = Number(row?.[field]);
      if (Number.isFinite(value)) return value;
    }
    return undefined;
  }

  function readGameStat(player, key) {
    return readStat(player, key);
  }

  function getGameTeams(game = {}) {
    if (Array.isArray(game.teams)) return game.teams;
    const teams = [];
    if (game.won && typeof game.won === 'object') teams.push(game.won);
    if (game.lost && typeof game.lost === 'object') teams.push(game.lost);
    return teams;
  }

  function getPlayerName(player = {}) {
    const direct = typeof player.name === 'string' ? player.name.trim() : '';
    if (direct) return direct;
    const first = typeof player.firstName === 'string' ? player.firstName.trim() : '';
    const last = typeof player.lastName === 'string' ? player.lastName.trim() : '';
    return [first, last].filter(Boolean).join(' ') || 'Unknown Player';
  }

  function getGamePlayerName(player, pid, nameByPid) {
    const direct = getPlayerName(player);
    if (direct !== 'Unknown Player') return direct;
    return pid === null ? direct : nameByPid.get(pid) || direct;
  }

  function resolvePlayerImage(player, pid, name, playerData) {
    const direct = normalizeUrl(player?.imgURL || '');
    if (direct) return direct;
    if (pid !== null) {
      const byPid = normalizeUrl(playerData?.imageByPid?.get(pid) || '');
      if (byPid) return byPid;
    }
    return normalizeUrl(playerData?.imageByName?.get(String(name || '').toLocaleLowerCase()) || '');
  }

  function teamNameFor(tid, season) {
    return teamInfoFor(tid, season).name;
  }

  function teamInfoFor(tid, season) {
    if (tid === null || !Number.isFinite(season)) return { name: '', logoURL: '' };
    try {
      if (typeof fullTimeline === 'undefined' || !Array.isArray(fullTimeline?.rows)) {
        return { name: '', logoURL: '' };
      }
      const row = fullTimeline.rows.find((candidate) => Number(candidate?.tid) === tid);
      if (!row) return { name: '', logoURL: '' };

      let entry = row.entriesByYear instanceof Map ? row.entriesByYear.get(season) : null;
      let logoURL = normalizeUrl(
        entry?.primaryLogoURL || entry?.smallLogoURL || entry?.fallbackLogoURL || '',
      );

      if (!logoURL && row.entriesByYear instanceof Map) {
        let latestYear = -Infinity;
        for (const [year, candidate] of row.entriesByYear.entries()) {
          const numericYear = Number(year);
          if (!Number.isFinite(numericYear) || numericYear > season || numericYear < latestYear) continue;
          const candidateLogo = normalizeUrl(
            candidate?.primaryLogoURL || candidate?.smallLogoURL || candidate?.fallbackLogoURL || '',
          );
          if (!candidateLogo) continue;
          latestYear = numericYear;
          logoURL = candidateLogo;
          if (!entry) entry = candidate;
        }
      }

      return {
        name: typeof entry?.teamName === 'string' ? entry.teamName : row.latestLocation || '',
        logoURL,
      };
    } catch (error) {
      return { name: '', logoURL: '' };
    }
  }

  function getInitials(name) {
    return String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || '?';
  }

  function normalizeUrl(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function readOptionalNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function readGameSeason(game = {}) {
    const season = Number(game?.season ?? game?.year);
    return Number.isFinite(season) ? season : null;
  }

  function readOrder(gid, fallback) {
    const number = Number(gid);
    return Number.isFinite(number) ? number : fallback;
  }

  function formatGap(gap, stat) {
    const rounded = Math.round(gap);
    return `${formatNumber(rounded)} ${rounded === 1 ? stat.singular : stat.label}`;
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return Number.isInteger(number)
      ? number.toLocaleString()
      : number.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  function isCurrent(file, version) {
    return version === fileVersion && file === pendingFile;
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
})();
