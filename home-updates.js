(() => {
  // A compact, persistent digest of consecutive BBGM exports. The old export
  // remains in the normal league-file cache; this stores only comparison data.
  const mount = document.getElementById('homeUpdatesContent');
  const stream = window.DBLLeagueStream;
  const hub = window.DBLLeagueFileHub;
  if (!mount || !stream?.forEachTopLevelArrayItem || !hub?.subscribe) return;

  const DB_NAME = 'dbl-home-update-history';
  const STORE = 'snapshots';
  const KEY = 'latest';
  const BUCKETS = ['playoffs', 'trades', 'moves', 'awards', 'injuries', 'feats', 'news'];
  let generation = 0;
  let dbPromise;
  let memoryState = null;

  const integer = value => value == null || value === '' || !Number.isFinite(Number(value))
    ? null : Math.trunc(Number(value));
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const fingerprint = file => file
    ? [file.name || 'league', file.size || 0, file.lastModified || 0].join('|') : '';
  function node(tag, className, value) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value !== undefined) el.textContent = String(value);
    return el;
  }
  function clearHtml(input) {
    // Event log text contains BBGM navigation HTML. Render plain text only.
    return String(input || '').replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  }
  const teamLabel = (teams, tid) => teams[String(tid)]?.abbrev || ('Team ' + tid);
  function showStatus(text) {
    mount.replaceChildren(node('p', 'home-updates-status', text));
  }
  function startDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { resolve(null); return; }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => {
      console.warn('Could not access Home update history storage.', error);
      return null;
    });
    return dbPromise;
  }
  async function getSaved() {
    const db = await startDb();
    if (!db) return memoryState;
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('Could not read previous Home update history.', error);
      return memoryState;
    }
  }
  async function storeSaved(data, current) {
    if (!current()) return;
    memoryState = data;
    const db = await startDb();
    if (!db || !current()) return;
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(data);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (error) {
      console.warn('Could not save Home update history.', error);
    }
  }
  async function resetSaved(current) {
    memoryState = null;
    const db = await startDb();
    if (!db || !current()) return;
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.warn('Could not clear Home update history.', error);
    }
  }
  function titleForEvent(row, teams, players) {
    const text = clearHtml(row.text);
    if (text) return text;
    const pids = Array.isArray(row.pids) ? row.pids : [];
    const tids = Array.isArray(row.tids) ? row.tids : [];
    const people = pids.map(pid => players[String(pid)] || ('Player ' + pid)).join(', ');
    const clubs = tids.map(tid => teamLabel(teams, tid)).join(' / ');
    if (row.type === 'trade') {
      const exchanged = Array.isArray(row.teams)
        ? row.teams.map((team, i) => {
          const assets = Array.isArray(team.assets) ? team.assets : [];
          const names = assets.map(asset => asset.name ||
            (asset.pid != null ? players[String(asset.pid)] : '') ||
            (asset.dpid != null ? 'a draft pick' : '')).filter(Boolean);
          return names.length ? teamLabel(teams, tids[i]) + ' acquired ' + names.join(', ') : '';
        }).filter(Boolean) : [];
      return exchanged.length ? exchanged.join('; ') + '.' : 'Trade between ' + clubs + '.';
    }
    if (row.type === 'freeAgent') return people + ' signed with ' + clubs + '.';
    if (row.type === 'draft') return clubs + ' selected ' + people + '.';
    if (row.type === 'award') return people + ' received an award.';
    if (row.type === 'release') return clubs + ' released ' + people + '.';
    return [row.type || 'League event', people, clubs].filter(Boolean).join(': ');
  }
  function classifyEvent(type) {
    if (type === 'playoffs' || type === 'madePlayoffs' || type === 'champion') return 'playoffs';
    if (type === 'trade') return 'trades';
    if (['freeAgent', 'release', 'draft', 'retired', 'reSigned', 'resigned', 'waiver'].includes(type)) return 'moves';
    if (['injured', 'healed'].includes(type)) return 'injuries';
    if (type === 'playerFeat') return 'feats';
    if (['award', 'retiredJersey', 'allStar'].includes(type)) return 'awards';
    return 'news';
  }
  function keepTop(rows, row, limit, compare) {
    rows.push(row);
    if (rows.length > limit) {
      rows.sort(compare);
      rows.length = limit;
    }
  }
  function summaryRound(season, record) {
    const round = [];
    for (let i = 0; i < (record?.series || []).length; i++) {
      for (const series of record.series[i] || []) {
        const home = integer(series.home?.tid), away = integer(series.away?.tid);
        if (home === null || away === null) continue;
        round.push({ round: i, home, away,
          hw: integer(series.home?.won) ?? 0,
          aw: integer(series.away?.won) ?? 0 });
      }
    }
    return { season, currentRound: integer(record?.currentRound), series: round };
  }
  function gameSummary(game, teams) {
    const winner = game.won || {}, loser = game.lost || {};
    const win = integer(winner.tid), loss = integer(loser.tid);
    const label = win === null || loss === null ? 'Game ' + (game.gid || '') :
      teamLabel(teams, win) + ' ' + (winner.pts ?? '?') + ' – ' +
      teamLabel(teams, loss) + ' ' + (loser.pts ?? '?');
    const top = [];
    for (const side of game.teams || []) {
      for (const player of side.players || []) {
        if (number(player.pts) >= 30) top.push({ name: player.name || '', pts: number(player.pts) });
      }
    }
    top.sort((a, b) => b.pts - a.pts);
    const overtime = number(game.overtimes);
    const extra = [(game.playoffs ? 'Playoffs' : ''),
      overtime ? (overtime + ' OT') : '',
      top.length ? top[0].name + ' ' + top[0].pts + ' pts' : ''].filter(Boolean);
    return { gid: integer(game.gid), season: integer(game.season),
      label: label + (extra.length ? ' (' + extra.join(' · ') + ')' : ''),
      playoffs: Boolean(game.playoffs),
      margin: Math.abs(number(winner.pts) - number(loser.pts)), overtime };
  }
  function featSummary(feat) {
    const stats = feat.stats || {};
    const pieces = ['pts', 'ast', 'reb', 'blk', 'stl'].map(key => {
      const value = key === 'reb' ? number(stats.orb) + number(stats.drb) : number(stats[key]);
      return value >= (key === 'pts' ? 20 : key === 'reb' ? 10 : key === 'ast' ? 8 : 5)
        ? value + ' ' + key : '';
    }).filter(Boolean);
    const score = number(stats.pts) + number(stats.ast) * 1.5 + number(stats.blk) * 2 +
      number(stats.stl) * 2 + (number(stats.orb) + number(stats.drb));
    return { gid: integer(feat.gid),
      text: (feat.name || 'Player') + (pieces.length ? ': ' + pieces.join(', ') : ' had a notable game'),
      score };
  }

  // Streaming each top-level array avoids parsing the 50MB+ compressed league
  // into one giant object. We only retain compact teams, current rosters,
  // playoff series, and high-water event/game IDs.
  async function capture(file, previous, current, update) {
    const attrs = await stream.readTopLevelValue(file, 'gameAttributes') || {};
    const meta = await stream.readTopLevelValue(file, 'meta') || {};
    if (!current()) return null;
    const season = integer(attrs.season);
    const snapshot = { signature: fingerprint(file),
      leagueName: String(meta.name || '').split('|')[0].trim().toLowerCase(),
      startingSeason: integer(attrs.startingSeason),
      season, phase: integer(attrs.phase),
      teams: {}, players: {}, playoffs: null,
      maxEid: -1, maxGid: -1, capturedAt: new Date().toISOString() };
    const delta = { counts: {}, events: Object.fromEntries(BUCKETS.map(key => [key, []])),
      recentGames: [], feats: [], featCount: 0, gameCount: 0, playoffGames: 0 };
    const lastEid = previous?.maxEid ?? Infinity;
    const lastGid = previous?.maxGid ?? Infinity;
    const collecting = Boolean(previous);

    update('Reading team standings and playoff series…');
    await stream.forEachTopLevelArrayItem(file, 'teams', team => {
      const tid = integer(team.tid);
      if (tid === null) return;
      const row = (team.seasons || []).find(s => integer(s.season) === season);
      if (!row) return;
      snapshot.teams[String(tid)] = {
        abbrev: row.abbrev || team.abbrev || 'T' + tid,
        name: [row.region || team.region, row.name || team.name].filter(Boolean).join(' '),
        won: integer(row.won) ?? 0, lost: integer(row.lost) ?? 0,
        tied: integer(row.tied) ?? 0
      };
    });
    if (!current()) return null;
    await stream.forEachTopLevelArrayItem(file, 'playoffSeries', record => {
      if (integer(record.season) === season) snapshot.playoffs = summaryRound(season, record);
    });
    if (!current()) return null;

    update('Checking league news, trades, awards and transactions…');
    await stream.forEachTopLevelArrayItem(file, 'events', event => {
      const eid = integer(event.eid);
      if (eid === null) return;
      snapshot.maxEid = Math.max(snapshot.maxEid, eid);
      if (!collecting || eid <= lastEid) return;
      const bucket = classifyEvent(event.type);
      delta.counts[bucket] = (delta.counts[bucket] || 0) + 1;
      const item = { eid, type: event.type, text: event.text || '',
        pids: event.pids, tids: event.tids, teams: bucket === 'trades' ? event.teams : undefined,
        score: number(event.score) };
      // Retain a bounded selection of significant and recent stories. The
      // category counts still include every added event, even if truncated.
      keepTop(delta.events[bucket], item, 32,
        (a, b) => b.score - a.score || b.eid - a.eid);
    });
    if (!current()) return null;

    update('Comparing newly played games and notable performances…');
    await stream.forEachTopLevelArrayItem(file, 'games', game => {
      const gid = integer(game.gid);
      if (gid === null) return;
      snapshot.maxGid = Math.max(snapshot.maxGid, gid);
      if (!collecting || gid <= lastGid) return;
      delta.gameCount++;
      if (game.playoffs) delta.playoffGames++;
      const item = gameSummary(game, snapshot.teams);
      keepTop(delta.recentGames, item, 24,
        (a, b) => Number(b.playoffs) - Number(a.playoffs) ||
          Number(b.overtime > 0) - Number(a.overtime > 0) ||
          a.margin - b.margin || b.gid - a.gid);
    });
    if (!current()) return null;
    if (collecting) {
      await stream.forEachTopLevelArrayItem(file, 'playerFeats', feat => {
        const gid = integer(feat.gid);
        if (gid === null || gid <= lastGid) return;
        delta.featCount++;
        const item = featSummary(feat);
        keepTop(delta.feats, item, 24, (a, b) => b.score - a.score || b.gid - a.gid);
      });
    }
    if (!current()) return null;

    update('Comparing rosters, injuries and player movement…');
    const playerNames = {};
    await stream.forEachTopLevelArrayItem(file, 'players', player => {
      const pid = integer(player.pid);
      if (pid === null) return;
      const name = [player.firstName, player.lastName].filter(Boolean).join(' ');
      // Names for new transaction events, including released/retired players.
      if (collecting) playerNames[String(pid)] = name;
      const tid = integer(player.tid);
      if (tid === null || tid < 0) return;
      const ratings = Array.isArray(player.ratings) ? player.ratings : [];
      const rating = [...ratings].reverse().find(r => integer(r.season) === season);
      snapshot.players[String(pid)] = {
        name, tid, ovr: integer(rating?.ovr) ?? null,
        injury: String(player.injury?.type || 'Healthy'),
        gamesRemaining: integer(player.injury?.gamesRemaining) ?? 0
      };
    });
    if (!current()) return null;
    return { snapshot, delta, playerNames };
  }
  function comparable(a, b) {
    if (!a || !b || a.startingSeason !== b.startingSeason) return false;
    if (a.leagueName && b.leagueName && a.leagueName !== b.leagueName) return false;
    if (b.season < a.season || b.maxEid < a.maxEid || b.maxGid < a.maxGid) return false;
    const oldTids = Object.keys(a.teams);
    return oldTids.length === 0 || oldTids.filter(tid => b.teams[tid]).length >=
      Math.max(1, Math.ceil(oldTids.length * 0.4));
  }
  function playoffChanges(old, now, teams) {
    const items = [];
    if (!now) return items;
    if (!old || old.season !== now.season) {
      if (now.series.length) items.push('Playoff bracket generated for ' + now.season + '.');
      return items;
    }
    if (now.currentRound !== null && old.currentRound !== null &&
        now.currentRound !== old.currentRound) {
      items.push('Playoffs advanced from round ' + (old.currentRound + 1) +
        ' to ' + (now.currentRound + 1) + '.');
    }
    const before = new Map(old.series.map(s =>
      [[s.round, Math.min(s.home, s.away), Math.max(s.home, s.away)].join(':'), s]));
    for (const series of now.series) {
      const key = [series.round, Math.min(series.home, series.away),
        Math.max(series.home, series.away)].join(':');
      const prior = before.get(key);
      if (!prior) {
        items.push('Round ' + (series.round + 1) + ': ' +
          teamLabel(teams, series.home) + ' vs ' + teamLabel(teams, series.away) + '.');
      } else if (prior.hw !== series.hw || prior.aw !== series.aw) {
        items.push(teamLabel(teams, series.home) + ' vs ' +
          teamLabel(teams, series.away) + ': series now ' +
          series.hw + '–' + series.aw + ' (was ' + prior.hw + '–' + prior.aw + ').');
      }
    }
    return items;
  }
  function buildReport(previous, latest, delta, names, olderName, newerName) {
    const sections = [];
    function section(title, count, entries) {
      if (entries.length || count) sections.push({ title, count, entries: entries.slice(0, 18) });
    }
    const p = previous.players || {}, n = latest.players || {}, standings = [];
    for (const [tid, team] of Object.entries(latest.teams)) {
      const old = previous.teams[tid];
      if (!old || (old.won === team.won && old.lost === team.lost && old.tied === team.tied)) continue;
      standings.push({ team: team.abbrev, wins: team.won - old.won,
        losses: team.lost - old.lost, record: team.won + '-' + team.lost });
    }
    standings.sort((a, b) => Math.abs(b.wins) + Math.abs(b.losses) -
      Math.abs(a.wins) - Math.abs(a.losses));
    const playoff = playoffChanges(previous.playoffs, latest.playoffs, latest.teams);
    section('Playoff movement', playoff.length + (delta.counts.playoffs || 0), [
      ...playoff,
      ...delta.events.playoffs.map(e => titleForEvent(e, latest.teams, names))
    ]);
    section('Standings and team progress', standings.length, standings.slice(0, 16).map(s =>
      s.team + ': now ' + s.record + ' (' +
      (s.wins >= 0 ? '+' : '') + s.wins + ' W, ' +
      (s.losses >= 0 ? '+' : '') + s.losses + ' L).'));

    section('Recent games', delta.gameCount,
      delta.recentGames.slice().sort((a, b) => b.gid - a.gid)
        .map(g => g.season + ': ' + g.label));
    section('Player feats and standout performances',
      Math.max(delta.featCount, delta.counts.feats || 0),
      delta.feats.map(f => f.text)
        .concat(delta.events.feats.map(e => titleForEvent(e, latest.teams, names))));

    section('Trades', delta.counts.trades || 0,
      delta.events.trades.map(e => titleForEvent(e, latest.teams, names)));
    const rosterMoves = [];
    const newInjuries = [], recoveries = [];
    for (const [pid, now] of Object.entries(n)) {
      const before = p[pid];
      if (!before) continue;
      if (before.tid !== now.tid && before.tid >= 0) {
        rosterMoves.push(now.name + ': ' + teamLabel(previous.teams, before.tid) +
          ' → ' + teamLabel(latest.teams, now.tid) + '.');
      }
      if (now.gamesRemaining > 0 && (!before.gamesRemaining ||
          (before.injury !== now.injury && now.gamesRemaining >= before.gamesRemaining))) {
        newInjuries.push(now.name + ' (' + teamLabel(latest.teams, now.tid) + '): ' +
          now.injury + ', ' + now.gamesRemaining + ' games remaining.');
      }
      if (before.gamesRemaining > 0 && now.gamesRemaining === 0) {
        recoveries.push(now.name + ' (' + teamLabel(latest.teams, now.tid) + ') returned to health.');
      }
    }
    section('Signings, releases and roster moves',
      (delta.counts.moves || 0) + rosterMoves.length, [
        ...rosterMoves.slice(0, 9),
        ...delta.events.moves.map(e => titleForEvent(e, latest.teams, names))
      ]);
    section('Injuries and recoveries',
      Math.max(newInjuries.length + recoveries.length, delta.counts.injuries || 0), [
        ...newInjuries.slice(0, 8),
        ...recoveries.slice(0, 5),
        ...delta.events.injuries.filter(e => e.score >= 10).slice(0, 8)
          .map(e => titleForEvent(e, latest.teams, names))
      ]);
    section('Awards and honors', delta.counts.awards || 0,
      delta.events.awards.map(e => titleForEvent(e, latest.teams, names)));
    const misc = delta.events.news;
    section('Other league news', misc.length,
      misc.map(e => titleForEvent(e, latest.teams, names)));

    return {
      olderName, newerName, savedAt: new Date().toISOString(),
      oldSeason: previous.season, season: latest.season,
      counts: { games: delta.gameCount, playoffGames: delta.playoffGames,
        events: Object.values(delta.counts).reduce((a, b) => a + b, 0),
        feats: delta.featCount,
        trades: delta.counts.trades || 0 },
      sections
    };
  }
  function renderReport(report) {
    const summary = node('div', 'home-updates-summary');
    summary.appendChild(node('p', 'home-updates-source',
      'Comparing ' + report.olderName + ' → ' + report.newerName));
    const statLine = node('div', 'home-updates-totals');
    for (const [count, label] of [
      [report.counts.games, 'new games'],
      [report.counts.playoffGames, 'playoff games'],
      [report.counts.trades, 'trades'],
      [report.counts.events, 'new events']
    ]) {
      const tile = node('span', 'home-updates-total');
      tile.append(node('strong', '', count), document.createTextNode(' ' + label));
      statLine.appendChild(tile);
    }
    summary.appendChild(statLine);
    const grid = node('div', 'home-updates-grid');
    for (const group of report.sections) {
      const card = node('article', 'home-updates-group');
      const heading = node('h4', '', group.title);
      card.appendChild(heading);
      if (group.count > 0) card.appendChild(node('p', 'home-updates-count',
        group.count + ' ' + (group.count === 1 ? 'update' : 'updates')));
      const list = node('ul', '');
      for (const entry of group.entries.slice(0, 7)) {
        list.appendChild(node('li', '', entry));
      }
      card.appendChild(list);
      if (group.entries.length > 7) {
        const more = node('details', 'home-updates-more');
        more.appendChild(node('summary', '', 'Show ' + (group.entries.length - 7) + ' more'));
        const rest = node('ul', '');
        for (const entry of group.entries.slice(7)) rest.appendChild(node('li', '', entry));
        more.appendChild(rest);
        card.appendChild(more);
      }
      grid.appendChild(card);
    }
    if (!report.sections.length) {
      summary.appendChild(node('p', 'home-updates-status',
        'No new games, transactions, playoff results, or notable league events were found.'));
    }
    mount.replaceChildren(summary, grid);
  }
  async function loadChange({ file, previousFile, source }) {
    const id = ++generation;
    const current = () => id === generation;
    if (!file) {
      showStatus('Upload a league file to begin tracking future changes.');
      await resetSaved(current);
      return;
    }
    try {
      const stored = await getSaved();
      if (!current()) return;
      const fileId = fingerprint(file);
      if (source !== 'upload' && stored?.snapshot?.signature === fileId) {
        if (stored.report) renderReport(stored.report);
        else showStatus('Baseline saved. Upload a newer league file to see what changed.');
        return;
      }
      if (source === 'upload' && stored?.snapshot?.signature === fileId) {
        if (stored.report) renderReport(stored.report);
        else showStatus('This is the saved baseline. Upload a newer file to compare.');
        return;
      }
      let before = null;
      if (source === 'upload' && previousFile &&
          fingerprint(previousFile) !== fileId) {
        if (stored?.snapshot?.signature === fingerprint(previousFile)) {
          before = stored.snapshot;
        } else {
          showStatus('Preparing a baseline from the previously saved league file…');
          const oldData = await capture(previousFile, null, current, showStatus);
          if (!oldData || !current()) return;
          before = oldData.snapshot;
        }
      } else if (source === 'upload' && stored?.snapshot?.signature !== fileId) {
        before = stored?.snapshot || null;
      }
      showStatus(before ? 'Comparing the new league file against the previous save…' :
        'Creating a baseline from the current league file…');
      const newData = await capture(file, before, current, showStatus);
      if (!newData || !current()) return;
      const latest = newData.snapshot;
      let report = null;
      if (before && comparable(before, latest)) {
        report = buildReport(before, latest, newData.delta, newData.playerNames,
          previousFile?.name || stored?.snapshot?.signature?.split('|')[0] || 'previous save',
          file.name || 'updated save');
      }
      await storeSaved({ key: KEY, snapshot: latest, report }, current);
      if (!current()) return;
      if (report) {
        renderReport(report);
      } else {
        showStatus(before
          ? 'This save is older or from a different league. It is now the baseline; upload a newer save to compare.'
          : 'Baseline saved. The next updated league file will generate games, trades, records and playoff news here.');
      }
    } catch (error) {
      if (!current()) return;
      console.warn('Could not compare the league file updates.', error);
      showStatus('Could not generate the update summary. Your previously saved league data is unchanged.');
    }
  }
  showStatus('Upload a league file to start tracking game-to-game changes.');
  hub.subscribe(snapshot => { void loadChange(snapshot); });
})();