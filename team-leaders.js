(() => {
  const CACHE_KEY = 'dbl-logo-team-leaders:v1';
  const LEADER_LIMIT = 10;
  const STAT_DEFINITIONS = [
    { key: 'pts', title: 'Points', valueLabel: 'PTS' },
    { key: 'trb', title: 'Rebounds', valueLabel: 'REB' },
    { key: 'ast', title: 'Assists', valueLabel: 'AST' },
    { key: 'stl', title: 'Steals', valueLabel: 'STL' },
    { key: 'blk', title: 'Blocks', valueLabel: 'BLK' },
    { key: 'tp', title: '3-Pointers Made', valueLabel: '3PM' },
  ];

  const tabBtn = document.getElementById('teamLeadersTabBtn');
  const panel = document.getElementById('teamLeadersPanel');
  const wrap = document.getElementById('teamLeadersWrap');
  const subtitle = document.getElementById('teamLeadersSubtitle');
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
  let leaders = null;
  let franchise = null;
  let cachedPayload = loadCache();

  tabBtn.addEventListener('click', () => {
    void ensureLoaded();
  });

  window.addEventListener('dbl:tab-change', (event) => {
    if (event.detail?.panelId !== 'teamLeadersPanel') return;
    void ensureLoaded();
  });

  const acceptLeagueFile = (file) => {
    if (!file || activeFile === file) return;

    activeFile = file;
    fileVersion += 1;
    loadedVersion = -1;
    loadingVersion = -1;
    leaders = null;
    franchise = null;

    const signature = fileSignature(file);
    if (cachedPayload?.signature === signature) {
      leaders = normalizeSavedLeaders(cachedPayload.leaders);
      franchise = normalizeSavedFranchise(cachedPayload.franchise);
      if (leaders && franchise) {
        loadedVersion = fileVersion;
        if (!panel.hidden) render();
        return;
      }
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
    leaders = null;
    franchise = null;

    try {
      localStorage.removeItem(CACHE_KEY);
      cachedPayload = null;
    } catch (error) {
      console.warn('Could not clear saved team leaders.', error);
    }

    updateSubtitle(null);
    renderEmpty('Load a league file to calculate Cleveland franchise leaders.');
  });

  async function ensureLoaded() {
    const file = activeFile
      || fileHub?.getCurrentFile?.()
      || fileInput?.files?.[0]
      || window.__dblLargeLeagueFile
      || null;

    if (!file) {
      updateSubtitle(null);
      renderEmpty('Load a league file to calculate Cleveland franchise leaders.');
      return;
    }

    if (loadedVersion === fileVersion && leaders && franchise) {
      render();
      return;
    }

    const version = fileVersion;
    if (loadingVersion === version) return;
    loadingVersion = version;

    renderEmpty('Finding the Cleveland franchise…', true);

    try {
      await waitForMainLeagueLoad(version);
      if (!isCurrent(file, version)) return;

      const cleveland = await findClevelandFranchise(file, version);
      if (!isCurrent(file, version)) return;

      if (!cleveland) {
        updateSubtitle(null);
        renderEmpty('Could not find a Cleveland franchise in this league file.');
        return;
      }

      franchise = cleveland;
      renderEmpty('Calculating Cleveland career leaders…', true);

      const playersByKey = new Map();
      let playerCount = 0;

      await stream.forEachTopLevelArrayItem(file, 'players', (player) => {
        if (!isCurrent(file, version)) return;
        playerCount += 1;
        mergePlayerSummary(playersByKey, player, franchise.tid);
      });

      if (!isCurrent(file, version)) return;

      if (playerCount === 0) {
        for (const key of ['retiredPlayers', 'releasedPlayers', 'freeAgents']) {
          await stream.forEachTopLevelArrayItem(file, key, (player) => {
            if (!isCurrent(file, version)) return;
            mergePlayerSummary(playersByKey, player, franchise.tid);
          });
          if (!isCurrent(file, version)) return;
        }
      }

      leaders = buildLeaderLists(Array.from(playersByKey.values()));
      loadedVersion = version;

      cachedPayload = {
        signature: fileSignature(file),
        franchise,
        leaders,
      };
      saveCache(cachedPayload);
      render();
    } catch (error) {
      if (!isCurrent(file, version)) return;
      console.error('Could not build Cleveland team leaders.', error);
      renderEmpty('Could not calculate Cleveland franchise leaders from this league file.');
    } finally {
      if (loadingVersion === version) loadingVersion = -1;
    }
  }

  async function findClevelandFranchise(file, version) {
    let best = null;

    await stream.forEachTopLevelArrayItem(file, 'teams', (team) => {
      if (!isCurrent(file, version)) return;

      const tid = readOptionalNumber(team?.tid);
      if (tid === null) return;

      const identity = getClevelandIdentity(team);
      if (!identity) return;

      const score = identity.score;
      if (
        !best
        || score > best.score
        || (score === best.score && identity.latestSeason > best.latestSeason)
      ) {
        best = {
          tid,
          score,
          latestSeason: identity.latestSeason,
          region: identity.region || 'Cleveland',
          name: identity.name || String(team?.name || '').trim(),
          abbrev: identity.abbrev || String(team?.abbrev || '').trim(),
        };
      }
    });

    if (!best) return null;

    return {
      tid: best.tid,
      region: best.region || 'Cleveland',
      name: best.name || 'Franchise',
      abbrev: best.abbrev || 'CLE',
      latestSeason: Number.isFinite(best.latestSeason) ? best.latestSeason : null,
    };
  }

  function getClevelandIdentity(team = {}) {
    const identities = [];

    const pushIdentity = (source, fallbackSeason = null) => {
      if (!source || typeof source !== 'object') return;

      const region = String(source.region || '').trim();
      const name = String(source.name || '').trim();
      const abbrev = String(source.abbrev || '').trim().toUpperCase();
      const season = readOptionalNumber(source.season) ?? fallbackSeason;

      const exactRegion = region.toLocaleLowerCase() === 'cleveland';
      const exactAbbrev = abbrev === 'CLE';
      if (!exactRegion && !exactAbbrev) return;

      identities.push({
        region,
        name,
        abbrev,
        season,
        score: (exactRegion ? 100 : 0) + (exactAbbrev ? 10 : 0),
      });
    };

    pushIdentity(team);

    const seasons = Array.isArray(team.seasons) ? team.seasons : [];
    for (const season of seasons) {
      pushIdentity(season);
    }

    if (!identities.length) return null;

    identities.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (Number(b.season) || -Infinity) - (Number(a.season) || -Infinity);
    });

    const best = identities[0];
    const exactRegionMatches = identities.filter(
      (identity) => identity.region.toLocaleLowerCase() === 'cleveland',
    );

    return {
      ...best,
      score: identities.reduce((total, identity) => total + identity.score, 0),
      latestSeason: exactRegionMatches.length
        ? Math.max(...exactRegionMatches.map((identity) => Number(identity.season)).filter(Number.isFinite))
        : (Number.isFinite(Number(best.season)) ? Number(best.season) : -Infinity),
    };
  }

  function mergePlayerSummary(target, player, tid) {
    const summary = buildPlayerSummary(player, tid);
    if (!summary || summary.gp <= 0) return;

    const key = summary.pid !== null
      ? `pid:${summary.pid}`
      : `name:${summary.name}`;

    const existing = target.get(key);
    if (!existing || comparePlayerVersions(summary, existing) < 0) {
      target.set(key, summary);
    }
  }

  function buildPlayerSummary(player = {}, tid) {
    const rows = (Array.isArray(player.stats) ? player.stats : [])
      .filter((row) => (
        !row?.playoffs
        && Number(row?.tid) === Number(tid)
        && Number(row?.gp) > 0
      ));

    if (!rows.length) return null;

    const seasons = rows
      .map((row) => Number(row?.season))
      .filter(Number.isFinite);

    return {
      pid: readOptionalNumber(player.pid),
      name: getPlayerName(player),
      pos: getPlayerPosition(player),
      imgURL: normalizeImageUrl(player.imgURL),
      careerStart: seasons.length ? Math.min(...seasons) : null,
      careerEnd: seasons.length ? Math.max(...seasons) : null,
      gp: sumStat(rows, 'gp'),
      pts: sumStat(rows, 'pts'),
      trb: sumStat(rows, 'trb'),
      ast: sumStat(rows, 'ast'),
      stl: sumStat(rows, 'stl'),
      blk: sumStat(rows, 'blk'),
      tp: sumStat(rows, 'tp'),
      sourceRows: rows.length,
    };
  }

  function buildLeaderLists(players) {
    const result = {};

    for (const stat of STAT_DEFINITIONS) {
      result[stat.key] = players
        .filter((player) => Number.isFinite(player[stat.key]) && player[stat.key] > 0)
        .sort((a, b) => compareLeaders(a, b, stat.key))
        .slice(0, LEADER_LIMIT)
        .map((player) => ({
          pid: player.pid,
          name: player.name,
          pos: player.pos || 'UNK',
          imgURL: player.imgURL,
          careerStart: player.careerStart,
          careerEnd: player.careerEnd,
          gp: player.gp,
          value: player[stat.key],
        }));
    }

    return result;
  }

  function compareLeaders(a, b, stat) {
    const valueDifference = b[stat] - a[stat];
    if (valueDifference !== 0) return valueDifference;
    if (b.gp !== a.gp) return b.gp - a.gp;
    return a.name.localeCompare(b.name);
  }

  function comparePlayerVersions(a, b) {
    if (b.gp !== a.gp) return b.gp - a.gp;
    if (b.pts !== a.pts) return b.pts - a.pts;
    return b.sourceRows - a.sourceRows;
  }

  function sumStat(rows, stat) {
    let total = 0;

    for (const row of rows) {
      let value = Number(row?.[stat]);

      if (!Number.isFinite(value) && stat === 'trb') {
        const orb = Number(row?.orb);
        const drb = Number(row?.drb);
        if (Number.isFinite(orb) || Number.isFinite(drb)) {
          value = (Number.isFinite(orb) ? orb : 0) + (Number.isFinite(drb) ? drb : 0);
        }
      }

      if (Number.isFinite(value)) total += value;
    }

    return total;
  }

  function render() {
    wrap.replaceChildren();

    if (!leaders || !franchise) {
      updateSubtitle(null);
      renderEmpty('Load a league file to calculate Cleveland franchise leaders.');
      return;
    }

    updateSubtitle(franchise);
    wrap.className = 'team-leaders-wrap';

    const grid = document.createElement('div');
    grid.className = 'team-leaders-grid';

    for (const stat of STAT_DEFINITIONS) {
      grid.appendChild(buildLeaderCard(stat, leaders[stat.key] || []));
    }

    wrap.appendChild(grid);
  }

  function buildLeaderCard(stat, entries) {
    const section = document.createElement('section');
    section.className = 'team-leader-card';

    const heading = document.createElement('div');
    heading.className = 'team-leader-heading';

    const title = document.createElement('h3');
    title.textContent = stat.title;

    const label = document.createElement('span');
    label.textContent = stat.valueLabel;

    heading.append(title, label);
    section.appendChild(heading);

    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'team-leader-empty';
      empty.textContent = 'No qualifying players.';
      section.appendChild(empty);
      return section;
    }

    const list = document.createElement('ol');
    list.className = 'team-leader-list';

    entries.forEach((entry, index) => {
      const item = document.createElement('li');
      item.className = 'team-leader-item';

      const rank = document.createElement('span');
      rank.className = 'team-leader-rank';
      rank.textContent = String(index + 1);

      const details = document.createElement('div');
      details.className = 'team-leader-details';

      const photo = buildPlayerPhoto(entry);
      details.appendChild(photo);

      const copy = document.createElement('div');
      copy.className = 'team-leader-copy';

      const name = document.createElement('strong');
      name.textContent = entry.name;

      const meta = document.createElement('span');
      const years = Number.isFinite(entry.careerStart) && Number.isFinite(entry.careerEnd)
        ? `${entry.careerStart}–${entry.careerEnd}`
        : '';
      const metaParts = [entry.pos, years].filter(Boolean);
      if (entry.pid !== null && entry.pid !== undefined) metaParts.push(`PID ${entry.pid}`);
      meta.textContent = metaParts.join(' · ');

      copy.append(name, meta);
      details.appendChild(copy);

      const value = document.createElement('strong');
      value.className = 'team-leader-value';
      value.textContent = formatTotal(entry.value);

      item.append(rank, details, value);
      list.appendChild(item);
    });

    section.appendChild(list);
    return section;
  }

  function buildPlayerPhoto(entry) {
    const photo = document.createElement('div');
    photo.className = 'team-leader-photo';

    const url = normalizeImageUrl(entry.imgURL);
    if (url) {
      const image = document.createElement('img');
      image.src = url;
      image.alt = `${entry.name} portrait`;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => {
        image.remove();
        addPhotoPlaceholder(photo, entry.name);
      }, { once: true });
      photo.appendChild(image);
    } else {
      addPhotoPlaceholder(photo, entry.name);
    }

    return photo;
  }

  function addPhotoPlaceholder(photo, name) {
    photo.classList.add('is-placeholder');
    const initials = document.createElement('span');
    initials.textContent = String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || '?';
    photo.appendChild(initials);
  }

  function updateSubtitle(team) {
    if (!subtitle) return;

    if (!team) {
      subtitle.textContent = 'Top 10 regular-season career totals for the Cleveland franchise.';
      return;
    }

    const name = [team.region, team.name].filter(Boolean).join(' ').trim();
    subtitle.textContent = `Top 10 regular-season career totals for the ${name || 'Cleveland franchise'} (TID ${team.tid}).`;
  }

  function getPlayerName(player = {}) {
    const direct = typeof player.name === 'string' ? player.name.trim() : '';
    if (direct) return direct;

    const first = typeof player.firstName === 'string' ? player.firstName.trim() : '';
    const last = typeof player.lastName === 'string' ? player.lastName.trim() : '';
    return `${first} ${last}`.trim() || 'Unknown Player';
  }

  function getPlayerPosition(player = {}) {
    const ratings = Array.isArray(player.ratings) ? player.ratings : [];
    for (let index = ratings.length - 1; index >= 0; index -= 1) {
      const pos = normalizePosition(ratings[index]?.pos || ratings[index]?.position);
      if (pos) return pos;
    }

    return normalizePosition(player.pos || player.position || player?.draft?.pos) || 'UNK';
  }

  function normalizePosition(value) {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
  }

  function normalizeImageUrl(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function readOptionalNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatTotal(value) {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.round(number).toLocaleString()
      : '0';
  }

  function renderEmpty(message, loading = false) {
    wrap.className = 'team-leaders-wrap empty-state';
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
      console.warn('Could not save team leaders.', error);
    }
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      console.warn('Could not restore saved team leaders.', error);
      return null;
    }
  }

  function normalizeSavedFranchise(value) {
    if (!value || typeof value !== 'object') return null;
    const tid = readOptionalNumber(value.tid);
    if (tid === null) return null;

    return {
      tid,
      region: String(value.region || 'Cleveland'),
      name: String(value.name || 'Franchise'),
      abbrev: String(value.abbrev || 'CLE'),
      latestSeason: readOptionalNumber(value.latestSeason),
    };
  }

  function normalizeSavedLeaders(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const normalized = {};
    let hasAny = false;

    for (const stat of STAT_DEFINITIONS) {
      normalized[stat.key] = Array.isArray(value[stat.key])
        ? value[stat.key].slice(0, LEADER_LIMIT).map((entry) => ({
            ...entry,
            pid: readOptionalNumber(entry?.pid),
            name: String(entry?.name || 'Unknown Player'),
            pos: normalizePosition(entry?.pos) || 'UNK',
            imgURL: normalizeImageUrl(entry?.imgURL),
            value: Number(entry?.value) || 0,
          }))
        : [];
      if (normalized[stat.key].length) hasAny = true;
    }

    return hasAny ? normalized : null;
  }
})();
