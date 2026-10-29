(() => {
  const panel = document.getElementById('homePanel');
  const yearNode = document.getElementById('homeSeason');
  const stageNode = document.getElementById('homeStage');
  const content = document.getElementById('homeStageContent');
  const hub = window.DBLLeagueFileHub;
  const stream = window.DBLLeagueStream;
  if (!panel || !yearNode || !stageNode || !content || !hub || !stream) return;

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

  async function load(file) {
    const token = ++fileVersion;
    activeFile = file;
    yearNode.textContent = '— Season';
    stageNode.textContent = file ? 'Loading season…' : 'No league file loaded';
    content.replaceChildren();
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
      yearNode.textContent = season === null ? 'Season unavailable' : season + ' Season';
      stageNode.textContent = stageName(phase);
      if (phase !== 3 || season === null) return;

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
      await stream.forEachTopLevelArrayItem(file, 'teams', team => {
        const tid = asInteger(team?.tid);
        if (!participating.has(tid)) return;
        const details = teamFromFile(team, season);
        if (details) seasonTeams.set(tid, details);
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
      try {
        await stream.forEachTopLevelArrayItem(file, 'players', player => {
          if (!isCurrent()) return;
          const tid = asInteger(player?.tid);
          if (tid === null || tid < 0 || !participating.has(tid)
              || !hasQualifyingInjury(player, season)) return;
          const count = (injuryCounts.get(tid) || 0) + 1;
          injuryCounts.set(tid, count);
          updateInjuryMarkers(rowsByTeam.get(tid), count);
        });
      } catch (error) {
        // An unavailable/corrupt players collection should not destroy the
        // already successfully rendered playoff bracket.
        if (isCurrent()) console.warn('Could not load Home playoff injury markers.', error);
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