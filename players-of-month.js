(() => {
  const CACHE_KEY = 'dbl-logo-players-of-month:v1';
  const GAMES_PER_MONTH = 15;
  const MONTH_NAMES = [
    'November',
    'December',
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
  ];

  const tabBtn = document.getElementById('playersOfMonthTabBtn');
  const panel = document.getElementById('playersOfMonthPanel');
  const wrap = document.getElementById('playersOfMonthWrap');
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
  let seasonResults = [];
  let cachedPayload = loadCache();

  tabBtn.addEventListener('click', () => {
    void ensureLoaded();
  });

  window.addEventListener('dbl:tab-change', (event) => {
    if (event.detail?.panelId !== 'playersOfMonthPanel') return;
    void ensureLoaded();
  });

  const acceptLeagueFile = (file) => {
    if (!file || activeFile === file) return;

    activeFile = file;
    fileVersion += 1;
    loadedVersion = -1;
    loadingVersion = -1;
    seasonResults = [];

    const signature = fileSignature(file);
    if (cachedPayload?.signature === signature) {
      seasonResults = normalizeSavedResults(cachedPayload.seasons);
      if (seasonResults.length) {
        loadedVersion = fileVersion;
        if (!panel.hidden) render();
        return;
      }
    }

    if (!panel.hidden) void ensureLoaded();
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
    seasonResults = [];

    try {
      localStorage.removeItem(CACHE_KEY);
      cachedPayload = null;
    } catch (error) {
      console.warn('Could not clear Players of the Month cache.', error);
    }

    renderEmpty('Load a league file to calculate Players of the Month.');
  });

  async function ensureLoaded() {
    const file = activeFile
      || fileHub?.getCurrentFile?.()
      || fileInput?.files?.[0]
      || window.__dblLargeLeagueFile
      || null;

    if (!file) {
      renderEmpty('Load a league file to calculate Players of the Month.');
      return;
    }

    if (loadedVersion === fileVersion && seasonResults.length) {
      render();
      return;
    }

    const version = fileVersion;
    if (loadingVersion === version) return;
    loadingVersion = version;

    renderEmpty('Preparing season month ranges…', true);

    try {
      await waitForMainLeagueLoad(version);
      if (!isCurrent(file, version)) return;

      const seasonProfiles = buildSeasonProfilesFromTimeline();
      if (!seasonProfiles.size) {
        throw new Error('No regular-season history was available.');
      }

      renderEmpty('Matching player names and photos…', true);

      const playerInfoByPid = new Map();
      const playerInfoByName = new Map();
      let playerCount = 0;

      const ingestPlayer = (player) => {
        const pid = readNumber(player?.pid);
        const name = getPlayerName(player);
        const imgURL = normalizeImageUrl(player?.imgURL);
        const pos = getPlayerPosition(player);

        const info = { pid, name, imgURL, pos };
        if (pid !== null) {
          const existing = playerInfoByPid.get(pid);
          if (!existing || (!existing.imgURL && imgURL)) playerInfoByPid.set(pid, info);
        }

        if (name !== 'Unknown Player') {
          const key = name.toLocaleLowerCase();
          const existing = playerInfoByName.get(key);
          if (!existing || (!existing.imgURL && imgURL)) playerInfoByName.set(key, info);
        }
      };

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

      renderEmpty('Calculating monthly regular-season leaders…', true);

      const monthAggregates = new Map();
      const seasonGameIndexes = new Map();
      const seasonHasGames = new Set();

      await stream.forEachTopLevelArrayItem(file, 'games', (game) => {
        if (!isCurrent(file, version)) return;
        if (game?.playoffs) return;

        const season = readNumber(game?.season ?? game?.year);
        if (season === null || !seasonProfiles.has(season)) return;

        const profile = seasonProfiles.get(season);
        const currentIndex = seasonGameIndexes.get(season) || 0;
        const monthIndex = Math.min(
          Math.max(0, profile.monthCount - 1),
          Math.floor(currentIndex / profile.gamesPerLeagueMonth),
        );
        seasonGameIndexes.set(season, currentIndex + 1);
        seasonHasGames.add(season);

        const teamEntries = getGameTeamEntries(game);
        for (const teamEntry of teamEntries) {
          const teamLabel = getTeamLabel(teamEntry, season);
          const players = Array.isArray(teamEntry?.players) ? teamEntry.players : [];

          for (const player of players) {
            if (!playerAppeared(player)) continue;

            const gmsc = calculateGameScore(player);
            if (!Number.isFinite(gmsc)) continue;

            const pid = readNumber(player?.pid);
            const playerName = getGamePlayerName(player, pid, playerInfoByPid);
            const playerKey = pid !== null
              ? `pid:${pid}`
              : `name:${playerName.toLocaleLowerCase()}`;
            const bucketKey = `${season}:${monthIndex}:${playerKey}`;

            const existing = monthAggregates.get(bucketKey) || {
              season,
              monthIndex,
              pid,
              name: playerName,
              gp: 0,
              gmsc: 0,
              pts: 0,
              trb: 0,
              ast: 0,
              stl: 0,
              blk: 0,
              teamCounts: new Map(),
            };

            existing.gp += 1;
            existing.gmsc += gmsc;
            existing.pts += statNumber(player, 'pts');
            existing.trb += readRebounds(player);
            existing.ast += statNumber(player, 'ast');
            existing.stl += statNumber(player, 'stl');
            existing.blk += statNumber(player, 'blk');
            existing.teamCounts.set(teamLabel, (existing.teamCounts.get(teamLabel) || 0) + 1);

            monthAggregates.set(bucketKey, existing);
          }
        }
      });

      if (!isCurrent(file, version)) return;

      const candidatesByMonth = new Map();
      for (const candidate of monthAggregates.values()) {
        const key = `${candidate.season}:${candidate.monthIndex}`;
        const candidates = candidatesByMonth.get(key) || [];
        candidates.push(candidate);
        candidatesByMonth.set(key, candidates);
      }

      seasonResults = Array.from(seasonProfiles.values())
        .sort((a, b) => b.season - a.season)
        .map((profile) => {
          const months = [];

          if (seasonHasGames.has(profile.season)) {
            for (let monthIndex = 0; monthIndex < profile.monthCount; monthIndex += 1) {
              const candidates = candidatesByMonth.get(`${profile.season}:${monthIndex}`) || [];
              const winner = candidates.sort(compareMonthCandidates)[0] || null;
              if (!winner) continue;

              const info = winner.pid !== null
                ? playerInfoByPid.get(winner.pid)
                : playerInfoByName.get(winner.name.toLocaleLowerCase());

              const monthStart = monthIndex * GAMES_PER_MONTH + 1;
              const monthEnd = Math.min(
                profile.averageGamesPerTeam,
                (monthIndex + 1) * GAMES_PER_MONTH,
              );

              months.push({
                month: monthIndex + 1,
                rangeStart: monthStart,
                rangeEnd: Math.max(monthStart, Math.round(monthEnd)),
                pid: winner.pid,
                name: info?.name || winner.name,
                pos: info?.pos || 'UNK',
                imgURL: info?.imgURL || '',
                teamName: getPrimaryTeam(winner.teamCounts),
                gp: winner.gp,
                gmsc: winner.gmsc,
                ppg: safeAverage(winner.pts, winner.gp),
                rpg: safeAverage(winner.trb, winner.gp),
                apg: safeAverage(winner.ast, winner.gp),
                spg: safeAverage(winner.stl, winner.gp),
                bpg: safeAverage(winner.blk, winner.gp),
              });
            }
          }

          return {
            season: profile.season,
            averageGamesPerTeam: profile.averageGamesPerTeam,
            monthCount: profile.monthCount,
            dataAvailable: seasonHasGames.has(profile.season) && months.length > 0,
            months,
          };
        });

      loadedVersion = version;
      cachedPayload = {
        signature: fileSignature(file),
        seasons: seasonResults,
      };
      saveCache(cachedPayload);
      render();
    } catch (error) {
      if (!isCurrent(file, version)) return;
      console.error('Could not build Players of the Month.', error);
      renderEmpty('Could not calculate Players of the Month from this league file.');
    } finally {
      if (loadingVersion === version) loadingVersion = -1;
    }
  }

  function buildSeasonProfilesFromTimeline() {
    const profiles = new Map();
    const rows = typeof fullTimeline !== 'undefined' && Array.isArray(fullTimeline?.rows)
      ? fullTimeline.rows
      : [];

    for (const row of rows) {
      if (!(row?.entriesByYear instanceof Map)) continue;

      for (const [season, entry] of row.entriesByYear.entries()) {
        const year = Number(season);
        if (!Number.isFinite(year)) continue;

        const won = readNumber(entry?.season?.won);
        const lost = readNumber(entry?.season?.lost);
        const games = (won ?? 0) + (lost ?? 0);
        if (!(games > 0)) continue;

        const profile = profiles.get(year) || {
          season: year,
          teamGameTotals: [],
        };
        profile.teamGameTotals.push(games);
        profiles.set(year, profile);
      }
    }

    for (const profile of profiles.values()) {
      const teamCount = profile.teamGameTotals.length;
      const averageGamesPerTeam = profile.teamGameTotals.reduce((sum, value) => sum + value, 0)
        / Math.max(1, teamCount);
      const monthCount = Math.max(1, Math.ceil(averageGamesPerTeam / GAMES_PER_MONTH));
      const gamesPerLeagueMonth = Math.max(1, Math.round(teamCount * GAMES_PER_MONTH / 2));

      profile.teamCount = teamCount;
      profile.averageGamesPerTeam = averageGamesPerTeam;
      profile.monthCount = monthCount;
      profile.gamesPerLeagueMonth = gamesPerLeagueMonth;
    }

    return profiles;
  }

  function compareMonthCandidates(a, b) {
    const gmscDifference = b.gmsc - a.gmsc;
    if (Math.abs(gmscDifference) > 1e-9) return gmscDifference;

    const aAvg = safeAverage(a.gmsc, a.gp);
    const bAvg = safeAverage(b.gmsc, b.gp);
    const avgDifference = bAvg - aAvg;
    if (Math.abs(avgDifference) > 1e-9) return avgDifference;

    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gp !== a.gp) return b.gp - a.gp;
    return a.name.localeCompare(b.name);
  }

  function calculateGameScore(player = {}) {
    const stored = firstFiniteNumber(player?.gmsc, player?.gameScore);
    if (stored !== null) return stored;

    const pts = statNumber(player, 'pts');
    const fg = statNumber(player, 'fg');
    const fga = statNumber(player, 'fga');
    const ft = statNumber(player, 'ft');
    const fta = statNumber(player, 'fta');
    const orb = statNumber(player, 'orb');
    const drb = statNumber(player, 'drb');
    const stl = statNumber(player, 'stl');
    const ast = statNumber(player, 'ast');
    const blk = statNumber(player, 'blk');
    const pf = statNumber(player, 'pf');
    const tov = statNumber(player, 'tov');

    return pts
      + 0.4 * fg
      - 0.7 * fga
      - 0.4 * (fta - ft)
      + 0.7 * orb
      + 0.3 * drb
      + stl
      + 0.7 * ast
      + 0.7 * blk
      - 0.4 * pf
      - tov;
  }

  function playerAppeared(player = {}) {
    const minutes = firstFiniteNumber(player?.min, player?.minutes);
    if (minutes !== null) return minutes > 0;

    return [
      'pts', 'fg', 'fga', 'ft', 'fta', 'orb', 'drb',
      'ast', 'stl', 'blk', 'tov', 'pf',
    ].some((key) => Math.abs(statNumber(player, key)) > 0);
  }

  function statNumber(player, key) {
    const value = Number(player?.[key] ?? player?.stats?.[key] ?? player?.stat?.[key]);
    return Number.isFinite(value) ? value : 0;
  }

  function readRebounds(player) {
    const direct = firstFiniteNumber(player?.trb, player?.reb);
    if (direct !== null) return direct;
    return statNumber(player, 'orb') + statNumber(player, 'drb');
  }

  function render() {
    wrap.replaceChildren();
    wrap.className = 'players-month-wrap';

    if (!seasonResults.length) {
      renderEmpty('No season history was found.');
      return;
    }

    const intro = document.createElement('p');
    intro.className = 'players-month-method';
    intro.textContent = 'Each league month is approximately 15 regular-season games per team. Monthly winners are ranked by total Game Score during that chunk.';
    wrap.appendChild(intro);

    const seasons = document.createElement('div');
    seasons.className = 'players-month-seasons';

    for (const season of seasonResults) {
      seasons.appendChild(buildSeasonSection(season));
    }

    wrap.appendChild(seasons);
  }

  function buildSeasonSection(season) {
    const section = document.createElement('section');
    section.className = 'players-month-season';

    const heading = document.createElement('div');
    heading.className = 'players-month-season-heading';

    const title = document.createElement('h3');
    title.textContent = String(season.season);

    const meta = document.createElement('span');
    meta.textContent = `${formatOne(season.averageGamesPerTeam)} games/team · ${season.monthCount} month${season.monthCount === 1 ? '' : 's'}`;

    heading.append(title, meta);
    section.appendChild(heading);

    if (!season.dataAvailable) {
      const unavailable = document.createElement('p');
      unavailable.className = 'players-month-unavailable';
      unavailable.textContent = 'Monthly game data not retained in this export.';
      section.appendChild(unavailable);
      return section;
    }

    const grid = document.createElement('div');
    grid.className = 'players-month-grid';

    for (const month of season.months) {
      grid.appendChild(buildMonthCard(month));
    }

    section.appendChild(grid);
    return section;
  }

  function buildMonthCard(month) {
    const card = document.createElement('article');
    card.className = 'players-month-card';

    const label = document.createElement('div');
    label.className = 'players-month-label';

    const monthName = document.createElement('strong');
    monthName.textContent = getMonthName(month.month);

    const range = document.createElement('span');
    range.textContent = `≈ team games ${month.rangeStart}–${month.rangeEnd}`;

    label.append(monthName, range);

    const playerRow = document.createElement('div');
    playerRow.className = 'players-month-player';

    const photo = buildPhoto(month);

    const identity = document.createElement('div');
    identity.className = 'players-month-identity';

    const name = document.createElement('strong');
    name.textContent = month.name;

    const meta = document.createElement('span');
    const parts = [month.pos, month.teamName].filter(Boolean);
    if (month.pid !== null && month.pid !== undefined) parts.push(`PID ${month.pid}`);
    meta.textContent = parts.join(' · ');

    identity.append(name, meta);
    playerRow.append(photo, identity);

    const stats = document.createElement('div');
    stats.className = 'players-month-stats';
    stats.append(
      buildStat('GP', month.gp, 0),
      buildStat('PPG', month.ppg, 1),
      buildStat('RPG', month.rpg, 1),
      buildStat('APG', month.apg, 1),
      buildStat('GmSc', month.gmsc, 1),
    );

    card.append(label, playerRow, stats);
    return card;
  }

  function getMonthName(monthNumber) {
    const index = Math.max(0, Number(monthNumber) - 1);
    return MONTH_NAMES[index % MONTH_NAMES.length] || `Month ${monthNumber}`;
  }

  function buildPhoto(player) {
    const photo = document.createElement('div');
    photo.className = 'players-month-photo';

    if (player.imgURL) {
      const image = document.createElement('img');
      image.src = player.imgURL;
      image.alt = `${player.name} portrait`;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => {
        image.remove();
        addPlaceholder(photo, player.name);
      }, { once: true });
      photo.appendChild(image);
    } else {
      addPlaceholder(photo, player.name);
    }

    return photo;
  }

  function addPlaceholder(photo, name) {
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

  function buildStat(label, value, decimals) {
    const item = document.createElement('div');
    item.className = 'players-month-stat';

    const statLabel = document.createElement('span');
    statLabel.textContent = label;

    const statValue = document.createElement('strong');
    const number = Number(value);
    statValue.textContent = Number.isFinite(number)
      ? number.toFixed(decimals)
      : '—';

    item.append(statLabel, statValue);
    return item;
  }

  function getPrimaryTeam(teamCounts) {
    if (!(teamCounts instanceof Map) || !teamCounts.size) return '';

    return Array.from(teamCounts.entries())
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))[0][0];
  }

  function getTeamLabel(teamEntry = {}, season) {
    const region = String(teamEntry?.region || '').trim();
    const name = String(teamEntry?.name || '').trim();
    if (region || name) return [region, name].filter(Boolean).join(' ').trim();

    const tid = readNumber(teamEntry?.tid);
    const rows = typeof fullTimeline !== 'undefined' && Array.isArray(fullTimeline?.rows)
      ? fullTimeline.rows
      : [];
    const row = rows.find((candidate) => Number(candidate?.tid) === tid);
    const entry = row?.entriesByYear instanceof Map ? row.entriesByYear.get(season) : null;
    return entry?.teamName || (tid !== null ? `TID ${tid}` : 'Unknown Team');
  }

  function getGameTeamEntries(game = {}) {
    if (Array.isArray(game.teams)) return game.teams;

    const teams = [];
    if (game.won && typeof game.won === 'object') teams.push(game.won);
    if (game.lost && typeof game.lost === 'object') teams.push(game.lost);
    return teams;
  }

  function getGamePlayerName(player, pid, infoByPid) {
    const direct = getPlayerName(player);
    if (direct !== 'Unknown Player') return direct;
    return pid !== null ? infoByPid.get(pid)?.name || 'Unknown Player' : 'Unknown Player';
  }

  function getPlayerName(player = {}) {
    const direct = typeof player.name === 'string' ? player.name.trim() : '';
    if (direct) return direct;

    const first = typeof player.firstName === 'string' ? player.firstName.trim() : '';
    const last = typeof player.lastName === 'string' ? player.lastName.trim() : '';
    return [first, last].filter(Boolean).join(' ') || 'Unknown Player';
  }

  function getPlayerPosition(player = {}) {
    const ratings = Array.isArray(player?.ratings) ? player.ratings : [];
    for (let index = ratings.length - 1; index >= 0; index -= 1) {
      const pos = String(ratings[index]?.pos || ratings[index]?.position || '').trim().toUpperCase();
      if (pos) return pos;
    }

    return String(player?.pos || player?.position || player?.draft?.pos || 'UNK')
      .trim()
      .toUpperCase() || 'UNK';
  }

  function safeAverage(total, count) {
    return count > 0 ? total / count : 0;
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

  function renderEmpty(message, loading = false) {
    wrap.className = 'players-month-wrap empty-state';
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
    return [
      String(file?.name || ''),
      String(Number(file?.size) || 0),
      String(Number(file?.lastModified) || 0),
    ].join('|');
  }

  function saveCache(payload) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Could not save Players of the Month.', error);
    }
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      console.warn('Could not restore Players of the Month.', error);
      return null;
    }
  }

  function normalizeSavedResults(value) {
    if (!Array.isArray(value)) return [];

    return value
      .filter((season) => season && Number.isFinite(Number(season.season)))
      .map((season) => ({
        season: Number(season.season),
        averageGamesPerTeam: Number(season.averageGamesPerTeam) || 0,
        monthCount: Number(season.monthCount) || 0,
        dataAvailable: Boolean(season.dataAvailable),
        months: Array.isArray(season.months)
          ? season.months.map((month) => ({
              ...month,
              pid: readNumber(month?.pid),
              name: String(month?.name || 'Unknown Player'),
              pos: String(month?.pos || 'UNK'),
              imgURL: normalizeImageUrl(month?.imgURL),
            }))
          : [],
      }))
      .sort((a, b) => b.season - a.season);
  }
})();
