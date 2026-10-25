(() => {
  const button = document.getElementById('teamsTabBtn');
  const panel = document.getElementById('teamsPanel');
  const wrap = document.getElementById('teamsCurrentWrap');
  const summary = document.getElementById('teamsCurrentSummary');
  const hub = window.DBLLeagueFileHub;
  const stream = window.DBLLeagueStream;
  const upload = document.getElementById('leagueFile');
  const clearButton = document.getElementById('clearLeagueFileBtn');
  if (!button || !panel || !wrap || !summary || !stream) return;

  let sourceFile = null;
  let version = 0;
  let loadedVersion = -1;
  let loadingVersion = -1;
  let lastData = null;

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = String(content);
    return node;
  }

  function number(value, fallback = 0) {
    const v = Number(value);
    return Number.isFinite(v) ? v : fallback;
  }

  function positiveYear(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function webImage(value) {
    const valueText = text(value);
    return /^https?:\/\/\S+$/i.test(valueText) ? valueText : '';
  }

  function getAttributeForYear(value, year, fallback) {
    if (!Array.isArray(value)) return value ?? fallback;
    let selected = fallback;
    let latest = -Infinity;
    for (const row of value) {
      const start = row?.start == null ? -Infinity : Number(row.start);
      if (!Number.isFinite(start) && start !== -Infinity) continue;
      if (start <= year && start >= latest) {
        latest = start;
        selected = row.value;
      }
    }
    return selected;
  }

  function currentRating(player, year, applyFuzz) {
    const ratings = Array.isArray(player?.ratings) ? player.ratings : [];
    let selected = null;
    let selectedYear = -Infinity;
    // Latest available rating up to the league year; when several rows match,
    // keep the most recent (as Basketball GM does within a season).
    for (const rating of ratings) {
      const ry = positiveYear(rating?.season);
      if (ry === null || ry > year || ry < selectedYear) continue;
      selected = rating;
      selectedYear = ry;
    }
    if (!selected || !Number.isFinite(Number(selected.ovr))) return null;
    const raw = number(selected.ovr);
    const fuzz = applyFuzz ? number(selected.fuzz) : 0;
    return Math.max(0, Math.min(100, Math.round(raw + fuzz)));
  }

  function makeTeam(team, year) {
    const history = Array.isArray(team?.seasons) ? team.seasons : [];
    // Only franchises participating in the selected season.
    const season = history.find((row) => number(row?.season, NaN) === year);
    if (!season || team?.disabled === true) return null;
    const statRows = Array.isArray(team?.stats) ? team.stats : [];
    const stats = statRows.find((row) =>
      number(row?.season, NaN) === year && !row?.playoffs) || {};
    const won = number(season.won);
    const lost = number(season.lost);
    const tied = number(season.tied);
    const otl = number(season.otl);
    const gp = number(stats.gp, won + lost + tied + otl);
    const region = text(season.region) || text(team.region);
    const name = text(season.name) || text(team.name);
    const totalGames = won + lost + tied + otl;
    return {
      tid: number(team.tid, NaN),
      name: (region + ' ' + name).trim() || text(team.abbrev) || 'Unknown Team',
      abbrev: text(season.abbrev) || text(team.abbrev),
      logo: webImage(season.imgURL) || webImage(season.imgURLSmall)
        || webImage(team.imgURL) || webImage(team.imgURLSmall),
      won, lost, tied, otl, gp,
      pct: totalGames > 0 ? (won + tied * 0.5) / totalGames : 0,
      mov: gp > 0 ? (number(stats.pts) - number(stats.oppPts)) / gp : 0,
      lastTen: Array.isArray(season.lastTen) ? season.lastTen : [],
      players: [],
      score: 0,
    };
  }

  function topTenPlayers(players) {
    return players.sort((a, b) => b.ovr - a.ovr || a.pid - b.pid).slice(0, 10);
  }

  function teamOvr(players, playoffs, numPlayersOnCourt) {
    const ovrRatings = topTenPlayers(players.slice()).map((player) => player.ovr);
    while (ovrRatings.length < 10) ovrRatings.push(0);
    const a = playoffs ? 0.6388 : 0.3334;
    const b = playoffs ? -0.2245 : -0.1609;
    const k = playoffs ? 157.43 : 102.98;
    let mov = -k;
    const playersOnCourt = Math.max(1, numPlayersOnCourt);
    if (playersOnCourt >= 5) {
      for (let i = 0; i < 10; i++) mov += a * Math.exp(b * i) * ovrRatings[i];
    } else {
      let index = 0;
      for (let i = 0; i < playersOnCourt; i++) {
        mov += a * Math.exp(b * i) * ovrRatings[index++];
      }
      for (let i = 5; i < 10; i++) {
        mov += a * Math.exp(b * i) * ovrRatings[index++];
      }
      mov += 60 * (5 - playersOnCourt) / 5;
    }
    return Math.round((mov * 50) / 15 + 50 - (playoffs ? 40 : 0));
  }

  function rankTeams(teams, year, attrs) {
    const scheduledGames = Math.max(1, number(getAttributeForYear(attrs?.numGames, year, 82), 82));
    const onCourt = Math.max(1, number(getAttributeForYear(attrs?.numPlayersOnCourt, year, 5), 5));
    const playoffs = number(attrs?.phase, 1) === 3;
    for (const team of teams) {
      const rating = teamOvr(team.players, playoffs, onCourt);
      const winsLastTen = team.lastTen.reduce((sum, result) => sum + (number(result) === 1 ? 1 : 0), 0);
      // ZenGM's power rankings score: MOV weighted by season fraction,
      // roster OVR expressed as expected MOV, and recent-form adjustment.
      team.score = team.mov * team.gp / scheduledGames
        + (rating * .6 - 30) - 10 + 2 * winsLastTen;
      team.players = topTenPlayers(team.players).slice(0, 3);
    }
    return teams.sort((a, b) => b.score - a.score
      || b.pct - a.pct || a.name.localeCompare(b.name));
  }

  function makeImage(url, alt, className, fallback) {
    const box = el('div', className);
    const fallbackNode = el('span', null, fallback);
    box.appendChild(fallbackNode);
    if (!url) return box;
    const image = document.createElement('img');
    image.alt = alt;
    image.loading = 'lazy';
    image.decoding = 'async';
    // Register handlers before setting src, including when the URL is cached.
    image.addEventListener('load', () => { fallbackNode.hidden = true; });
    image.addEventListener('error', () => { image.remove(); fallbackNode.hidden = false; });
    box.appendChild(image);
    image.src = url;
    if (image.complete && image.naturalWidth > 0) fallbackNode.hidden = true;
    return box;
  }

  function buildPlayer(player) {
    const card = el('div', 'teams-current-player');
    const initials = player.name.split(/\s+/).map((part) => part[0] || '').slice(0, 2).join('').toUpperCase();
    card.appendChild(makeImage(player.imgURL, '', 'teams-current-photo', initials));
    const details = el('div', 'teams-current-player-details');
    const name = el('div', 'teams-current-player-name', player.name);
    name.title = player.name;
    details.appendChild(name);
    details.appendChild(el('div', 'teams-current-player-rating', 'OVR ' + player.ovr));
    card.appendChild(details);
    return card;
  }

  function render(teams, year) {
    summary.textContent = year + ' season • ' + teams.length + ' teams • Power ranking order';
    if (!teams.length) {
      showMessage('No active teams found for the current season.');
      return;
    }
    const fragment = document.createDocumentFragment();
    teams.forEach((team, index) => {
      const row = el('div', 'teams-current-row');
      row.setAttribute('aria-label', [
        'Rank ' + (index + 1), team.name, team.won + ' wins',
        team.lost + ' losses', (team.pct * 100).toFixed(1) + ' percent',
      ].join(', '));
      row.appendChild(el('span', 'teams-current-rank', index + 1));
      row.appendChild(makeImage(team.logo, '', 'teams-current-logo', team.abbrev || '—'));
      row.appendChild(el('div', 'teams-current-name', team.name));
      const recordSuffix = team.tied ? '-' + team.tied : (team.otl ? '-' + team.otl : '');
      row.appendChild(el('div', 'teams-current-record', team.won + '-' + team.lost + recordSuffix));
      row.appendChild(el('div', 'teams-current-pct', (team.pct * 100).toFixed(1) + '%'));
      const stars = el('div', 'teams-current-stars');
      for (let i = 0; i < 3; i++) {
        if (team.players[i]) stars.appendChild(buildPlayer(team.players[i]));
        else stars.appendChild(el('div', 'teams-current-no-player', '—'));
      }
      row.appendChild(stars);
      fragment.appendChild(row);
    });
    wrap.replaceChildren(fragment);
  }

  function showMessage(message) {
    summary.textContent = '';
    wrap.replaceChildren(el('p', 'teams-current-feedback', message));
  }

  function acceptFile(file) {
    if (file === sourceFile) return;
    sourceFile = file || null;
    version++;
    loadedVersion = -1;
    loadingVersion = -1;
    lastData = null;
    showMessage(file ? 'Open the Teams tab to load current-season rankings.' :
      'Load a league file to see the team power rankings.');
    if (file && !panel.hidden) void load();
  }

  async function load() {
    const file = sourceFile;
    const token = version;
    if (!file) {
      showMessage('Load a league file to see the team power rankings.');
      return;
    }
    if (loadedVersion === token && lastData) {
      render(lastData.teams, lastData.year);
      return;
    }
    if (loadingVersion === token) return;
    loadingVersion = token;
    showMessage('Calculating current-season power rankings…');
    try {
      const attrs = await stream.readTopLevelValue(file, 'gameAttributes') || {};
      if (token !== version) return;
      const year = positiveYear(attrs.season);
      const rawTeams = [];
      let latestYear = -Infinity;
      await stream.forEachTopLevelArrayItem(file, 'teams', (team) => {
        if (token !== version) return;
        const years = Array.isArray(team.seasons) ? team.seasons.map((s) => positiveYear(s?.season)) : [];
        for (const y of years) if (y !== null) latestYear = Math.max(latestYear, y);
        rawTeams.push(team);
      });
      if (token !== version) return;
      const season = year || (Number.isFinite(latestYear) ? latestYear : null);
      if (!season) {
        showMessage('No season information was found in the league file.');
        return;
      }
      const teams = rawTeams.map((team) => makeTeam(team, season)).filter(Boolean);
      const byTid = new Map(teams.map((team) => [team.tid, team]));
      // Only retain each team's 10 highest-rated current players. No need to
      // keep the full player history in memory, even for very large BBGM exports.
      const noFuzz = attrs.godMode === true
        || (Array.isArray(attrs.userTids) && attrs.userTids.length > 1);
      await stream.forEachTopLevelArrayItem(file, 'players', (player) => {
        if (token !== version) return;
        const team = byTid.get(Number(player?.tid));
        if (!team) return;
        const ovr = currentRating(player, season, !noFuzz);
        if (ovr === null) return;
        const pid = number(player?.pid, Infinity);
        const name = text(player.firstName) + ' ' + text(player.lastName);
        team.players.push({
          pid, ovr, name: text(player.name) || name.trim() || 'Unknown Player',
          imgURL: webImage(player.imgURL),
        });
        if (team.players.length > 20) team.players = topTenPlayers(team.players);
      });
      if (token !== version) return;
      lastData = { year: season, teams: rankTeams(teams, season, attrs) };
      loadedVersion = token;
      render(lastData.teams, season);
    } catch (error) {
      if (token !== version) return;
      console.warn('Could not calculate team power rankings.', error);
      showMessage('Could not calculate team power rankings from this file.');
    } finally {
      if (loadingVersion === token) loadingVersion = -1;
    }
  }

  if (hub) hub.subscribe(({ file }) => acceptFile(file));
  else {
    upload?.addEventListener('change', (event) => acceptFile(event.target.files?.[0] || null));
    clearButton?.addEventListener('click', () => acceptFile(null));
  }
  window.addEventListener('dbl:tab-change', (event) => {
    if (event.detail?.tabId === 'teamsTabBtn') void load();
  });
  button.addEventListener('click', () => void load());
})();
