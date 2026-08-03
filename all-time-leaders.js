(() => {
  const SAVED_LEADERS_KEY = 'dbl-logo-all-time-leaders:v1';
  const LEADER_LIMIT = 10;
  const STAT_DEFINITIONS = [
    { key: 'pts', title: 'Points', valueLabel: 'PTS' },
    { key: 'trb', title: 'Rebounds', valueLabel: 'REB' },
    { key: 'ast', title: 'Assists', valueLabel: 'AST' },
    { key: 'stl', title: 'Steals', valueLabel: 'STL' },
    { key: 'blk', title: 'Blocks', valueLabel: 'BLK' },
  ];

  const tabBtn = document.getElementById('allTimeLeadersTabBtn');
  const panel = document.getElementById('allTimeLeadersPanel');
  const wrap = document.getElementById('allTimeLeadersWrap');
  const fileInput = document.getElementById('leagueFile');
  const clearBtn = document.getElementById('clearLeagueFileBtn');
  const statusMessage = document.getElementById('statusMessage');

  if (!tabBtn || !panel || !wrap) return;

  const otherPanelIds = [
    'logosPanel',
    'colorSchemesPanel',
    'bannersPanel',
    'uniformsPanel',
    'rankingsPanel',
    'hallOfFamePanel',
    'recordsPanel',
  ];
  const otherTabIds = [
    'logosTabBtn',
    'colorSchemesTabBtn',
    'bannersTabBtn',
    'uniformsTabBtn',
    'rankingsTabBtn',
    'hallOfFameTabBtn',
    'recordsTabBtn',
  ];

  let leaders = loadSavedLeaders();
  let pendingLeagueFile = null;
  let pendingFileVersion = 0;
  let processingVersion = 0;

  renderLeaders(leaders);

  tabBtn.addEventListener('click', () => {
    activateLeadersTab();
    renderLeaders(leaders);
    refreshPendingFileWhenReady();
  });

  for (const tabId of otherTabIds) {
    document.getElementById(tabId)?.addEventListener('click', deactivateLeadersTab);
  }

  fileInput?.addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    if (!file) return;

    // The main app already performs a full read/decompression/parse. Defer this
    // second pass so large mobile league files are never processed concurrently.
    pendingLeagueFile = file;
    pendingFileVersion += 1;

    if (!panel.hidden) {
      refreshPendingFileWhenReady();
    }
  });

  clearBtn?.addEventListener('click', () => {
    leaders = null;
    pendingLeagueFile = null;
    pendingFileVersion += 1;
    try {
      localStorage.removeItem(SAVED_LEADERS_KEY);
    } catch (error) {
      console.warn('Could not clear saved all-time leaders.', error);
    }
    renderLeaders(null);
  });

  function activateLeadersTab() {
    for (const panelId of otherPanelIds) {
      const otherPanel = document.getElementById(panelId);
      if (otherPanel) otherPanel.hidden = true;
    }

    document.querySelectorAll('.tab-btn').forEach((button) => {
      button.classList.remove('active');
      button.setAttribute('aria-selected', 'false');
    });

    panel.hidden = false;
    tabBtn.classList.add('active');
    tabBtn.setAttribute('aria-selected', 'true');
  }

  function deactivateLeadersTab() {
    panel.hidden = true;
    tabBtn.classList.remove('active');
    tabBtn.setAttribute('aria-selected', 'false');
  }

  async function refreshPendingFileWhenReady() {
    if (!pendingLeagueFile) return;

    const file = pendingLeagueFile;
    const version = pendingFileVersion;
    if (processingVersion === version) return;
    processingVersion = version;

    try {
      await waitForMainLeagueLoad(file.name, version);
      if (version !== pendingFileVersion || file !== pendingLeagueFile) return;

      showLoadingState();
      // Give the browser a chance to reclaim the main parser's temporary memory.
      await delay(250);
      const league = JSON.parse(await readLeagueFile(file));
      if (version !== pendingFileVersion || file !== pendingLeagueFile) return;

      leaders = buildAllTimeLeaders(league);
      saveLeaders(file.name, leaders);
      pendingLeagueFile = null;
      renderLeaders(leaders);
    } catch (error) {
      console.warn('Could not build all-time player leaders.', error);
      if (!leaders) {
        renderLeaders(null, 'Could not read career player statistics from that league file.');
      } else {
        renderLeaders(leaders);
      }
    } finally {
      if (processingVersion === version) processingVersion = 0;
    }
  }

  async function waitForMainLeagueLoad(fileName, version) {
    if (!statusMessage) return;

    const loadedText = `Loaded ${fileName}.`;
    const startedAt = Date.now();
    const timeoutMs = 60000;

    while (version === pendingFileVersion && Date.now() - startedAt < timeoutMs) {
      const text = statusMessage.textContent || '';
      const isLoading = text.startsWith('Loading ');
      const isLoaded = text.includes(loadedText);
      const isError = statusMessage.classList.contains('error');

      if (isLoaded || (!isLoading && isError)) return;
      await delay(100);
    }
  }

  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function showLoadingState() {
    wrap.className = 'all-time-leaders-wrap empty-state';
    const empty = document.createElement('div');
    empty.className = 'empty-copy';
    const message = document.createElement('p');
    message.textContent = 'Calculating career leaders...';
    empty.appendChild(message);
    wrap.replaceChildren(empty);
  }

  async function readLeagueFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isGzip = file.name.toLowerCase().endsWith('.gz')
      || (bytes[0] === 0x1f && bytes[1] === 0x8b);

    if (isGzip) {
      if (!window.pako) throw new Error('Gzip support did not load.');
      return window.pako.ungzip(bytes, { to: 'string' });
    }

    return new TextDecoder().decode(bytes);
  }

  function buildAllTimeLeaders(league) {
    const playersByKey = new Map();

    for (const players of getLeaguePlayerCollections(league)) {
      for (const player of players) {
        const summary = buildCareerSummary(player);
        if (!summary || summary.gp <= 0) continue;

        const key = getPlayerKey(player, summary.name);
        const existing = playersByKey.get(key);
        if (!existing || comparePlayerVersions(summary, existing) < 0) {
          playersByKey.set(key, summary);
        }
      }
    }

    const players = Array.from(playersByKey.values());
    const result = {};

    for (const stat of STAT_DEFINITIONS) {
      result[stat.key] = players
        .filter((player) => Number.isFinite(player[stat.key]) && player[stat.key] > 0)
        .sort((a, b) => compareCareerLeaders(a, b, stat.key))
        .slice(0, LEADER_LIMIT)
        .map((player) => ({
          pid: player.pid,
          name: player.name,
          pos: player.pos,
          careerStart: player.careerStart,
          careerEnd: player.careerEnd,
          gp: player.gp,
          value: player[stat.key],
        }));
    }

    return result;
  }

  function getLeaguePlayerCollections(league = {}) {
    return [
      league.players,
      league.retiredPlayers,
      league.releasedPlayers,
      league.freeAgents,
    ].filter(Array.isArray);
  }

  function buildCareerSummary(player) {
    const regularStats = (Array.isArray(player?.stats) ? player.stats : [])
      .filter((row) => !row?.playoffs && Number(row?.gp) > 0);

    if (!regularStats.length) return null;

    const seasons = regularStats
      .map((row) => Number(row?.season))
      .filter(Number.isFinite);

    return {
      pid: readOptionalNumber(player?.pid),
      name: getPlayerName(player),
      pos: typeof player?.pos === 'string' ? player.pos.trim() : '',
      careerStart: seasons.length ? Math.min(...seasons) : null,
      careerEnd: seasons.length ? Math.max(...seasons) : null,
      gp: sumStat(regularStats, 'gp'),
      pts: sumStat(regularStats, 'pts'),
      trb: sumStat(regularStats, 'trb'),
      ast: sumStat(regularStats, 'ast'),
      stl: sumStat(regularStats, 'stl'),
      blk: sumStat(regularStats, 'blk'),
      sourceRows: regularStats.length,
    };
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

  function getPlayerKey(player, name) {
    const pid = readOptionalNumber(player?.pid);
    if (pid !== null) return `pid:${pid}`;
    const bornYear = readOptionalNumber(player?.born?.year);
    return `name:${name}:${bornYear ?? ''}`;
  }

  function comparePlayerVersions(a, b) {
    if (b.gp !== a.gp) return b.gp - a.gp;
    if (b.pts !== a.pts) return b.pts - a.pts;
    return b.sourceRows - a.sourceRows;
  }

  function compareCareerLeaders(a, b, stat) {
    const valueDifference = b[stat] - a[stat];
    if (valueDifference !== 0) return valueDifference;
    if (b.gp !== a.gp) return b.gp - a.gp;
    return a.name.localeCompare(b.name);
  }

  function getPlayerName(player = {}) {
    const directName = typeof player.name === 'string' ? player.name.trim() : '';
    if (directName) return directName;

    const firstName = typeof player.firstName === 'string' ? player.firstName.trim() : '';
    const lastName = typeof player.lastName === 'string' ? player.lastName.trim() : '';
    return `${firstName} ${lastName}`.trim() || 'Unknown Player';
  }

  function readOptionalNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function saveLeaders(fileName, data) {
    try {
      localStorage.setItem(SAVED_LEADERS_KEY, JSON.stringify({
        fileName,
        savedAt: new Date().toISOString(),
        leaders: data,
      }));
    } catch (error) {
      console.warn('Could not save all-time leaders.', error);
    }
  }

  function loadSavedLeaders() {
    try {
      const raw = localStorage.getItem(SAVED_LEADERS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return normalizeSavedLeaders(parsed?.leaders);
    } catch (error) {
      console.warn('Could not restore saved all-time leaders.', error);
      return null;
    }
  }

  function normalizeSavedLeaders(saved) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
    const normalized = {};
    let hasAny = false;

    for (const stat of STAT_DEFINITIONS) {
      normalized[stat.key] = Array.isArray(saved[stat.key])
        ? saved[stat.key].slice(0, LEADER_LIMIT)
        : [];
      if (normalized[stat.key].length) hasAny = true;
    }

    return hasAny ? normalized : null;
  }

  function renderLeaders(data, errorMessage = '') {
    wrap.replaceChildren();

    if (!data) {
      wrap.className = 'all-time-leaders-wrap empty-state';
      const empty = document.createElement('div');
      empty.className = 'empty-copy';
      const message = document.createElement('p');
      message.textContent = errorMessage
        || 'Load or re-upload a league file to calculate career statistical leaders.';
      empty.appendChild(message);
      wrap.appendChild(empty);
      return;
    }

    wrap.className = 'all-time-leaders-wrap';
    const grid = document.createElement('div');
    grid.className = 'career-leaders-grid';

    for (const stat of STAT_DEFINITIONS) {
      grid.appendChild(buildLeaderList(stat, data[stat.key] || []));
    }

    wrap.appendChild(grid);
  }

  function buildLeaderList(stat, entries) {
    const section = document.createElement('section');
    section.className = 'career-leader-card';

    const heading = document.createElement('div');
    heading.className = 'career-leader-heading';
    const title = document.createElement('h3');
    title.textContent = stat.title;
    const label = document.createElement('span');
    label.textContent = `Career ${stat.valueLabel}`;
    heading.append(title, label);

    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'career-leader-empty';
      empty.textContent = 'No qualifying totals found.';
      section.append(heading, empty);
      return section;
    }

    const list = document.createElement('ol');
    list.className = 'career-leader-list';

    entries.forEach((entry, index) => {
      const item = document.createElement('li');
      item.className = 'career-leader-item';

      const rank = document.createElement('span');
      rank.className = 'career-leader-rank';
      rank.textContent = String(index + 1);

      const details = document.createElement('div');
      details.className = 'career-leader-details';
      const name = document.createElement('strong');
      name.textContent = entry.name || 'Unknown Player';
      const meta = document.createElement('span');
      meta.textContent = buildCareerMeta(entry);
      details.append(name, meta);

      const value = document.createElement('strong');
      value.className = 'career-leader-value';
      value.textContent = formatCareerTotal(entry.value);
      value.title = stat.valueLabel;

      item.append(rank, details, value);
      list.appendChild(item);
    });

    section.append(heading, list);
    return section;
  }

  function buildCareerMeta(entry) {
    const parts = [];
    if (entry.pos) parts.push(entry.pos);
    if (Number.isFinite(entry.careerStart) && Number.isFinite(entry.careerEnd)) {
      parts.push(entry.careerStart === entry.careerEnd
        ? String(entry.careerStart)
        : `${entry.careerStart}-${entry.careerEnd}`);
    }
    if (Number.isFinite(entry.gp)) parts.push(`${formatCareerTotal(entry.gp)} GP`);
    return parts.join(' · ');
  }

  function formatCareerTotal(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return Math.round(number).toLocaleString();
  }
})();