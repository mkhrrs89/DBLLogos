/* Player Stocks: last five games versus preceding ten games in the CURRENT
   league season. Separate, read-only analytics; never touches cards or league
   storage. Bounded streaming reads work on large compressed BBGM exports. */
(() => {
  const panel = document.getElementById('playerStocksPanel');
  const wrap = document.getElementById('playerStocksWrap');
  const status = document.getElementById('playerStocksStatus');
  const search = document.getElementById('playerStocksSearch');
  const filter = document.getElementById('playerStocksFilter');
  const order = document.getElementById('playerStocksOrder');
  const more = document.getElementById('playerStocksMore');
  const tab = document.getElementById('playerStocksTabBtn');
  const hub = window.DBLLeagueFileHub;
  const stream = window.DBLLeagueStream;
  const clear = document.getElementById('clearLeagueFileBtn');
  if (!panel || !wrap || !status || !tab || !stream) return;

  // v3 adds separate season advanced stats and game-window efficiency data.
  // Old caches cannot supply these new fields, so recompute once per file.
  const CACHE_KEY = 'dbl-player-stocks:v3';
  const RECENT = 5, BASELINE = 10, MIN_BASELINE = 3;
  const MIN_RECENT_MPG = 10;
  let activeFile = null, version = 0, loadedVersion = -1, loadingVersion = -1;
  let rows = [], season = null, shown = 100;
  // Header clicks and the existing sort dropdown share one sort state.
  let sortKey = 'trend', sortDirection = 'desc';
  const TABLE_COLUMNS = [
    {key:'name', label:'Player', kind:'text'},
    {key:'team', label:'Team', kind:'text'},
    {key:'trend', label:'Change', kind:'number'},
    {key:'status', label:'Status', kind:'status'},
    {key:'recentMpg', label:'MPG', kind:'number'},
    {key:'ppg', label:'PPG', kind:'pair'},
    {key:'rpg', label:'RPG', kind:'pair'},
    {key:'apg', label:'APG', kind:'pair'},
    {key:'index', label:'Index', kind:'pair'},
    {key:'ts', label:'TS%', kind:'pair', description:'True shooting percentage · last 5 / earlier games'},
    {key:'gmsc', label:'GmSc', kind:'pair', description:'Game Score average · last 5 / earlier games'},
    {key:'ws48', label:'WS/48', kind:'season', description:'Current-season win shares per 48 minutes'},
    {key:'per', label:'PER', kind:'season', description:'Current-season player efficiency rating'},
    {key:'vorp', label:'VORP', kind:'season', description:'Current-season value over replacement'},
    {key:'bpm', label:'BPM', kind:'season', description:'Current-season box plus/minus'},
  ];
  const asNumber = value => value == null || value === '' ? null :
    Number.isFinite(Number(value)) ? Number(value) : null;
  const asName = player => String(player?.name || [
    player?.firstName, player?.lastName].filter(Boolean).join(' ') || '').trim();
  const asPhoto = value => typeof value === 'string' ? value.trim() : '';
  const signature = file => [String(file?.name || ''), String(file?.size || 0),
    String(file?.lastModified || 0)].join('|');
  const fileNow = () => activeFile || hub?.getCurrentFile?.() || null;
  const isCurrent = (file, token) => fileNow() === file && version === token;

  function report(message) { status.textContent = message; }
  function empty(message) {
    wrap.replaceChildren();
    const text = document.createElement('p');
    text.className = 'player-stocks-empty';
    text.textContent = message;
    wrap.appendChild(text);
  }
  function readCache() {
    try {
      const value = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch (_) { return null; }
  }
  function saveCache(file) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        signature: signature(file), season, rows,
      }));
    } catch (error) { console.warn('Player Stocks cache unavailable', error); }
  }
  function acceptFile(file) {
    if (file === activeFile) return;
    activeFile = file || null;
    version += 1;
    loadedVersion = -1;
    loadingVersion = -1;
    rows = [];
    season = null;
    shown = 100;
    if (!file) {
      report('No league file loaded.');
      empty('Load a league file to compare recent performances.');
      return;
    }
    const cached = readCache();
    if (cached?.signature === signature(file) &&
        Array.isArray(cached.rows) && Number.isFinite(cached.season)) {
      rows = cached.rows;
      season = cached.season;
      loadedVersion = version;
      if (!panel.hidden) render();
      return;
    }
    if (!panel.hidden) void load();
  }

  if (hub) hub.subscribe(({file}) => acceptFile(file));
  else document.getElementById('leagueFile')?.addEventListener('change', e =>
    acceptFile(e.target.files?.[0] || null));
  clear?.addEventListener('click', () => {
    acceptFile(null);
    try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
  });
  tab.addEventListener('click', () => void load());
  window.addEventListener('dbl:tab-change', e => {
    if (e.detail?.panelId === 'playerStocksPanel') void load();
  });
  search?.addEventListener('input', () => { shown = 100; render(); });
  filter?.addEventListener('change', () => { shown = 100; render(); });
  order?.addEventListener('change', () => {
    if (order.value === 'rising') { sortKey = 'trend'; sortDirection = 'desc'; }
    else if (order.value === 'falling') { sortKey = 'trend'; sortDirection = 'asc'; }
    else if (order.value === 'name') { sortKey = 'name'; sortDirection = 'asc'; }
    shown = 100;
    render();
  });
  more?.addEventListener('click', () => { shown += 100; render(); });

  // These are official season aggregates from BBGM player.stats, NOT
  // game-level estimates. Trades may split one season across team rows.
  function seasonAdvancedFor(player, year) {
    const stats = Array.isArray(player?.stats) ? player.stats : [];
    const regular = stats.filter(row =>
      !row?.playoffs && asNumber(row?.season) === year &&
      (asNumber(row?.tid) === null || asNumber(row?.tid) >= 0));
    function weighted(key, fallback) {
      let weightedTotal = 0, minutes = 0;
      for (const row of regular) {
        const value = key === 'bpm'
          ? (asNumber(row.bpm) ??
            (asNumber(row.obpm) !== null && asNumber(row.dbpm) !== null
              ? asNumber(row.obpm) + asNumber(row.dbpm) : null))
          : (asNumber(row[key]) ?? (fallback ? fallback(row) : null));
        const min = asNumber(row.min);
        if (value !== null && min !== null && min > 0) {
          weightedTotal += value * min;
          minutes += min;
        }
      }
      return minutes ? weightedTotal / minutes : null;
    }
    let totalWs = 0, wsMinutes = 0, totalVorp = 0, foundVorp = false;
    for (const row of regular) {
      const minutes = asNumber(row.min);
      const ws = asNumber(row.ws) ??
        (asNumber(row.ows) !== null && asNumber(row.dws) !== null
          ? asNumber(row.ows) + asNumber(row.dws) : null);
      if (minutes !== null && minutes > 0 && ws !== null) {
        totalWs += ws;
        wsMinutes += minutes;
      }
      const vorp = asNumber(row.vorp);
      if (vorp !== null) { totalVorp += vorp; foundVorp = true; }
    }
    return {
      ws48: wsMinutes > 0 ? totalWs * 48 / wsMinutes : weighted('ws48'),
      per: weighted('per'),
      vorp: foundVorp ? totalVorp : null,
      bpm: weighted('bpm'),
    };
  }

  // These CAN describe short-term form because game box scores include
  // shot attempts and other individual plays. Suppress a window's metric
  // if required fields are missing, rather than displaying guessed values.
  function gameScoreFor(player) {
    const fields = ['fg','fga','ft','fta','orb','drb','stl','ast','blk','pf','tov'];
    const values = fields.map(key => asNumber(player?.[key]));
    const points = asNumber(player?.pts ?? player?.points);
    if (points === null || values.some(value => value === null)) return null;
    const [fg,fga,ft,fta,orb,drb,stl,ast,blk,pf,tov] = values;
    return points + .4*fg - .7*fga - .4*(fta-ft) +
      .7*orb + .3*drb + stl + .7*ast + .7*blk - .4*pf - tov;
  }
  function advancedWindow(games) {
    const validShots = games.every(g => g.fga !== null && g.fta !== null);
    const attempts = games.reduce((sum,g) => sum + (g.fga || 0) + .44*(g.fta || 0),0);
    const points = games.reduce((sum,g) => sum + g.pts,0);
    return {
      ts: validShots && attempts > 0 ? 100 * points / (2 * attempts) : null,
      gmsc: games.every(g => g.gmsc !== null)
        ? games.reduce((sum,g) => sum + g.gmsc,0) / games.length : null,
    };
  }

  function production(gamePlayer) {
    const pts = asNumber(gamePlayer?.pts ?? gamePlayer?.points);
    const reb = asNumber(gamePlayer?.trb) ??
      ((asNumber(gamePlayer?.orb) || 0) + (asNumber(gamePlayer?.drb) || 0));
    const ast = asNumber(gamePlayer?.ast) || 0;
    const stl = asNumber(gamePlayer?.stl) || 0;
    const blk = asNumber(gamePlayer?.blk) || 0;
    const tov = asNumber(gamePlayer?.tov) || 0;
    if (pts === null || pts < 0) return null;
    const minutes = asNumber(gamePlayer?.min ?? gamePlayer?.minutes);
    if (minutes !== null && minutes <= 0) return null; // DNP
    return {pts, reb, ast, stl, blk, tov, minutes,
      fga: asNumber(gamePlayer?.fga), fta: asNumber(gamePlayer?.fta),
      gmsc: gameScoreFor(gamePlayer),
      index: Math.max(0, pts + 1.2 * reb + 1.5 * ast + 2 * stl + 2 * blk - 1.5 * tov)};
  }
  function averaged(games) {
    const total = games.reduce((sum, g) => ({
      pts: sum.pts + g.pts, reb: sum.reb + g.reb,
      ast: sum.ast + g.ast, index: sum.index + g.index,
    }), {pts:0, reb:0, ast:0, index:0});
    const count = games.length || 1;
    return {pts:total.pts/count, reb:total.reb/count, ast:total.ast/count,
      index:total.index/count};
  }
  function classify(trend) {
    return trend >= 15 ? 'hot' : trend <= -15 ? 'cold' : 'steady';
  }
  function deriveRows(gamesByPlayer, players, teamNames) {
    const result = [];
    for (const [pid, games] of gamesByPlayer) {
      if (games.length < RECENT + MIN_BASELINE) continue;
      const sorted = games.slice().sort((a,b) => b.order - a.order);
      const recent = sorted.slice(0, RECENT);
      const previous = sorted.slice(RECENT, RECENT + BASELINE);
      if (previous.length < MIN_BASELINE) continue;
      // Only rate players with a substantial current role. Require actual
      // box-score minutes in all five recent appearances rather than
      // treating missing data as zero or assuming a player qualifies.
      if (recent.some(game => !Number.isFinite(game.minutes))) continue;
      const recentMpg = recent.reduce((sum, game) => sum + game.minutes, 0) / RECENT;
      if (recentMpg < MIN_RECENT_MPG) continue;
      const current = averaged(recent);
      const prior = averaged(previous);
      if (prior.index < 2) continue; // avoid meaningless +/- infinity
      const trend = 100 * (current.index - prior.index) / prior.index;
      const info = players.get(pid) || {};
      const latest = recent[0];
      result.push({
        pid, name: info.name || latest.name || 'Player ' + pid,
        photo: info.photo || '', team: teamNames.get(latest.tid) || latest.team || '',
        recent, recentMpg, previousCount: previous.length, trend,
        status:classify(trend), recentStats:current, priorStats:prior,
        recentAdvanced:advancedWindow(recent),
        priorAdvanced:advancedWindow(previous),
        seasonAdvanced:info.advanced || {ws48:null,per:null,vorp:null,bpm:null},
      });
    }
    return result.sort((a,b) => b.trend - a.trend || a.name.localeCompare(b.name));
  }
  async function load() {
    const file = fileNow();
    if (!file) {
      report('No league file loaded.');
      empty('Upload a league file to see which players are heating up or cooling off.');
      return;
    }
    if (loadedVersion === version) { render(); return; }
    const token = version;
    if (loadingVersion === token) return;
    loadingVersion = token;
    report('Analyzing recent games…');
    empty('Reading current-season game performances…');
    try {
      const attrs = await stream.readTopLevelValue(file, 'gameAttributes');
      if (!isCurrent(file, token)) return;
      let targetSeason = asNumber(attrs?.season);
      if (targetSeason === null) {
        const seasonRows = [];
        await stream.forEachTopLevelArrayItem(file, 'teams', team => {
          for (const row of Array.isArray(team?.seasons) ? team.seasons : []) {
            const year = asNumber(row?.season);
            if (year !== null) seasonRows.push(year);
          }
        });
        if (!isCurrent(file, token)) return;
        targetSeason = seasonRows.length ? Math.max(...seasonRows) : null;
      }
      if (targetSeason === null) throw new Error('Current season could not be identified.');
      const players = new Map(), teamNames = new Map();
      // Keep only players with a current-team spot; a player who retires or
      // changes teams remains eligible through completed games this season.
      await stream.forEachTopLevelArrayItem(file, 'players', player => {
        const pid = asNumber(player?.pid);
        if (pid === null) return;
        players.set(pid, {name:asName(player),photo:asPhoto(player?.imgURL),
          advanced:seasonAdvancedFor(player, targetSeason)});
      });
      if (!isCurrent(file, token)) return;
      await stream.forEachTopLevelArrayItem(file, 'teams', team => {
        const tid = asNumber(team?.tid);
        if (tid === null) return;
        const history = Array.isArray(team?.seasons) ? team.seasons : [];
        const historic = history.find(row => asNumber(row?.season) === targetSeason);
        const record = historic || team;
        const teamName = [record?.region || team?.region, record?.name || team?.name]
          .filter(Boolean).join(' ');
        if (teamName) teamNames.set(tid, teamName);
      });
      if (!isCurrent(file, token)) return;
      const gamesByPlayer = new Map();
      let sequence = 0;
      await stream.forEachTopLevelArrayItem(file, 'games', game => {
        if (!isCurrent(file, token)) return;
        if (asNumber(game?.season ?? game?.year) !== targetSeason) return;
        const teams = Array.isArray(game?.teams) ? game.teams :
          [game?.won, game?.lost].filter(Boolean);
        const gid = asNumber(game?.gid ?? game?.id);
        const day = asNumber(game?.day);
        const sortOrder = day !== null ? day * 1000000 + (gid || 0) % 1000000 :
          gid !== null ? gid : ++sequence;
        for (const team of teams) {
          for (const player of Array.isArray(team?.players) ? team.players : []) {
            const pid = asNumber(player?.pid);
            if (pid === null) continue;
            const values = production(player);
            if (!values) continue;
            const arr = gamesByPlayer.get(pid) || [];
            arr.push({...values, order:sortOrder, name:asName(player),
              tid:asNumber(team?.tid), team:[team?.region,team?.name]
                .filter(Boolean).join(' ')});
            // Bounded per-player memory, independent of archive length.
            if (arr.length > 25) {
              arr.sort((a,b) => b.order - a.order);
              arr.length = 25;
            }
            gamesByPlayer.set(pid, arr);
          }
        }
      });
      if (!isCurrent(file, token)) return;
      season = targetSeason;
      rows = deriveRows(gamesByPlayer, players, teamNames);
      loadedVersion = token;
      saveCache(file);
      render();
    } catch(error) {
      if (!isCurrent(file, token)) return;
      console.error('Player Stocks computation unavailable', error);
      report('Unable to calculate Player Stocks from this file.');
      empty('Could not read the current-season game data. Try loading the file again.');
    } finally {
      if (loadingVersion === token) loadingVersion = -1;
    }
  }
  function format(value) { return Number(value).toFixed(1); }
  function rowElement(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function sortValue(row, key) {
    if (key === 'name' || key === 'team') return row[key] || '';
    if (key === 'status') return ({hot:2,steady:1,cold:0})[row.status] ?? 1;
    if (key === 'trend') return row.trend;
    if (key === 'recentMpg') return row.recentMpg;
    if (key === 'index') return row.recentStats.index;
    if (key === 'ts' || key === 'gmsc') return row.recentAdvanced?.[key] ?? null;
    if (['ws48','per','vorp','bpm'].includes(key))
      return row.seasonAdvanced?.[key] ?? null;
    if (key === 'ppg') return row.recentStats.pts;
    if (key === 'rpg') return row.recentStats.reb;
    if (key === 'apg') return row.recentStats.ast;
    return null;
  }
  function compareStocks(a, b) {
    const left = sortValue(a, sortKey);
    const right = sortValue(b, sortKey);
    const sign = sortDirection === 'asc' ? 1 : -1;
    // Unknown advanced stats always sort last, even in ascending order.
    const missing = value => value === null || value === undefined ||
      (typeof value === 'number' && !Number.isFinite(value));
    if (missing(left) !== missing(right)) return missing(left) ? 1 : -1;
    let result = 0;
    if (typeof left === 'string' || typeof right === 'string') {
      result = String(left).localeCompare(String(right));
    } else {
      const ln = Number(left), rn = Number(right);
      result = (Number.isFinite(ln) ? ln : -Infinity) -
        (Number.isFinite(rn) ? rn : -Infinity);
    }
    return result ? sign * Math.sign(result) : a.name.localeCompare(b.name);
  }
  function syncSortDropdown() {
    if (!order) return;
    const custom = order.querySelector('option[data-stocks-custom]');
    if (custom) custom.remove();
    const preset = sortKey === 'trend'
      ? (sortDirection === 'desc' ? 'rising' : 'falling')
      : (sortKey === 'name' && sortDirection === 'asc' ? 'name' : '');
    if (preset) {
      order.value = preset;
    } else {
      const column = TABLE_COLUMNS.find(item => item.key === sortKey);
      const option = document.createElement('option');
      option.value = 'custom';
      option.dataset.stocksCustom = 'true';
      option.textContent = 'Sorted: ' + (column?.label || sortKey) +
        (sortDirection === 'asc' ? ' ↑' : ' ↓');
      order.appendChild(option);
      order.value = 'custom';
    }
  }
  function sortByColumn(key) {
    if (sortKey === key) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDirection = key === 'name' || key === 'team' ? 'asc' : 'desc';
    }
    shown = 100;
    syncSortDropdown();
    render();
  }
  function advancedText(value, key) {
    if (value === null || value === undefined || !Number.isFinite(Number(value)))
      return 'N/A';
    if (key === 'ws48') return Number(value).toFixed(3);
    if (key === 'vorp') return Number(value).toFixed(2);
    if (key === 'ts') return Number(value).toFixed(1) + '%';
    return Number(value).toFixed(1);
  }
  function pairCell(row, key) {
    const field = ({ppg:'pts', rpg:'reb', apg:'ast', index:'index'})[key];
    const isAdvanced = key === 'ts' || key === 'gmsc';
    const recentValue = isAdvanced ? row.recentAdvanced?.[key] : row.recentStats[field];
    const earlierValue = isAdvanced ? row.priorAdvanced?.[key] : row.priorStats[field];
    const recentText = advancedText(recentValue, key);
    const previousText = advancedText(earlierValue, key);
    const cell = rowElement('td', 'player-stocks-cell-pair player-stocks-numeric');
    cell.append(rowElement('strong', 'player-stocks-recent', recentText),
      rowElement('span', 'player-stocks-previous', ' / ' + previousText));
    cell.title = 'Last 5 games: ' + recentText +
      '; previous ' + row.previousCount + ' games: ' + previousText;
    return cell;
  }
  function render() {
    if (!rows.length) {
      report(season === null ? 'No league file loaded.' :
        'Season ' + season + ' · insufficient recent-game history');
      empty('Player Stocks needs at least 8 games per player this season and 10+ minutes per game over the last 5 appearances.');
      if (more) more.hidden = true;
      return;
    }
    const query = (search?.value || '').trim().toLocaleLowerCase();
    const wanted = filter?.value || 'all';
    const filtered = rows.filter(row =>
      (wanted === 'all' || row.status === wanted) &&
      (!query || (row.name + ' ' + row.team + ' ' + row.pid).toLocaleLowerCase().includes(query)));
    filtered.sort(compareStocks);
    wrap.replaceChildren();
    report('Season ' + season + ' · ' + filtered.length + ' players · 10+ recent MPG · last 5 vs previous 3–10 games');
    if (!filtered.length) {
      empty('No players match these filters.');
      if (more) more.hidden = true;
      return;
    }

    const scroll = rowElement('div', 'player-stocks-table-scroll');
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', 'Sortable Player Stocks results');
    scroll.tabIndex = 0;
    const table = rowElement('table', 'player-stocks-table');
    const caption = rowElement('caption', 'player-stocks-visually-hidden',
      'Player momentum. PPG, RPG, APG, Index, TS% and Game Score compare the latest five games against earlier games. WS/48, PER, VORP and BPM are current-season aggregates. Click column headers to sort.');
    table.appendChild(caption);
    const head = rowElement('thead');
    const heading = rowElement('tr');
    for (const column of TABLE_COLUMNS) {
      const th = rowElement('th');
      th.scope = 'col';
      th.setAttribute('aria-sort',
        sortKey === column.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none');
      const button = rowElement('button', 'player-stocks-sort-button');
      button.type = 'button';
      button.title = 'Sort by ' + column.label +
        (column.description ? ' · ' + column.description : '');
      button.appendChild(rowElement('span', '', column.label));
      if (column.kind === 'pair')
        button.appendChild(rowElement('small', 'player-stocks-head-detail', '5 / prev'));
      else if (column.kind === 'season')
        button.appendChild(rowElement('small', 'player-stocks-head-detail', 'season'));
      if (sortKey === column.key)
        button.appendChild(rowElement('span', 'player-stocks-sort-arrow',
          sortDirection === 'asc' ? '↑' : '↓'));
      button.addEventListener('click', () => sortByColumn(column.key));
      th.appendChild(button);
      heading.appendChild(th);
    }
    head.appendChild(heading);
    table.appendChild(head);

    const body = rowElement('tbody');
    for (const player of filtered.slice(0, shown)) {
      const tr = rowElement('tr', 'player-stocks-row is-' + player.status);
      const playerName = rowElement('th', 'player-stocks-row-name', player.name);
      playerName.scope = 'row';
      tr.appendChild(playerName);
      tr.appendChild(rowElement('td', 'player-stocks-row-team', player.team || 'Team unavailable'));
      tr.appendChild(rowElement('td', 'player-stocks-trend player-stocks-numeric',
        (player.trend > 0 ? '+' : '') + format(player.trend) + '%'));
      tr.appendChild(rowElement('td', 'player-stocks-row-status',
        player.status.toUpperCase()));
      tr.appendChild(rowElement('td', 'player-stocks-numeric', format(player.recentMpg)));
      for (const key of ['ppg', 'rpg', 'apg', 'index', 'ts', 'gmsc'])
        tr.appendChild(pairCell(player, key));
      for (const key of ['ws48','per','vorp','bpm']) {
        const value = player.seasonAdvanced?.[key];
        const cell = rowElement('td', 'player-stocks-numeric player-stocks-season-value',
          advancedText(value,key));
        cell.title = 'Current-season ' + key.toUpperCase() + ' (not a five-game estimate)';
        tr.appendChild(cell);
      }
      body.appendChild(tr);
    }
    table.appendChild(body);
    scroll.appendChild(table);
    wrap.appendChild(scroll);
    if (more) {
      more.hidden = shown >= filtered.length;
      more.textContent = 'Show more players (' + Math.min(100, filtered.length - shown) + ')';
    }
  }
  // Initial navigation works without a league export; fileHub restoration
  // can arrive later and causes a fresh, guarded calculation.
  if (!fileNow()) {
    report('No league file loaded.');
    empty('Upload a league file to see who is hot or cold.');
  }
})();
