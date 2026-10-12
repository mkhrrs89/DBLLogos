(() => {
  const CACHE_KEY = 'dbl-logo-ratings-view:v1';
  const LEADER_LIMIT = 10;

  const RATING_DEFINITIONS = [
    { key: 'hgt', label: 'Height', aliases: ['hgt'] },
    { key: 'stre', label: 'Strength', aliases: ['stre', 'str'] },
    { key: 'spd', label: 'Speed', aliases: ['spd'] },
    { key: 'jmp', label: 'Jumping', aliases: ['jmp'] },
    { key: 'endu', label: 'Endurance', aliases: ['endu', 'end'] },
    { key: 'ins', label: 'Inside', aliases: ['ins'] },
    { key: 'dnk', label: 'Layups/Dunks', aliases: ['dnk', 'lay', 'layup'] },
    { key: 'ft', label: 'Free Throw', aliases: ['ft'] },
    { key: 'fg', label: 'Mid Range', aliases: ['fg', 'mr', 'mid'] },
    { key: 'tp', label: 'Three Pointer', aliases: ['tp', 'three'] },
    { key: 'oiq', label: 'Offensive IQ', aliases: ['oiq'] },
    { key: 'diq', label: 'Defensive IQ', aliases: ['diq'] },
    { key: 'drb', label: 'Dribbling', aliases: ['drb'] },
    { key: 'pss', label: 'Passing', aliases: ['pss', 'pas'] },
    { key: 'reb', label: 'Rebounding', aliases: ['reb'] },
  ];

  const MEASURABLES = [
    { key: 'usage', label: 'Usage', direction: 'high', weights: [0.5,0,0.5,0,0,1.5,1,0,1,1,0.5,0,0.5,0,0] },
    { key: 'dribbling', label: 'Dribbling', direction: 'high', weights: [0,0,1,0,0,0,0,0,0,0,0,0,1,0,0] },
    { key: 'passing', label: 'Passing', direction: 'high', weights: [0,0,0,0,0,0,0,0,0,0,0.5,0,0.4,1,0] },
    { key: 'turnovers', label: 'Turnovers', direction: 'low', weights: [0,0,0,0,0,1,0,0,0,0,-1,0,0,1,0] },
    { key: 'shootingRim', label: 'Shooting at Rim', direction: 'high', weights: [0.75,0,0.2,0.6,0,0,0.4,0,0,0,0.2,0,0,0,0] },
    { key: 'shootingLowPost', label: 'Shooting Low Post', direction: 'high', weights: [2,0.6,0.2,0,0,1,0,0,0,0,0.2,0,0,0,0] },
    { key: 'shootingMid', label: 'Shooting Mid', direction: 'high', weights: [0,0,0,0,0,0,0,0,1,0,-0.5,0,0,0,0] },
    { key: 'shooting3', label: 'Shooting 3', direction: 'high', weights: [0,0,0,0,0,0,0,0,0,1,0.1,0,0,0,0] },
    { key: 'freeThrow', label: 'Free Throw', direction: 'high', weights: [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0] },
    { key: 'rebounding', label: 'Rebounding', direction: 'high', weights: [2,0.1,0,0.1,0,0,0,0,0,0,0.5,0.5,0,0,2] },
    { key: 'steal', label: 'Steal', direction: 'high', weights: [0,0,1,0,0,0,0,0,0,0,0,1,0,0,0] },
    { key: 'block', label: 'Block', direction: 'high', weights: [2.5,0,0,1.5,0,0,0,0,0,0,0,0.5,0,0,0] },
    { key: 'foul', label: 'Foul', direction: 'low', weights: [1,0,-1,0,0,0,0,0,0,0,0,-1,0,0,0] },
    { key: 'drawingFouls', label: 'Drawing Fouls', direction: 'high', weights: [1,0,1,0,0,0,1,0,0,0,1,0,1,0,0] },
    { key: 'defense', label: 'Defense', direction: 'high', weights: [1,1,1,1,0,0,0,0,0,0,0,1,0,0,0] },
    { key: 'defInterior', label: 'Def. Interior', direction: 'high', weights: [2.5,1,0.5,0.5,0,0,0,0,0,0,0,2,0,0,0] },
    { key: 'defPerim', label: 'Def. Perimeter', direction: 'high', weights: [0.5,0.5,2,0.5,0,0,0,0,0,0,0,1,0,0,0] },
    { key: 'endurance', label: 'Endurance', direction: 'high', weights: [0,0,0,0,1,0,0,0,0,0,0,0,0,0,0] },
    { key: 'athleticism', label: 'Athleticism', direction: 'high', weights: [0.75,1,1,1,0,0,0,0,0,0,0,0,0,0,0] },
  ];

  const tabBtn = document.getElementById('ratingsTabBtn');
  const panel = document.getElementById('ratingsPanel');
  const wrap = document.getElementById('ratingsWrap');
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
  let rankings = null;
  let activePlayerCount = 0;
  let cachedPayload = loadCache();

  tabBtn.addEventListener('click', () => {
    void ensureLoaded();
  });

  window.addEventListener('dbl:tab-change', (event) => {
    if (event.detail?.panelId !== 'ratingsPanel') return;
    void ensureLoaded();
  });

  const acceptLeagueFile = (file) => {
    if (!file || activeFile === file) return;

    activeFile = file;
    fileVersion += 1;
    loadedVersion = -1;
    loadingVersion = -1;
    rankings = null;
    activePlayerCount = 0;

    const signature = fileSignature(file);
    if (cachedPayload?.signature === signature) {
      rankings = normalizeSavedRankings(cachedPayload.rankings);
      activePlayerCount = Number(cachedPayload.activePlayerCount) || 0;
      if (rankings) {
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
    rankings = null;
    activePlayerCount = 0;

    try {
      localStorage.removeItem(CACHE_KEY);
      cachedPayload = null;
    } catch (error) {
      console.warn('Could not clear Ratings cache.', error);
    }

    render();
  });

  async function ensureLoaded() {
    const file = activeFile
      || fileHub?.getCurrentFile?.()
      || fileInput?.files?.[0]
      || window.__dblLargeLeagueFile
      || null;

    if (!file) {
      render();
      return;
    }

    if (loadedVersion === fileVersion && rankings) {
      render();
      return;
    }

    const version = fileVersion;
    if (loadingVersion === version) return;
    loadingVersion = version;

    renderLoading('Reading active player ratings…');

    try {
      await waitForMainLeagueLoad(version);
      if (!isCurrent(file, version)) return;

      const players = [];

      await stream.forEachTopLevelArrayItem(file, 'players', (player) => {
        if (!isCurrent(file, version)) return;
        const normalized = normalizeActivePlayer(player);
        if (normalized) players.push(normalized);
      });

      if (!isCurrent(file, version)) return;

      activePlayerCount = players.length;
      rankings = buildRankings(players);
      loadedVersion = version;

      cachedPayload = {
        signature: fileSignature(file),
        activePlayerCount,
        rankings,
      };
      saveCache(cachedPayload);
      render();
    } catch (error) {
      if (!isCurrent(file, version)) return;
      console.error('Could not build Ratings rankings.', error);
      renderError('Could not read active player ratings from this league file.');
    } finally {
      if (loadingVersion === version) loadingVersion = -1;
    }
  }

  function normalizeActivePlayer(player = {}) {
    const tid = readNumber(player?.tid);

    // BBGM: rostered players use nonnegative TIDs and free agents use -1.
    // Draft prospects/retired players are intentionally excluded.
    if (tid === null || tid < -1) return null;

    const ratingRow = getLatestRatingRow(player);
    if (!ratingRow) return null;

    const ratings = {};
    for (const definition of RATING_DEFINITIONS) {
      ratings[definition.key] = readRatingValue(ratingRow, player, definition);
    }

    if (!Object.values(ratings).some(Number.isFinite)) return null;

    return {
      pid: readNumber(player?.pid),
      tid,
      name: getPlayerName(player),
      pos: getPlayerPosition(ratingRow, player),
      imgURL: normalizeImageUrl(player?.imgURL),
      teamName: getCurrentTeamName(tid),
      ratings,
    };
  }

  function getLatestRatingRow(player = {}) {
    const rows = Array.isArray(player?.ratings) ? player.ratings : [];
    if (!rows.length) return player;

    let best = rows[0];
    let bestSeason = readNumber(best?.season) ?? -Infinity;
    let bestIndex = 0;

    rows.forEach((row, index) => {
      const season = readNumber(row?.season) ?? -Infinity;
      if (season > bestSeason || (season === bestSeason && index > bestIndex)) {
        best = row;
        bestSeason = season;
        bestIndex = index;
      }
    });

    return best;
  }

  function readRatingValue(row, player, definition) {
    for (const alias of definition.aliases) {
      const value = readNumber(row?.[alias]);
      if (value !== null) return clampRating(value);
    }

    for (const alias of definition.aliases) {
      const value = readNumber(player?.[alias]);
      if (value !== null) return clampRating(value);
    }

    return null;
  }

  function clampRating(value) {
    return Math.max(0, Math.min(100, Number(value)));
  }

  function buildRankings(players) {
    const result = {};

    for (const measurable of MEASURABLES) {
      const entries = players
        .map((player) => ({
          pid: player.pid,
          tid: player.tid,
          name: player.name,
          pos: player.pos,
          imgURL: player.imgURL,
          teamName: player.teamName,
          score: calculateMeasurableIndex(player.ratings, measurable.weights),
        }))
        .filter((entry) => Number.isFinite(entry.score))
        .sort((a, b) => compareEntries(a, b, measurable))
        .slice(0, LEADER_LIMIT);

      result[measurable.key] = entries;
    }

    return result;
  }

  function calculateMeasurableIndex(ratings, weights) {
    let weightedTotal = 0;
    let weightTotal = 0;

    for (let index = 0; index < RATING_DEFINITIONS.length; index += 1) {
      const rating = Number(ratings?.[RATING_DEFINITIONS[index].key]);
      const weight = Number(weights[index]) || 0;
      if (!weight || !Number.isFinite(rating)) continue;

      // Negative influences are inverted onto the same 0–100 scale. This is
      // ranking-equivalent to the original signed linear formula but makes the
      // displayed index easy to compare.
      const contribution = weight > 0
        ? rating * weight
        : (100 - rating) * Math.abs(weight);

      weightedTotal += contribution;
      weightTotal += Math.abs(weight);
    }

    return weightTotal > 0 ? weightedTotal / weightTotal : NaN;
  }

  function compareEntries(a, b, measurable) {
    const direction = measurable.direction === 'low' ? 1 : -1;
    const scoreDifference = direction * (a.score - b.score);
    if (Math.abs(scoreDifference) > 1e-9) return scoreDifference;
    return a.name.localeCompare(b.name);
  }

  function render() {
    wrap.replaceChildren();
    wrap.className = 'ratings-wrap';

    const guide = document.createElement('section');
    guide.className = 'ratings-guide';

    const guideHeading = document.createElement('div');
    guideHeading.className = 'ratings-section-heading';

    const guideTitle = document.createElement('h3');
    guideTitle.textContent = 'In-Game Measurables & Rating Influence';

    const guideCopy = document.createElement('p');
    guideCopy.textContent = 'Influence values come from the supplied rating matrix. The fixed “50” baseline row is excluded; only the 15 player ratings are shown.';

    guideHeading.append(guideTitle, guideCopy);
    guide.appendChild(guideHeading);

    const guideGrid = document.createElement('div');
    guideGrid.className = 'ratings-influence-grid';

    for (const measurable of MEASURABLES) {
      guideGrid.appendChild(buildInfluenceCard(measurable));
    }

    guide.appendChild(guideGrid);
    wrap.appendChild(guide);

    const rankingsSection = document.createElement('section');
    rankingsSection.className = 'ratings-rankings';

    const rankingsHeading = document.createElement('div');
    rankingsHeading.className = 'ratings-section-heading';

    const rankingsTitle = document.createElement('h3');
    rankingsTitle.textContent = 'Active Player Rankings';

    const rankingsCopy = document.createElement('p');
    rankingsCopy.textContent = rankings
      ? `Top ${LEADER_LIMIT} from ${activePlayerCount.toLocaleString()} active rostered/free-agent players, using current ratings only.`
      : 'Load a league file to rank its active players from their current ratings.';

    rankingsHeading.append(rankingsTitle, rankingsCopy);
    rankingsSection.appendChild(rankingsHeading);

    if (!rankings) {
      const empty = document.createElement('div');
      empty.className = 'ratings-rankings-empty empty-copy';
      const message = document.createElement('p');
      message.textContent = 'No active-player rating pool loaded yet.';
      empty.appendChild(message);
      rankingsSection.appendChild(empty);
      wrap.appendChild(rankingsSection);
      return;
    }

    const rankingGrid = document.createElement('div');
    rankingGrid.className = 'ratings-player-grid';

    for (const measurable of MEASURABLES) {
      rankingGrid.appendChild(buildRankingCard(measurable, rankings[measurable.key] || []));
    }

    rankingsSection.appendChild(rankingGrid);
    wrap.appendChild(rankingsSection);
  }

  function buildInfluenceCard(measurable) {
    const card = document.createElement('article');
    card.className = 'ratings-influence-card';

    const title = document.createElement('h4');
    title.textContent = measurable.label;

    const direction = document.createElement('span');
    direction.className = 'ratings-direction';
    direction.textContent = measurable.direction === 'low'
      ? 'Lower expected tendency ranks better'
      : 'Higher expected tendency ranks better';

    const influences = getInfluences(measurable);
    const list = document.createElement('div');
    list.className = 'ratings-influence-list';

    for (const influence of influences) {
      const chip = document.createElement('span');
      chip.className = `ratings-influence-chip${influence.weight < 0 ? ' is-negative' : ''}`;
      chip.textContent = `${influence.label} ${formatWeight(influence.weight)}`;
      list.appendChild(chip);
    }

    card.append(title, direction, list);
    return card;
  }

  function getInfluences(measurable) {
    return measurable.weights
      .map((weight, index) => ({
        label: RATING_DEFINITIONS[index].label,
        weight: Number(weight) || 0,
        order: index,
      }))
      .filter((entry) => entry.weight !== 0)
      .sort((a, b) => (
        Math.abs(b.weight) - Math.abs(a.weight)
        || a.order - b.order
      ));
  }

  function buildRankingCard(measurable, entries) {
    const card = document.createElement('article');
    card.className = 'ratings-player-card';

    const heading = document.createElement('div');
    heading.className = 'ratings-player-heading';

    const title = document.createElement('h4');
    title.textContent = measurable.label;

    const note = document.createElement('span');
    note.textContent = measurable.direction === 'low' ? 'Lower index = better' : 'Higher index = better';

    heading.append(title, note);
    card.appendChild(heading);

    const list = document.createElement('ol');
    list.className = 'ratings-player-list';

    entries.forEach((entry, index) => {
      const item = document.createElement('li');
      item.className = 'ratings-player-item';

      const rank = document.createElement('span');
      rank.className = 'ratings-player-rank';
      rank.textContent = String(index + 1);

      const photo = buildPhoto(entry);

      const copy = document.createElement('div');
      copy.className = 'ratings-player-copy';

      const name = document.createElement('strong');
      name.textContent = entry.name;

      const meta = document.createElement('span');
      const parts = [entry.pos, entry.teamName].filter(Boolean);
      if (entry.pid !== null) parts.push(`PID ${entry.pid}`);
      meta.textContent = parts.join(' · ');

      copy.append(name, meta);

      const score = document.createElement('strong');
      score.className = 'ratings-player-score';
      score.textContent = entry.score.toFixed(1);

      item.append(rank, photo, copy, score);
      list.appendChild(item);
    });

    card.appendChild(list);
    return card;
  }

  function buildPhoto(player) {
    const photo = document.createElement('div');
    photo.className = 'ratings-player-photo';

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

  function getCurrentTeamName(tid) {
    if (tid === -1) return 'Free Agent';

    const rows = typeof fullTimeline !== 'undefined' && Array.isArray(fullTimeline?.rows)
      ? fullTimeline.rows
      : [];
    const row = rows.find((candidate) => Number(candidate?.tid) === tid);
    if (!row) return tid >= 0 ? `TID ${tid}` : '';

    if (row.entriesByYear instanceof Map && row.entriesByYear.size) {
      const latestYear = Math.max(...Array.from(row.entriesByYear.keys()).map(Number).filter(Number.isFinite));
      const entry = row.entriesByYear.get(latestYear);
      if (entry?.teamName) return entry.teamName;
    }

    return row.latestLocation || `TID ${tid}`;
  }

  function getPlayerName(player = {}) {
    const direct = typeof player.name === 'string' ? player.name.trim() : '';
    if (direct) return direct;

    const first = typeof player.firstName === 'string' ? player.firstName.trim() : '';
    const last = typeof player.lastName === 'string' ? player.lastName.trim() : '';
    return [first, last].filter(Boolean).join(' ') || 'Unknown Player';
  }

  function getPlayerPosition(ratingRow = {}, player = {}) {
    const value = ratingRow?.pos || ratingRow?.position || player?.pos || player?.position || player?.draft?.pos;
    return typeof value === 'string' && value.trim()
      ? value.trim().toUpperCase()
      : 'UNK';
  }

  function formatWeight(weight) {
    const number = Number(weight);
    if (!Number.isFinite(number)) return '';
    return `${number > 0 ? '+' : ''}${Number.isInteger(number) ? number.toFixed(0) : number}`;
  }

  function normalizeImageUrl(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function readNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function renderLoading(message) {
    wrap.className = 'ratings-wrap empty-state';
    wrap.replaceChildren();

    const empty = document.createElement('div');
    empty.className = 'empty-copy';
    const text = document.createElement('p');
    text.textContent = message;
    text.setAttribute('aria-live', 'polite');
    empty.appendChild(text);
    wrap.appendChild(empty);
  }

  function renderError(message) {
    wrap.className = 'ratings-wrap empty-state';
    wrap.replaceChildren();

    const empty = document.createElement('div');
    empty.className = 'empty-copy';
    const text = document.createElement('p');
    text.textContent = message;
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
      console.warn('Could not save Ratings rankings.', error);
    }
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      console.warn('Could not restore Ratings rankings.', error);
      return null;
    }
  }

  function normalizeSavedRankings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const result = {};
    let hasAny = false;

    for (const measurable of MEASURABLES) {
      const entries = Array.isArray(value[measurable.key])
        ? value[measurable.key].slice(0, LEADER_LIMIT).map((entry) => ({
            ...entry,
            pid: readNumber(entry?.pid),
            tid: readNumber(entry?.tid),
            name: String(entry?.name || 'Unknown Player'),
            pos: String(entry?.pos || 'UNK'),
            teamName: String(entry?.teamName || ''),
            imgURL: normalizeImageUrl(entry?.imgURL),
            score: Number(entry?.score),
          })).filter((entry) => Number.isFinite(entry.score))
        : [];

      result[measurable.key] = entries;
      if (entries.length) hasAny = true;
    }

    return hasAny ? result : null;
  }

  render();
})();
