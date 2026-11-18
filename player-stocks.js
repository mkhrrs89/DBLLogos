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

  const CACHE_KEY = 'dbl-player-stocks:v1';
  const RECENT = 5, BASELINE = 10, MIN_BASELINE = 3;
  let activeFile = null, version = 0, loadedVersion = -1, loadingVersion = -1;
  let rows = [], season = null, shown = 100;
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
  order?.addEventListener('change', () => { shown = 100; render(); });
  more?.addEventListener('click', () => { shown += 100; render(); });

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
    return {pts, reb, ast, stl, blk, tov,
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
      const current = averaged(recent);
      const prior = averaged(previous);
      if (prior.index < 2) continue; // avoid meaningless +/- infinity
      const trend = 100 * (current.index - prior.index) / prior.index;
      const info = players.get(pid) || {};
      const latest = recent[0];
      result.push({
        pid, name: info.name || latest.name || 'Player ' + pid,
        photo: info.photo || '', team: teamNames.get(latest.tid) || latest.team || '',
        recent, previousCount: previous.length, trend,
        status:classify(trend), recentStats:current, priorStats:prior,
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
        players.set(pid, {name:asName(player),photo:asPhoto(player?.imgURL)});
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
  const format = value => Number(value).toFixed(1);
  function rowElement(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function render() {
    if (!panel || !rows.length) {
      report(season === null ? 'No league file loaded.' :
        'Season ' + season + ' · insufficient recent-game history');
      empty('Player Stocks needs at least 8 games per player this season: the last 5 compared with up to 10 earlier games.');
      if (more) more.hidden = true;
      return;
    }
    const query = (search?.value || '').trim().toLocaleLowerCase();
    const wanted = filter?.value || 'all';
    let filtered = rows.filter(row =>
      (wanted === 'all' || row.status === wanted) &&
      (!query || (row.name + ' ' + row.team + ' ' + row.pid).toLocaleLowerCase().includes(query)));
    const sorting = order?.value || 'rising';
    filtered.sort((a,b) => {
      if (sorting === 'falling') return a.trend - b.trend || a.name.localeCompare(b.name);
      if (sorting === 'name') return a.name.localeCompare(b.name);
      return b.trend - a.trend || a.name.localeCompare(b.name);
    });
    wrap.replaceChildren();
    report('Season ' + season + ' · ' + filtered.length + ' players · last 5 games vs previous 3–10');
    if (!filtered.length) {
      empty('No players match these filters.');
      if (more) more.hidden = true;
      return;
    }
    const table = rowElement('div','player-stocks-list');
    for (const player of filtered.slice(0,shown)) {
      const card = rowElement('article','player-stocks-item is-' + player.status);
      const top = rowElement('div','player-stocks-item-head');
      if (player.photo && /^https?:\/\//i.test(player.photo)) {
        const photo = rowElement('img','player-stocks-photo');
        photo.src = player.photo; photo.alt = ''; photo.loading = 'lazy';
        photo.addEventListener('error',()=>photo.remove(),{once:true});
        top.appendChild(photo);
      }
      const person = rowElement('div','player-stocks-person');
      person.appendChild(rowElement('strong','player-stocks-name',player.name));
      person.appendChild(rowElement('span','player-stocks-team',player.team ||
        'Team unavailable'));
      top.appendChild(person);
      const change = rowElement('div','player-stocks-change');
      change.appendChild(rowElement('strong','',
        (player.trend > 0 ? '+' : '') + format(player.trend) + '%'));
      change.appendChild(rowElement('span','',player.status === 'hot' ? 'HOT' :
        player.status === 'cold' ? 'COLD' : 'STEADY'));
      top.appendChild(change);
      card.appendChild(top);
      const metrics = rowElement('div','player-stocks-metrics');
      metrics.appendChild(rowElement('span','',
        'PPG ' + format(player.recentStats.pts) + ' / ' + format(player.priorStats.pts)));
      metrics.appendChild(rowElement('span','',
        'RPG ' + format(player.recentStats.reb) + ' / ' + format(player.priorStats.reb)));
      metrics.appendChild(rowElement('span','',
        'APG ' + format(player.recentStats.ast) + ' / ' + format(player.priorStats.ast)));
      card.appendChild(metrics);
      const meter = rowElement('div','player-stocks-meter');
      const bar = rowElement('span','player-stocks-meter-fill');
      bar.style.width = Math.min(50, Math.abs(player.trend) * .35) + '%';
      if (player.trend >= 0) bar.style.left = '50%';
      else bar.style.right = '50%';
      meter.appendChild(bar);
      card.appendChild(meter);
      card.appendChild(rowElement('p','player-stocks-foot',
        'Production index ' + format(player.recentStats.index) + ' vs ' +
        format(player.priorStats.index) + ' · baseline ' + player.previousCount + ' games'));
      table.appendChild(card);
    }
    wrap.appendChild(table);
    if (more) {
      more.hidden = shown >= filtered.length;
      more.textContent = 'Show more players (' + Math.min(100,filtered.length-shown) + ')';
    }
  }
  // Initial navigation works without a league export; fileHub restoration
  // can arrive later and causes a fresh, guarded calculation.
  if (!fileNow()) {
    report('No league file loaded.');
    empty('Upload a league file to see who is hot or cold.');
  }
})();
