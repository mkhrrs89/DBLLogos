(() => {
  const section = document.getElementById('homeSeasonPreview');
  const mount = document.getElementById('homeSeasonPreviewContent');
  const subtitle = document.getElementById('homeSeasonPreviewSubtitle');
  const hub = window.DBLLeagueFileHub;
  const stream = window.DBLLeagueStream;
  const teamBrand = window.DBLHomeTeamLogo;
  if (!section || !mount || !subtitle || !hub?.subscribe ||
      !stream?.readTopLevelValue || !stream?.forEachTopLevelArrayItem) return;

  let activeFile = null;
  let generation = 0;
  const PRESEASON = 0;
  const REGULAR_SEASON = 1;

  const number = value => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const integer = value => {
    const n = number(value);
    return n !== null && Number.isInteger(n) ? n : null;
  };
  const el = (tag, cls, value) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = String(value);
    return node;
  };
  const nameOf = p => [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim()
    || (typeof p?.name === 'string' && p.name) || 'Unknown player';
  const plain = value => typeof value === 'string' ? value.trim() : '';
  function attribute(value, season, fallback) {
    if (!Array.isArray(value)) return value ?? fallback;
    if (!value.length || !value.every(x => x && typeof x === 'object' && 'value' in x)) {
      return value ?? fallback;
    }
    let chosen = fallback, latest = -Infinity;
    for (const row of value) {
      const start = row.start === undefined || row.start === null ? -Infinity : number(row.start);
      if (start === null || start > season || start < latest) continue;
      latest = start;
      chosen = row.value;
    }
    return chosen;
  }
  function seasonRow(team, season) {
    return (Array.isArray(team?.seasons) ? team.seasons : [])
      .find(row => integer(row?.season) === season) || null;
  }
  function teamFromFile(team, season) {
    if (team?.disabled === true) return null;
    const history = Array.isArray(team?.seasons) ? team.seasons : [];
    const row = seasonRow(team, season);
    const latestSeason = Math.max(-Infinity, ...history.map(x => integer(x?.season) ?? -Infinity));
    // During some preseason exports the current season entry has not yet
    // been written. Include franchises that played the preceding season.
    if (!row && latestSeason !== season - 1) return null;
    const prev = seasonRow(team, season - 1);
    const tid = integer(team.tid);
    if (tid === null || tid < 0) return null;
    const region = plain(row?.region) || plain(team.region);
    const nickname = plain(row?.name) || plain(team.name);
    const abbrev = plain(row?.abbrev) || plain(team.abbrev) || 'T' + tid;
    const prevWins = integer(prev?.won), prevLosses = integer(prev?.lost);
    const record = prevWins !== null && prevLosses !== null
      ? prevWins + '-' + prevLosses : '—';
    const gamesPlayed = ['won', 'lost', 'tied', 'otl']
      .reduce((sum, key) => sum + (number(row?.[key]) ?? 0), 0);
    const stat = (Array.isArray(team?.stats) ? team.stats : [])
      .find(s => integer(s?.season) === season && !s?.playoffs);
    const gp = number(stat?.gp) ?? 0;
    return {
      tid, abbrev, name: [region, nickname].filter(Boolean).join(' ') || abbrev,
      logos: teamBrand?.fromTeam(team, season).logos || [],
      prevWins, prevLosses, previousRecord: record, gamesPlayed: Math.max(gamesPlayed, gp),
      players: [], rating: null
    };
  }
  function playerRating(player, season, fuzzAllowed) {
    let selected = null, ratingYear = -Infinity;
    for (const row of Array.isArray(player?.ratings) ? player.ratings : []) {
      const year = integer(row?.season);
      if (year === null || year > season || year < ratingYear) continue;
      selected = row;
      ratingYear = year;
    }
    if (!selected || number(selected.ovr) === null) return null;
    const ovr = Math.max(0, Math.min(100, Math.round(number(selected.ovr) +
      (fuzzAllowed ? number(selected.fuzz) ?? 0 : 0))));
    const pot = number(selected.pot);
    return { ovr, pot, pos: plain(selected.pos) || plain(player.pos) || '—' };
  }
  function rosterOverall(players, playersOnCourt) {
    if (!players.length) return null;
    const ratings = players.slice().sort((a, b) => b.ovr - a.ovr)
      .slice(0, 10).map(p => p.ovr);
    while (ratings.length < 10) ratings.push(0);
    // Same regular-season BBGM OVR calculation already used by Teams.
    let mov = -102.98;
    if (playersOnCourt >= 5) {
      for (let i = 0; i < 10; i++) {
        mov += 0.3334 * Math.exp(-0.1609 * i) * ratings[i];
      }
    } else {
      let index = 0;
      for (let i = 0; i < playersOnCourt; i++) {
        mov += 0.3334 * Math.exp(-0.1609 * i) * ratings[index++];
      }
      for (let i = 5; i < 10; i++) {
        mov += 0.3334 * Math.exp(-0.1609 * i) * ratings[index++];
      }
      mov += 60 * (5 - playersOnCourt) / 5;
    }
    return Math.round(mov * 50 / 15 + 50);
  }
  function photo(player) {
    if (!/^https?:\/\//i.test(player.imgURL || '')) return null;
    const img = el('img', 'home-preview-photo');
    img.alt = '';
    img.width = 42;
    img.height = 54;
    img.style.width = '42px';
    img.style.height = '54px';
    img.style.maxWidth = '42px';
    img.style.maxHeight = '54px';
    img.style.objectFit = 'cover';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.remove());
    img.src = player.imgURL;
    return img;
  }
  function sectionCard(heading, note) {
    const card = el('section', 'home-preview-card');
    card.appendChild(el('h4', '', heading));
    if (note) card.appendChild(el('p', 'home-preview-small', note));
    return card;
  }
  function metric(value, label) {
    const result = el('div', 'home-preview-metric');
    result.appendChild(el('strong', '', value));
    result.appendChild(el('span', '', label));
    return result;
  }
  function playerEntry(player, subtitleText) {
    const row = el('li', 'home-preview-person');
    const image = photo(player);
    if (image) row.appendChild(image);
    const desc = el('div', 'home-preview-person-content');
    desc.appendChild(el('strong', '', player.name));
    const line = el('span', 'home-preview-player-meta');
    if (teamBrand) line.appendChild(teamBrand.logo(player));
    line.appendChild(el('span', '', subtitleText));
    desc.appendChild(line);
    row.appendChild(desc);
    return row;
  }
  function render(data) {
    const { season, phase, teams, stars, breakouts, newcomers, lastYear, games, onCourt } = data;
    subtitle.textContent = season + ' · ' +
      (phase === PRESEASON ? 'Preseason scouting report' : 'Opening night · No games played');
    const fragment = document.createDocumentFragment();
    const summary = el('div', 'home-preview-summary');
    summary.appendChild(metric(String(teams.length), 'Active teams'));
    summary.appendChild(metric(String(Math.min(6, stars.length)), 'Featured players'));
    summary.appendChild(metric(games === null ? '—' : String(games), 'Scheduled games per team'));
    summary.appendChild(metric('0', 'Games played'));
    fragment.appendChild(summary);

    const layout = el('div', 'home-preview-grid');
    const topTeams = teams.filter(t => t.rating !== null);
    const contenders = sectionCard('Preseason Favorites',
      'Top five rosters by current regular-season team OVR. Rankings are projections, not guaranteed results.');
    if (!topTeams.length) contenders.appendChild(el('p', 'home-preview-empty', 'Roster ratings are not available.'));
    else {
      const ol = el('ol', 'home-preview-contenders');
      for (const team of topTeams.slice(0, 5)) {
        const row = el('li', 'home-preview-contender');
        const details = el('div');
        details.appendChild(teamBrand
          ? teamBrand.inline(team, team.name, 'home-preview-team-name')
          : el('strong', 'home-preview-team-name', team.name));
        const leader = team.players[0];
        details.appendChild(el('span', 'home-preview-muted',
          'Last season: ' + team.previousRecord +
          (leader ? ' · Led by ' + leader.name : '')));
        row.appendChild(details);
        row.appendChild(el('strong', 'home-preview-team-rating', 'OVR ' + team.rating));
        ol.appendChild(row);
      }
      contenders.appendChild(ol);
    }
    layout.appendChild(contenders);

    const players = sectionCard('Players to Watch', 'Highest-rated current players across the league.');
    if (!stars.length) players.appendChild(el('p', 'home-preview-empty', 'Current player ratings are unavailable.'));
    else {
      const ol = el('ol', 'home-preview-players');
      for (const p of stars.slice(0, 6)) {
        ol.appendChild(playerEntry(p, p.team + ' · ' + p.pos + ' · OVR ' +
          p.ovr + (p.pot !== null ? ' · POT ' + p.pot : '')));
      }
      players.appendChild(ol);
    }
    layout.appendChild(players);

    const rankings = sectionCard('Full League Power Rankings',
      'Sorted by present-day roster strength; last season’s record is shown for context.');
    const scroll = el('div', 'home-preview-table-scroll');
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', 'Preseason team power rankings');
    const table = el('table', 'home-preview-table');
    const head = el('thead'), headRow = el('tr');
    for (const h of ['#', 'Team', 'Roster OVR', 'Last season', 'Top two players']) {
      const th = el('th', '', h);
      th.scope = 'col';
      headRow.appendChild(th);
    }
    head.appendChild(headRow);
    table.appendChild(head);
    const body = el('tbody');
    for (const [i, team] of teams.entries()) {
      const tr = el('tr');
      for (const [j, value] of [
        i + 1, team.name, team.rating ?? '—',
        team.previousRecord, team.players.slice(0, 2).map(p => p.name).join(' / ') || '—'
      ].entries()) {
        const cell = el('td', j === 1 ? 'home-preview-table-team' : '');
        if (j === 1 && teamBrand) cell.appendChild(teamBrand.inline(team, value));
        else cell.textContent = String(value);
        tr.appendChild(cell);
      }
      body.appendChild(tr);
    }
    table.appendChild(body);
    scroll.appendChild(table);
    rankings.appendChild(scroll);
    layout.appendChild(rankings);

    const rising = sectionCard('Breakout Candidates',
      'Young players (24 or under) with strong upside based on current potential ratings.');
    if (!breakouts.length) rising.appendChild(el('p', 'home-preview-empty',
      'No young players meet the upside criteria in this export.'));
    else {
      const ol = el('ol', 'home-preview-players');
      for (const p of breakouts.slice(0, 5)) {
        ol.appendChild(playerEntry(p, p.team + ' · Age ' + p.age +
          ' · OVR ' + p.ovr + ' / POT ' + p.pot));
      }
      rising.appendChild(ol);
    }
    layout.appendChild(rising);

    const arrivals = sectionCard('New Faces',
      'Notable recent draftees, trades and free-agent signings recorded in the league file.');
    if (!newcomers.length) arrivals.appendChild(el('p', 'home-preview-empty',
      'No recent roster additions were identified in this export.'));
    else {
      const ol = el('ol', 'home-preview-players');
      for (const p of newcomers.slice(0, 6)) {
        ol.appendChild(playerEntry(p, p.team + ' · ' + p.reason + ' · OVR ' + p.ovr));
      }
      arrivals.appendChild(ol);
    }
    layout.appendChild(arrivals);

    const previous = sectionCard('Last Season’s Pace Setters',
      'Best regular-season records from ' + (season - 1) + '.');
    if (!lastYear.length) previous.appendChild(el('p', 'home-preview-empty',
      'Last season’s standings are unavailable.'));
    else {
      const ol = el('ol', 'home-preview-last-year');
      for (const team of lastYear.slice(0, 5)) {
        const li = el('li');
        li.appendChild(teamBrand
          ? teamBrand.inline(team, team.name)
          : el('strong', '', team.name));
        li.appendChild(el('span', '', team.previousRecord));
        ol.appendChild(li);
      }
      previous.appendChild(ol);
    }
    layout.appendChild(previous);
    fragment.appendChild(layout);
    fragment.appendChild(el('p', 'home-preview-disclaimer',
      'Preview uses the uploaded roster and historical results. Team OVR reflects current talent, not a prediction of wins; ratings and personnel may change before opening night.'));
    mount.replaceChildren(fragment);
  }
  function isNewAddition(player, season) {
    const history = Array.isArray(player.transactions) ? player.transactions : [];
    const currentTid = integer(player.tid);
    const matches = history.filter(row => integer(row?.tid) === currentTid &&
      ((integer(row?.season) === season - 1 && (integer(row?.phase) ?? 0) >= 5) ||
       (integer(row?.season) === season && (integer(row?.phase) ?? 0) <= 1)));
    const priority = { trade: 3, freeagent: 2, draft: 1 };
    const last = matches.reverse().find(row => priority[String(row.type || '').toLowerCase().replace(/[^a-z]/g, '')]);
    if (last) {
      const type = String(last.type || '').toLowerCase().replace(/[^a-z]/g, '');
      return type === 'trade' ? 'Traded in' : type === 'freeagent' ? 'Free-agent signing' : 'Draft pick';
    }
    if ([season - 1, season].includes(integer(player?.draft?.year)) &&
        (integer(player?.draft?.round) ?? 0) > 0) return 'Recent draft pick';
    return null;
  }
  async function load(file) {
    const token = ++generation;
    activeFile = file;
    section.hidden = true;
    mount.replaceChildren();
    if (!file) return;
    const current = () => generation === token && activeFile === file;
    try {
      const attrs = await stream.readTopLevelValue(file, 'gameAttributes') || {};
      if (!current()) return;
      const season = integer(attribute(attrs.season, Infinity));
      const phase = integer(attribute(attrs.phase, season));
      if (season === null || (phase !== PRESEASON && phase !== REGULAR_SEASON)) return;

      const teamsById = new Map();
      await stream.forEachTopLevelArrayItem(file, 'teams', team => {
        if (!current()) return;
        const row = teamFromFile(team, season);
        if (row) teamsById.set(row.tid, row);
      });
      if (!current()) return;
      if (phase === REGULAR_SEASON) {
        // Reject already-started seasons immediately from official W/L/GP.
        // When records are still zero, verify against actual saved game rows
        // so stale standings cannot produce a false "opening night" preview.
        if ([...teamsById.values()].some(t => t.gamesPlayed > 0)) return;
        let played = false;
        await stream.forEachTopLevelArrayItem(file, 'games', game => {
          if (!current() || played) return;
          if (integer(game?.season) === season && !game?.playoffs) played = true;
        });
        if (!current() || played) return;
      }
      section.hidden = false;
      subtitle.textContent = season + ' · Loading season preview…';
      mount.replaceChildren(el('p', 'home-preview-empty', 'Analyzing rosters and offseason storylines…'));
      const users = Array.isArray(attrs.userTids) ? attrs.userTids : [attrs.userTid];
      const fuzzAllowed = !attrs.godMode && users.length <= 1;
      const onCourt = Math.max(1, integer(attribute(attrs.numPlayersOnCourt, season, 5)) ?? 5);
      const games = integer(attribute(attrs.numGames, season));
      const stars = [], breakouts = [], newcomers = [];
      await stream.forEachTopLevelArrayItem(file, 'players', player => {
        if (!current()) return;
        const tid = integer(player?.tid);
        const team = teamsById.get(tid);
        if (!team) return;
        const rating = playerRating(player, season, fuzzAllowed);
        if (!rating) return;
        const born = integer(player?.born?.year);
        const age = born === null ? null : season - born;
        const p = {
          pid: integer(player.pid), name: nameOf(player),
          team: team.abbrev, logos: team.logos, tid, age,
          imgURL: plain(player.imgURL),
          ...rating
        };
        team.players.push(p);
        // Only top 10 roster ratings affect the team OVR calculation.
        team.players.sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name));
        if (team.players.length > 10) team.players.length = 10;
        stars.push(p);
        if (age !== null && age <= 24 && age >= 17 &&
            rating.pot !== null && rating.pot >= 65 && rating.pot - rating.ovr >= 8) {
          breakouts.push(p);
        }
        const reason = isNewAddition(player, season);
        if (reason) newcomers.push({ ...p, reason });
      });
      if (!current()) return;
      const teams = [...teamsById.values()];
      for (const team of teams) team.rating = rosterOverall(team.players, onCourt);
      teams.sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity) ||
        a.name.localeCompare(b.name));
      stars.sort((a, b) => b.ovr - a.ovr || (b.pot ?? 0) - (a.pot ?? 0) ||
        a.name.localeCompare(b.name));
      breakouts.sort((a, b) => b.pot - a.pot || (b.pot - b.ovr) - (a.pot - a.ovr) ||
        a.name.localeCompare(b.name));
      newcomers.sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name));
      const lastYear = teams.filter(t => t.prevWins !== null && t.prevLosses !== null);
      lastYear.sort((a, b) => b.prevWins / Math.max(1, b.prevWins + b.prevLosses) -
        a.prevWins / Math.max(1, a.prevWins + a.prevLosses) ||
        b.prevWins - a.prevWins || a.name.localeCompare(b.name));
      render({ season, phase, teams, stars, breakouts, newcomers, lastYear, games, onCourt });
    } catch (error) {
      if (!current()) return;
      console.warn('Could not build Home season preview.', error);
      // Do not incorrectly display a "0 games played" preview if the
      // current game status could not be verified.
      section.hidden = false;
      subtitle.textContent = 'Season preview unavailable';
      mount.replaceChildren(el('p', 'home-preview-empty',
        'Could not verify the season status or read the preview data from this league file.'));
    }
  }
  hub.subscribe(({ file }) => { void load(file); });
})();