(() => {
  const panel = document.getElementById('homePanel');
  const yearNode = document.getElementById('homeSeason');
  const stageNode = document.getElementById('homeStage');
  const content = document.getElementById('homeStageContent');
  const countNode = document.getElementById('homeSeasonCount');
  const highlights = document.getElementById('homeHighlightsContent');
  const hub = window.DBLLeagueFileHub;
  const stream = window.DBLLeagueStream;
  if (!panel || !yearNode || !countNode || !stageNode || !content
      || !highlights || !hub || !stream) return;

  let activeFile = null;
  let fileVersion = 0;

  function asInteger(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isInteger(n) ? n : null;
  }
  function asText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }
  function stageName(phase) {
    const names = {
      0: 'Preseason', 1: 'Regular Season', 2: 'Trade Deadline',
      3: 'Playoffs', 4: 'Draft Lottery', 5: 'Draft',
      6: 'After Draft', 7: 'Re-sign Players', 8: 'Free Agency'
    };
    return Object.prototype.hasOwnProperty.call(names, phase) ? names[phase] : 'Season';
  }
  function timelineValue(value, season) {
    if (!Array.isArray(value) || !value.length) return value;
    if (!value.every(row => row && typeof row === 'object' && 'value' in row)) return value;
    let selected = null;
    let selectedStart = -Infinity;
    for (const row of value) {
      const start = row.start === null || row.start === undefined ? -Infinity : Number(row.start);
      if (Number.isNaN(start) || start > season || start < selectedStart) continue;
      selected = row.value;
      selectedStart = start;
    }
    return selected;
  }
  function ordinal(number) {
    const suffix = number % 100 >= 11 && number % 100 <= 13
      ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[number % 10] || 'th');
    return number + suffix;
  }
  function seasonNumber(attrs, year) {
    const first = asInteger(attrs?.startingSeason);
    return first !== null && year !== null && year >= first
      ? year - first + 1 : null;
  }
  function bestOfLengths(attrs, season) {
    const value = timelineValue(attrs?.numGamesPlayoffSeries, season);
    if (Array.isArray(value)) return value.map(asInteger).filter(n => n !== null && n > 0);
    const n = asInteger(value);
    return n && n > 0 ? [n] : [];
  }
  function validImage(url) {
    const src = asText(url);
    return /^(https?:\/\/|data:image\/(?:png|jpeg|jpg|webp|gif);base64,)/i.test(src) ? src : '';
  }
  function teamColor(team) {
    const colors = Array.isArray(team?.colors) ? team.colors : [];
    const candidate = asText(colors[0]);
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(candidate) ? candidate : '';
  }
  function textElement(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value == null ? '' : String(value);
    return node;
  }
  function message(text) {
    content.replaceChildren(textElement('p', 'home-message', text));
  }
  function teamFromFile(team, season) {
    const history = Array.isArray(team?.seasons) ? team.seasons : [];
    const row = history.find(s => asInteger(s?.season) === season);
    if (!row) return null;
    const region = asText(row.region) || asText(team.region);
    const nickname = asText(row.name) || asText(team.name);
    const abbrev = asText(row.abbrev) || asText(team.abbrev);
    const name = [region, nickname].filter(Boolean).join(' ') || abbrev || 'Unknown Team';
    const wins = asInteger(row.won);
    const losses = asInteger(row.lost);
    const record = wins !== null && losses !== null ? wins + '-' + losses : '—';
    // Prefer the smaller logo but try other historical URLs if a host/image
    // has gone away. Distinct sources avoid repeating a failed request.
    const logos = [row.imgURLSmall, row.imgURL, team.imgURLSmall, team.imgURL]
      .map(validImage).filter((src, index, urls) => src && urls.indexOf(src) === index);
    return { name, abbrev: abbrev || nickname || '—', record, logos,
      accent: teamColor(row) || teamColor(team) };
  }

  // Only current injuries count. Historical injury entries and ratings from
  // past seasons must not create a playoff availability marker.
  function hasQualifyingInjury(player, season) {
    const injury = player?.injury;
    const gamesRemaining = asInteger(injury?.gamesRemaining);
    if (gamesRemaining === null || gamesRemaining <= 0
        || asText(injury?.type).toLowerCase() === 'healthy') return false;
    const ratings = Array.isArray(player?.ratings) ? player.ratings : [];
    for (let i = ratings.length - 1; i >= 0; i--) {
      if (asInteger(ratings[i]?.season) === season) {
        return Number(ratings[i]?.ovr) > 50;
      }
    }
    return false;
  }

  // A team can appear in multiple playoff rounds: update every occurrence.
  function updateInjuryMarkers(teamRows, count) {
    if (!teamRows || count <= 0) return;
    const description = count + ' injured player' + (count === 1 ? '' : 's')
      + ' with an overall rating above 50';
    for (const row of teamRows) {
      const name = row.querySelector('.home-playoff-name');
      if (!name) continue;
      let marker = name.querySelector('.home-playoff-injuries');
      if (!marker) {
        marker = document.createElement('span');
        marker.className = 'home-playoff-injuries';
        marker.setAttribute('role', 'img');
        name.appendChild(marker);
      }
      marker.textContent = '+'.repeat(count);
      marker.setAttribute('aria-label', description);
      marker.title = description;
    }
  }

  function participantRow(participant, seasonTeams) {
    const tid = asInteger(participant?.tid);
    const team = seasonTeams.get(tid) || {};
    const wins = asInteger(participant?.won);
    const seed = asInteger(participant?.seed);
    const line = document.createElement('div');
    line.className = 'home-playoff-team';
    if (tid !== null && tid >= 0) line.dataset.teamTid = String(tid);
    if (team.accent) line.style.setProperty('--home-team-accent', team.accent);

    const logoFrame = document.createElement('span');
    logoFrame.className = 'home-playoff-logo';
    const placeholder = () => textElement('span', 'home-logo-placeholder',
      (team.abbrev || '?').slice(0, 3));
    const logoSources = Array.isArray(team.logos) ? team.logos : [];
    if (logoSources.length) {
      const logo = document.createElement('img');
      // Decorative: the row itself carries the team name. An empty alt also
      // prevents broken-image text from spilling over nearby matchup rows.
      logo.alt = '';
      logo.loading = 'lazy';
      logo.decoding = 'async';
      logo.referrerPolicy = 'no-referrer';
      let sourceIndex = 0;
      logo.addEventListener('error', () => {
        sourceIndex++;
        if (sourceIndex < logoSources.length) {
          logo.src = logoSources[sourceIndex];
        } else {
          logoFrame.replaceChildren(placeholder());
        }
      });
      logo.src = logoSources[0];
      logoFrame.appendChild(logo);
    } else {
      logoFrame.appendChild(placeholder());
    }
    const info = document.createElement('div');
    info.className = 'home-playoff-team-info';
    const name = textElement('span', 'home-playoff-name',
      (seed === null ? '' : seed + '. ') + (team.abbrev || (tid === null ? 'TBD' : 'T' + tid)));
    name.title = team.name || '';
    const record = textElement('span', 'home-playoff-record', team.record || '—');
    info.append(name, record);
    line.append(logoFrame, info,
      textElement('span', 'home-playoff-wins', wins === null ? '—' : wins));
    return line;
  }

  function matchupCard(matchup, seasonTeams) {
    const card = document.createElement('div');
    card.className = 'home-playoff-matchup';
    card.append(
      participantRow(matchup?.home, seasonTeams),
      participantRow(matchup?.away, seasonTeams)
    );
    return card;
  }
  function roundColumn(matchups, roundIndex, lengths, seasonTeams, label) {
    const column = document.createElement('div');
    column.className = 'home-playoff-round';
    column.setAttribute('aria-label', label);
    const games = document.createElement('div');
    games.className = 'home-playoff-matches';
    for (const matchup of matchups) games.appendChild(matchupCard(matchup, seasonTeams));
    column.appendChild(games);
    const length = lengths[roundIndex] ?? null;
    column.appendChild(textElement('div', 'home-playoff-bestof',
      length ? 'Best of ' + length : ''));
    return column;
  }
  function splitRound(round, firstCids) {
    if (firstCids.length >= 2) {
      const left = [], right = [];
      for (const series of round) {
        const cid = asInteger(series?.home?.cid) ?? asInteger(series?.away?.cid);
        if (cid === firstCids[0]) left.push(series);
        else if (cid === firstCids[1]) right.push(series);
        else if (left.length <= right.length) left.push(series);
        else right.push(series);
      }
      return [left, right];
    }
    const middle = Math.ceil(round.length / 2);
    return [round.slice(0, middle), round.slice(middle)];
  }
  function bracketSideCids(attrs, year, openingRound) {
    const cids = [];
    for (const series of openingRound) {
      const cid = asInteger(series?.home?.cid) ?? asInteger(series?.away?.cid);
      if (cid !== null && !cids.includes(cid)) cids.push(cid);
    }
    if (cids.length < 2) return cids;
    const conferences = timelineValue(attrs?.confs, year);
    if (!Array.isArray(conferences)) return cids;
    const named = (pattern) => conferences.find(conf =>
      cids.includes(asInteger(conf?.cid)) && pattern.test(asText(conf?.name)));
    const west = named(/\b(?:west(?:ern|ward)?|pacific)\b/i);
    const east = named(/\b(?:east(?:ern)?|atlantic)\b/i);
    if (west && east && west.cid !== east.cid) {
      return [asInteger(west.cid), asInteger(east.cid),
        ...cids.filter(cid => cid !== asInteger(west.cid) && cid !== asInteger(east.cid))];
    }
    if (west) return [asInteger(west.cid), ...cids.filter(cid => cid !== asInteger(west.cid))];
    if (east) return [...cids.filter(cid => cid !== asInteger(east.cid)), asInteger(east.cid)];
    return cids;
  }
  function renderBracket(record, attrs, seasonTeams, year) {
    const rounds = Array.isArray(record?.series)
      ? record.series.filter(round => Array.isArray(round) && round.length) : [];
    if (!rounds.length) {
      message('Playoff pairings have not been generated in this league file yet.');
      return;
    }

    const cids = bracketSideCids(attrs, year, rounds[0]);
    const lengths = bestOfLengths(attrs, year);
    const west = document.createElement('div');
    west.className = 'home-bracket-side home-bracket-left';
    const east = document.createElement('div');
    east.className = 'home-bracket-side home-bracket-right';
    const finals = document.createElement('div');
    finals.className = 'home-bracket-finals';
    let hasFinals = false;

    for (let index = 0; index < rounds.length; index++) {
      const round = rounds[index];
      // A single cross-conference matchup is the finals. A one-round
      // single-conference tournament is still displayed as its own bracket.
      const isFinal = index > 0 && round.length === 1
        && cids.length >= 2
        && asInteger(round[0]?.home?.cid) !== asInteger(round[0]?.away?.cid);
      if (isFinal) {
        finals.appendChild(roundColumn(round, index, lengths, seasonTeams, 'Finals'));
        hasFinals = true;
        continue;
      }
      if (cids.length < 2 && round.length === 1) {
        west.appendChild(roundColumn(round, index, lengths, seasonTeams, 'Round ' + (index + 1)));
        continue;
      }
      const [left, right] = splitRound(round, cids);
      if (left.length) west.appendChild(roundColumn(left, index, lengths, seasonTeams, 'Round ' + (index + 1)));
      if (right.length) east.insertBefore(roundColumn(right, index, lengths, seasonTeams, 'Round ' + (index + 1)), east.firstChild);
    }
    const bracket = document.createElement('div');
    bracket.className = 'home-playoff-bracket';
    if (!east.children.length && !hasFinals) bracket.classList.add('home-playoff-one-side');
    bracket.appendChild(west);
    if (hasFinals) bracket.appendChild(finals);
    bracket.appendChild(east);
    content.replaceChildren(bracket);
  }


  // Every highlight is derived from the saved regular-season statistics.
  // Traded players may have multiple rows for one year; aggregate those
  // before ranking them, and never count playoff statistics twice.
  const STAT_KEYS = ['gp', 'pts', 'min', 'ows', 'dws', 'ast', 'blk', 'orb', 'drb', 'stl', 'tp'];
  const CAREER_METRICS = [
    { key: 'ws', label: 'win shares' },
    { key: 'blk', label: 'blocks' },
    { key: 'ast', label: 'assists' }
  ];
  const RECORD_METRICS = [
    { key: 'ppg', label: 'scoring average', unit: 'PPG', digits: 1 },
    { key: 'ws', label: 'win shares', unit: 'WS', digits: 1 },
    { key: 'apg', label: 'assists per game', unit: 'APG', digits: 1 },
    { key: 'rpg', label: 'rebounds per game', unit: 'RPG', digits: 1 },
    { key: 'bpg', label: 'blocks per game', unit: 'BPG', digits: 1 },
    { key: 'spg', label: 'steals per game', unit: 'SPG', digits: 1 },
    { key: 'points', label: 'points scored', unit: 'points', digits: 0 },
    { key: 'assists', label: 'assists', unit: 'assists', digits: 0 },
    { key: 'rebounds', label: 'rebounds', unit: 'rebounds', digits: 0 },
    { key: 'blocks', label: 'blocks', unit: 'blocks', digits: 0 }
  ];
  function emptyStatLine() {
    return { gp: 0, pts: 0, min: 0, ows: 0, dws: 0, ast: 0,
      blk: 0, orb: 0, drb: 0, stl: 0, tp: 0 };
  }
  function seasonMetrics(stats, year, attrs) {
    const games = asInteger(timelineValue(attrs?.numGames, year));
    const eligible = stats.gp >= Math.max(10, Math.ceil((games || 40) / 2));
    const ws = stats.ows + stats.dws;
    return {
      ws, points: stats.pts, assists: stats.ast,
      rebounds: stats.orb + stats.drb, blocks: stats.blk,
      ppg: eligible ? stats.pts / stats.gp : null,
      apg: eligible ? stats.ast / stats.gp : null,
      rpg: eligible ? (stats.orb + stats.drb) / stats.gp : null,
      bpg: eligible ? stats.blk / stats.gp : null,
      spg: eligible ? stats.stl / stats.gp : null,
      ws48: eligible && stats.min > 0 ? ws * 48 / stats.min : null
    };
  }
  function createHighlightCollector(year, attrs) {
    const people = [];
    const historical = new Map();
    const currentRecords = new Map();
    const ws48 = [], scoring = [];
    function offerRecord(bucket, metric, value, person, statsYear) {
      if (!Number.isFinite(value)) return;
      const previous = bucket.get(metric);
      if (!previous || value > previous.value) {
        bucket.set(metric, { value, name: person.name, year: statsYear });
      }
    }
    function addPlayer(player) {
      if (!Array.isArray(player?.stats)) return;
      const seasons = new Map();
      for (const row of player.stats) {
        const statsYear = asInteger(row?.season);
        if (statsYear === null || statsYear > year || row.playoffs || asInteger(row.tid) < 0) continue;
        let stats = seasons.get(statsYear);
        if (!stats) {
          stats = emptyStatLine();
          seasons.set(statsYear, stats);
        }
        for (const key of STAT_KEYS) {
          const value = Number(row[key]);
          if (Number.isFinite(value)) stats[key] += value;
        }
      }
      if (!seasons.size) return;
      const person = {
        pid: asInteger(player.pid),
        name: [asText(player.firstName), asText(player.lastName)].filter(Boolean).join(' ') || 'Unknown player',
        before: { ws: 0, blk: 0, ast: 0 },
        now: { ws: 0, blk: 0, ast: 0 },
        playedThisYear: seasons.has(year)
      };
      for (const [statsYear, stats] of seasons) {
        const numbers = seasonMetrics(stats, statsYear, attrs);
        const bucket = statsYear === year ? currentRecords : historical;
        for (const metric of RECORD_METRICS) {
          offerRecord(bucket, metric.key, numbers[metric.key], person, statsYear);
        }
        if (statsYear < year) {
          person.before.ws += numbers.ws;
          person.before.blk += numbers.blocks;
          person.before.ast += numbers.assists;
        }
        person.now.ws += numbers.ws;
        person.now.blk += numbers.blocks;
        person.now.ast += numbers.assists;
        if (statsYear === year) {
          if (numbers.ws48 !== null) ws48.push({ name: person.name, value: numbers.ws48 });
          if (numbers.ppg !== null) scoring.push({ name: person.name, value: numbers.ppg });
        }
      }
      if (person.pid !== null) people.push(person);
    }
    function careerClimbs() {
      const climbs = [];
      for (const metric of CAREER_METRICS) {
        const byBefore = [...people].sort((a, b) =>
          b.before[metric.key] - a.before[metric.key] || a.pid - b.pid);
        const byNow = [...people].sort((a, b) =>
          b.now[metric.key] - a.now[metric.key] || a.pid - b.pid);
        const oldRanks = new Map(byBefore.map((p, i) => [p.pid, i + 1]));
        const newRanks = new Map(byNow.map((p, i) => [p.pid, i + 1]));
        const climber = byNow.find(p => {
          const rank = newRanks.get(p.pid);
          return p.playedThisYear && rank <= 10 && oldRanks.get(p.pid) > rank;
        });
        if (!climber) continue;
        const oldRank = oldRanks.get(climber.pid), newRank = newRanks.get(climber.pid);
        const passed = byBefore.filter(p =>
          oldRanks.get(p.pid) < oldRank && newRanks.get(p.pid) > newRank);
        // Prefer a notable player who also appeared this season when possible.
        const notable = passed.find(p => p.playedThisYear) || passed[0];
        climbs.push({ name: climber.name, category: metric.label,
          oldRank, newRank, passedName: notable?.name || '',
          others: Math.max(0, passed.length - 1) });
      }
      return climbs;
    }
    function finish() {
      const sortLeaders = rows => rows.sort((a, b) =>
        b.value - a.value || a.name.localeCompare(b.name)).slice(0, 3);
      const records = [];
      for (const metric of RECORD_METRICS) {
        const previous = historical.get(metric.key), current = currentRecords.get(metric.key);
        if (previous && current && current.value > previous.value + 1e-7) {
          records.push({ ...metric, current, previous });
        }
      }
      return { ws48: sortLeaders(ws48), scoring: sortLeaders(scoring),
        climbs: careerClimbs(), records };
    }
    return { addPlayer, finish };
  }
  function createHighlightsColumn(heading) {
    const column = document.createElement('div');
    column.className = 'home-highlights-column';
    if (heading) column.appendChild(textElement('h3', '', heading));
    return column;
  }
  function highlightedName(name) {
    return textElement('strong', 'home-highlights-name', name);
  }
  function addInlineHighlights(column, label, entries) {
    const line = document.createElement('p');
    line.className = 'home-highlights-line';
    line.appendChild(textElement('span', 'home-highlights-label', label + ' '));
    if (!entries.length) {
      line.appendChild(textElement('span', 'home-highlights-empty', 'Not available yet'));
    } else {
      entries.forEach((entry, index) => {
        if (index) line.appendChild(document.createTextNode(', '));
        line.appendChild(highlightedName(entry.name));
        line.appendChild(document.createTextNode(' ' + entry.value));
      });
    }
    column.appendChild(line);
  }
  function addHighlightBullets(column, entries) {
    if (!entries.length) {
      column.appendChild(textElement('p', 'home-highlights-empty', 'No new records to report.'));
      return;
    }
    const list = document.createElement('ul');
    for (const entry of entries) {
      const item = document.createElement('li');
      item.appendChild(highlightedName(entry.name));
      // Names inside milestone/record descriptions get the same treatment
      // as the leading player name; surrounding narrative stays neutral.
      if (Array.isArray(entry.parts)) {
        for (const part of entry.parts) {
          if (part.name !== undefined) item.appendChild(highlightedName(part.name));
          else item.appendChild(document.createTextNode(part.text || ''));
        }
      } else {
        item.appendChild(document.createTextNode(entry.description || ''));
      }
      list.appendChild(item);
    }
    column.appendChild(list);
  }
  function renderHighlights(standings, summary) {
    const sortedTeams = [...standings]
      .filter(team => team.wins !== null && team.losses !== null && team.wins + team.losses > 0)
      .sort((a, b) => (b.wins / (b.wins + b.losses)) - (a.wins / (a.wins + a.losses))
        || b.wins - a.wins || a.abbrev.localeCompare(b.abbrev)).slice(0, 3);
    const left = createHighlightsColumn();
    addInlineHighlights(left, 'Best regular season:',
      sortedTeams.map(t => ({ name: t.abbrev, value: t.wins + '-' + t.losses })));
    addInlineHighlights(left, 'Win Shares / 48 Minutes leaders:',
      summary.ws48.map(p => ({ name: p.name, value: p.value.toFixed(3) + ' WS/48' })));
    addInlineHighlights(left, 'Scoring leaders:',
      summary.scoring.map(p => ({ name: p.name, value: p.value.toFixed(1) + ' ppg' })));

    const middle = createHighlightsColumn('Climbing the charts this year:');
    addHighlightBullets(middle, summary.climbs.map(c => ({
      name: c.name,
      parts: [
        { text: ' moved from No. ' + c.oldRank + ' to No. ' + c.newRank
          + ' all-time in ' + c.category },
        ...(c.passedName ? [
          { text: ', passing ' },
          { name: c.passedName },
          { text: c.others ? ' and ' + c.others
            + ' other' + (c.others === 1 ? '' : 's') : '' }
        ] : []),
        { text: '.' }
      ]
    })));

    const right = createHighlightsColumn('Season records broken:');
    addHighlightBullets(right, summary.records.map(r => ({
      name: r.current.name,
      parts: [
        { text: ' set a new single-season ' + r.label + ' record with '
          + r.current.value.toFixed(r.digits) + ' ' + r.unit + ' (previous: ' },
        { name: r.previous.name },
        { text: ', ' + r.previous.value.toFixed(r.digits)
          + ' in ' + r.previous.year + ').' }
      ]
    })));
    const grid = document.createElement('div');
    grid.className = 'home-highlights-grid';
    grid.append(left, middle, right);
    highlights.replaceChildren(grid);
  }

  async function load(file) {
    const token = ++fileVersion;
    activeFile = file;
    yearNode.textContent = '—';
    countNode.textContent = '— season';
    stageNode.textContent = file ? 'Loading season…' : 'No league file loaded';
    content.replaceChildren();
    highlights.replaceChildren();
    if (file) highlights.appendChild(textElement('p', 'home-highlights-empty', 'Loading season highlights…'));
    if (!file) return;
    if (!stream.readTopLevelValue || !stream.forEachTopLevelArrayItem) {
      stageNode.textContent = 'League reader unavailable';
      return;
    }
    const isCurrent = () => token === fileVersion && activeFile === file;
    try {
      const attrs = await stream.readTopLevelValue(file, 'gameAttributes') || {};
      if (!isCurrent()) return;
      const season = asInteger(attrs.season);
      const phase = asInteger(attrs.phase);
      yearNode.textContent = season === null ? '—' : String(season);
      const nth = seasonNumber(attrs, season);
      countNode.textContent = nth === null ? 'season unavailable' : ordinal(nth) + ' season';
      stageNode.textContent = stageName(phase);
      if (season === null) {
        highlights.replaceChildren(textElement('p', 'home-highlights-empty', 'Season unavailable.'));
        return;
      }
      if (phase !== 3) {
        highlights.replaceChildren(textElement('p', 'home-highlights-empty',
          'Season highlights will appear during the playoffs.'));
        return;
      }

      let seriesRecord = null;
      await stream.forEachTopLevelArrayItem(file, 'playoffSeries', record => {
        if (asInteger(record?.season) === season) seriesRecord = record;
      });
      if (!isCurrent()) return;
      if (!seriesRecord) {
        message('No playoff bracket has been saved for this season yet.');
        return;
      }

      const participating = new Set();
      for (const round of seriesRecord.series || []) {
        if (!Array.isArray(round)) continue;
        for (const matchup of round) {
          for (const side of ['home', 'away']) {
            const tid = asInteger(matchup?.[side]?.tid);
            if (tid !== null) participating.add(tid);
          }
        }
      }
      const seasonTeams = new Map();
      const standings = [];
      await stream.forEachTopLevelArrayItem(file, 'teams', team => {
        const tid = asInteger(team?.tid);
        const details = teamFromFile(team, season);
        if (!details) return;
        const seasonRow = Array.isArray(team.seasons)
          ? team.seasons.find(row => asInteger(row?.season) === season) : null;
        standings.push({ abbrev: details.abbrev,
          wins: asInteger(seasonRow?.won), losses: asInteger(seasonRow?.lost) });
        if (participating.has(tid)) seasonTeams.set(tid, details);
      });
      if (!isCurrent()) return;
      renderBracket(seriesRecord, attrs, seasonTeams, season);

      // Keep the bracket visible while the (potentially large) players array
      // streams. Update the compact + markers as qualifying players arrive.
      const rowsByTeam = new Map();
      for (const row of content.querySelectorAll('.home-playoff-team[data-team-tid]')) {
        const tid = asInteger(row.dataset.teamTid);
        if (!rowsByTeam.has(tid)) rowsByTeam.set(tid, []);
        rowsByTeam.get(tid).push(row);
      }
      const injuryCounts = new Map();
      const collector = createHighlightCollector(season, attrs);
      try {
        await stream.forEachTopLevelArrayItem(file, 'players', player => {
          if (!isCurrent()) return;
          collector.addPlayer(player);
          const tid = asInteger(player?.tid);
          if (tid === null || tid < 0 || !participating.has(tid)
              || !hasQualifyingInjury(player, season)) return;
          const count = (injuryCounts.get(tid) || 0) + 1;
          injuryCounts.set(tid, count);
          updateInjuryMarkers(rowsByTeam.get(tid), count);
        });
        if (isCurrent()) renderHighlights(standings, collector.finish());
      } catch (error) {
        // A damaged players collection must not erase the existing bracket.
        if (isCurrent()) {
          console.warn('Could not load Home season highlights or injury markers.', error);
          highlights.replaceChildren(textElement('p', 'home-highlights-empty',
            'Could not read season highlights from this league file.'));
        }
      }
    } catch (error) {
      if (!isCurrent()) return;
      console.warn('Could not load Home playoff bracket.', error);
      message('Could not read the playoff bracket from this league file.');
    }
  }

  hub.subscribe(({ file }) => { void load(file); });
  window.DBLHome = Object.freeze({ stageName, bestOfLengths });
})();