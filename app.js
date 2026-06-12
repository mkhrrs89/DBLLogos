const fileInput = document.getElementById('leagueFile');
const statusMessage = document.getElementById('statusMessage');
const teamCountEl = document.getElementById('teamCount');
const yearRangeEl = document.getElementById('yearRange');
const cellCountEl = document.getElementById('cellCount');
const timelineWrap = document.getElementById('timelineWrap');
const mobileFullscreenBtn = document.getElementById('mobileFullscreenBtn');
const closeFullscreenBtn = document.getElementById('closeFullscreenBtn');
const activeTeamsOnlyToggle = document.getElementById('activeTeamsOnlyToggle');
const activeTeamsOnlyToggleFullscreen = document.getElementById('activeTeamsOnlyToggleFullscreen');
const smallLogosToggle = document.getElementById('smallLogosToggle');
const smallLogosToggleFullscreen = document.getElementById('smallLogosToggleFullscreen');
const teamSortModeSelect = document.getElementById('teamSortMode');
const timelineFullscreen = document.getElementById('timelineFullscreen');
const timelineFullscreenWrap = document.getElementById('timelineFullscreenWrap');
const SAVED_TIMELINE_KEY = 'dbl-logo-timeline:v1';
const SAVED_BANNERS_KEY = 'dbl-logo-banners:v1';
const SAVED_UNIFORMS_KEY = 'dbl-logo-uniforms:v1';
const SCORING_RECORD_LIMIT = 100;
const logosTabBtn = document.getElementById('logosTabBtn');
const bannersTabBtn = document.getElementById('bannersTabBtn');
const uniformsTabBtn = document.getElementById('uniformsTabBtn');
const rankingsTabBtn = document.getElementById('rankingsTabBtn');
const recordsTabBtn = document.getElementById('recordsTabBtn');
const logosPanel = document.getElementById('logosPanel');
const bannersPanel = document.getElementById('bannersPanel');
const uniformsPanel = document.getElementById('uniformsPanel');
const rankingsPanel = document.getElementById('rankingsPanel');
const recordsPanel = document.getElementById('recordsPanel');
const bannersWrap = document.getElementById('bannersWrap');
const uniformsWrap = document.getElementById('uniformsWrap');
const rankingsWrap = document.getElementById('rankingsWrap');
const recordsWrap = document.getElementById('recordsWrap');
const uniformYearSelect = document.getElementById('uniformYearSelect');
const importBannersBtn = document.getElementById('importBannersBtn');
const exportBannersBtn = document.getElementById('exportBannersBtn');
const bannerImportFile = document.getElementById('bannerImportFile');
const importUniformsBtn = document.getElementById('importUniformsBtn');
const exportUniformsBtn = document.getElementById('exportUniformsBtn');
const uniformImportFile = document.getElementById('uniformImportFile');
const clearLeagueFileBtn = document.getElementById('clearLeagueFileBtn');
let fullTimeline = null;
let currentTimeline = null;
let teamSortMode = 'alpha';
let savedBannersByYear = loadSavedBanners();
let savedUniformsByYear = loadSavedUniforms();
let selectedUniformYear = null;
let isLeagueFileCleared = false;
let useSmallLogos = false;

restoreSavedTimeline();
setActiveTab('logos');
renderBanners(fullTimeline);
renderUniforms(fullTimeline);
renderRankings(fullTimeline);
renderRecords(fullTimeline);

logosTabBtn?.addEventListener('click', () => setActiveTab('logos'));
bannersTabBtn?.addEventListener('click', () => setActiveTab('banners'));
uniformsTabBtn?.addEventListener('click', () => setActiveTab('uniforms'));
rankingsTabBtn?.addEventListener('click', () => setActiveTab('rankings'));
recordsTabBtn?.addEventListener('click', () => setActiveTab('records'));
importBannersBtn?.addEventListener('click', () => bannerImportFile?.click());
bannerImportFile?.addEventListener('change', importBannerLinksFromFile);
exportBannersBtn?.addEventListener('click', exportBannerLinksToFile);
importUniformsBtn?.addEventListener('click', () => uniformImportFile?.click());
uniformImportFile?.addEventListener('change', importUniformLinksFromFile);
exportUniformsBtn?.addEventListener('click', exportUniformLinksToFile);
clearLeagueFileBtn?.addEventListener('click', clearLoadedLeagueFile);
uniformYearSelect?.addEventListener('change', () => {
  selectedUniformYear = Number(uniformYearSelect.value) || null;
  renderUniforms(fullTimeline);
});

fileInput.addEventListener('change', async (event) => {
  const [file] = event.target.files || [];
  if (!file) return;

  setStatus(`Loading ${file.name}...`, 'info');

  try {
    const text = await readLeagueFile(file);
    const league = JSON.parse(text);
    const timeline = buildTimelineData(league);
    isLeagueFileCleared = false;
    setTimeline(timeline);
    persistTimeline(file.name, timeline);
    setStatus(`Loaded ${file.name}.`, 'info');
  } catch (error) {
    console.error(error);
    if (hasSavedTimeline()) {
      setStatus(
        `Could not load ${file.name}. Keeping your currently saved timeline. ${error.message || ''}`.trim(),
        'error',
      );
    } else {
      timelineWrap.className = 'timeline-wrap empty-state';
      timelineWrap.innerHTML = '<div class="empty-copy"><p>Could not load that league file.</p></div>';
      resetStats();
      setStatus(error.message || 'Could not parse league file.', 'error');
    }
  }
});

mobileFullscreenBtn.addEventListener('click', () => {
  if (!currentTimeline || isLeagueFileCleared) return;
  timelineFullscreen.hidden = false;
  document.body.classList.add('fullscreen-open');
  renderTimelineInto(currentTimeline, timelineFullscreenWrap);
});

activeTeamsOnlyToggle.addEventListener('change', () => {
  setActiveTeamsOnlyEnabled(activeTeamsOnlyToggle.checked);
});

teamSortModeSelect?.addEventListener('change', () => {
  teamSortMode = teamSortModeSelect.value === 'tid' ? 'tid' : 'alpha';
  if (!fullTimeline || isLeagueFileCleared) return;
  setTimeline(fullTimeline);
});

activeTeamsOnlyToggleFullscreen?.addEventListener('change', () => {
  setActiveTeamsOnlyEnabled(activeTeamsOnlyToggleFullscreen.checked);
});
smallLogosToggle?.addEventListener('change', () => {
  setUseSmallLogosEnabled(smallLogosToggle.checked);
});
smallLogosToggleFullscreen?.addEventListener('change', () => {
  setUseSmallLogosEnabled(smallLogosToggleFullscreen.checked);
});

closeFullscreenBtn.addEventListener('click', closeFullscreenTimeline);
timelineFullscreen.addEventListener('click', (event) => {
  if (event.target === timelineFullscreen) {
    closeFullscreenTimeline();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !timelineFullscreen.hidden) {
    closeFullscreenTimeline();
  }
});


function clearLoadedLeagueFile() {
  try {
    localStorage.removeItem(SAVED_TIMELINE_KEY);
  } catch (error) {
    console.warn('Could not clear saved timeline from localStorage.', error);
  }
  isLeagueFileCleared = true;
  currentTimeline = null;
  fullTimeline = null;
  closeFullscreenTimeline();
  timelineWrap.className = 'timeline-wrap empty-state';
  timelineWrap.innerHTML = '<div class="empty-copy"><p>No league file loaded yet.</p></div>';
  resetStats();
  renderBanners(null);
  renderUniforms(null);
  renderRankings(null);
  renderRecords(null);
  if (fileInput) {
    fileInput.value = '';
  }
  setStatus('Cleared loaded league file and generated views. Banner and uniform links were not changed.', 'info');
}

function setStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
}

function resetStats() {
  teamCountEl.textContent = '—';
  yearRangeEl.textContent = '—';
  cellCountEl.textContent = '—';
}

function persistTimeline(fileName, timeline) {
  try {
    const snapshot = {
      fileName,
      savedAt: new Date().toISOString(),
      timeline: serializeTimeline(timeline),
    };
    localStorage.setItem(SAVED_TIMELINE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('Could not save timeline to localStorage.', error);
  }
}

function hasSavedTimeline() {
  try {
    return Boolean(localStorage.getItem(SAVED_TIMELINE_KEY));
  } catch (error) {
    console.warn('Could not check saved timeline in localStorage.', error);
    return false;
  }
}

function restoreSavedTimeline() {
  try {
    const raw = localStorage.getItem(SAVED_TIMELINE_KEY);
    if (!raw) return;

    const snapshot = JSON.parse(raw);
    const timeline = deserializeTimeline(snapshot?.timeline);
    if (!timeline) return;

    setTimeline(timeline);

    const savedStamp = snapshot.savedAt
      ? ` Last saved ${new Date(snapshot.savedAt).toLocaleString()}.`
      : '';
    const fileText = snapshot.fileName ? `Saved league: ${snapshot.fileName}.` : 'Restored saved league timeline.';
    setStatus(`${fileText} Upload a new league file to replace it.${savedStamp}`, 'info');
  } catch (error) {
    console.warn('Could not restore saved timeline from localStorage.', error);

    try {
      localStorage.removeItem(SAVED_TIMELINE_KEY);
    } catch (removeError) {
      console.warn('Could not clear saved timeline from localStorage.', removeError);
    }
  }
}

function serializeTimeline(timeline) {
  return {
    years: timeline.years,
    minYear: timeline.minYear,
    maxYear: timeline.maxYear,
    rows: timeline.rows.map((row) => ({
      tid: row.tid,
      latestLocation: row.latestLocation,
      firstSeason: row.firstSeason,
      lastSeason: row.lastSeason,
      years: row.years,
      entriesByYear: Array.from(row.entriesByYear.entries()).map(([year, entry]) => [year, {
        year: entry.year,
        teamName: entry.teamName,
        region: entry.region,
        name: entry.name,
        primaryLogoURL: entry.primaryLogoURL,
        smallLogoURL: entry.smallLogoURL,
        fallbackLogoURL: entry.fallbackLogoURL,
      }]),
    })),
    rankings: Array.isArray(timeline.rankings) ? timeline.rankings : [],
    scoringRecords: normalizeScoringRecords(timeline.scoringRecords),
  };
}

function deserializeTimeline(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.rows) || !Array.isArray(snapshot.years)) {
    return null;
  }

  return {
    years: snapshot.years,
    minYear: snapshot.minYear,
    maxYear: snapshot.maxYear,
    rankings: Array.isArray(snapshot.rankings) ? snapshot.rankings : [],
    scoringRecords: normalizeScoringRecords(snapshot.scoringRecords),
    rows: snapshot.rows.map((row) => ({
      tid: row.tid,
      latestLocation: row.latestLocation,
      firstSeason: row.firstSeason,
      lastSeason: row.lastSeason,
      years: Array.isArray(row.years) ? row.years : [],
      entriesByYear: new Map(
        (Array.isArray(row.entriesByYear) ? row.entriesByYear : []).map(([year, entry]) => {
          const normalizedPrimary = normalizeLogoUrl(entry?.primaryLogoURL || entry?.logoURL || '');
          const normalizedSmall = normalizeLogoUrl(entry?.smallLogoURL || '');
          const normalizedFallback = normalizeLogoUrl(entry?.fallbackLogoURL || normalizedPrimary || normalizedSmall || '');
          return [year, {
            year,
            teamName: entry?.teamName || buildTeamSeasonName(entry?.region, entry?.name),
            region: entry?.region || '',
            name: entry?.name || '',
            primaryLogoURL: normalizedPrimary,
            smallLogoURL: normalizedSmall,
            fallbackLogoURL: normalizedFallback,
          }];
        }),
      ),
    })),
  };
}

async function readLeagueFile(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isGzip = file.name.endsWith('.gz') || (bytes[0] === 0x1f && bytes[1] === 0x8b);

  if (isGzip) {
    if (!window.pako) {
      throw new Error('Gzip support did not load.');
    }
    return window.pako.ungzip(bytes, { to: 'string' });
  }

  return new TextDecoder().decode(bytes);
}

function buildTimelineData(league) {
  if (!league || !Array.isArray(league.teams)) {
    throw new Error('This file does not look like a valid league export.');
  }

  const statsByTidSeason = buildStatsByTidSeason(league.teamStats);
  const rows = league.teams
    .map((team) => normalizeTeamTimeline(team, statsByTidSeason))
    .filter((row) => row.years.length > 0)
    .sort((a, b) => a.firstSeason - b.firstSeason);

  if (!rows.length) {
    throw new Error('No team season history was found in this file.');
  }

  const minYear = Math.min(...rows.map((row) => row.firstSeason));
  const maxYear = Math.max(...rows.map((row) => row.lastSeason));
  const years = range(minYear, maxYear);
  const rankings = buildAllTimeTeamRankings(rows, statsByTidSeason);
  const scoringRecords = buildScoringRecords(league, rows);

  return {
    years,
    rows,
    minYear,
    maxYear,
    rankings,
    scoringRecords,
  };
}

function buildStatsByTidSeason(teamStats) {
  const statsByTidSeason = new Map();
  if (!Array.isArray(teamStats)) return statsByTidSeason;

  for (const stat of teamStats) {
    if (!Number.isFinite(stat?.tid) || !Number.isFinite(stat?.season)) continue;
    const key = buildTidSeasonKey(stat.tid, stat.season);
    const groupedStats = statsByTidSeason.get(key) || { regular: null, playoffs: null };
    if (stat.playoffs) {
      groupedStats.playoffs = stat;
    } else {
      groupedStats.regular = stat;
    }
    statsByTidSeason.set(key, groupedStats);
  }

  return statsByTidSeason;
}

function buildTidSeasonKey(tid, season) {
  return `${tid}:${season}`;
}

function normalizeTeamTimeline(team, statsByTidSeason = new Map()) {
  const seasons = Array.isArray(team.seasons)
    ? team.seasons
        .filter((season) => Number.isFinite(season?.season))
        .sort((a, b) => a.season - b.season)
    : [];

  const years = seasons.map((season) => season.season);
  const firstSeason = years.length ? years[0] : null;
  const lastSeason = years.length ? years[years.length - 1] : null;
  const latestSeason = seasons[seasons.length - 1] || {};
  const latestLocation = latestSeason.region || team.region || 'Unknown';

  const entriesByYear = new Map();
  let lastKnownLogo = null;

  for (const season of seasons) {
    const primaryLogoURL = normalizeLogoUrl(season.imgURL || team.imgURL || '');
    const smallLogoURL = normalizeLogoUrl(season.imgURLSmall || team.imgURLSmall || '');
    const fallbackLogo = primaryLogoURL || smallLogoURL;
    const seasonRegion = season.region || team.region || latestLocation;
    const seasonName = season.name || team.name || '';
    const teamName = buildTeamSeasonName(seasonRegion, seasonName);
    const stats = statsByTidSeason.get(buildTidSeasonKey(team.tid, season.season)) || {};
    if (fallbackLogo) {
      lastKnownLogo = fallbackLogo;
    }
    entriesByYear.set(season.season, {
      year: season.season,
      teamName,
      region: seasonRegion,
      name: seasonName,
      season,
      regularStats: stats.regular || null,
      playoffStats: stats.playoffs || null,
      primaryLogoURL: primaryLogoURL || '',
      smallLogoURL: smallLogoURL || '',
      fallbackLogoURL: fallbackLogo || lastKnownLogo || '',
    });
  }

  return {
    tid: team.tid,
    latestLocation,
    firstSeason,
    lastSeason,
    years,
    entriesByYear,
  };
}

function normalizeLogoUrl(url) {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  return trimmed;
}


function buildAllTimeTeamRankings(rows) {
  const rankings = [];
  const maxRoundsWonByYear = getMaxRoundsWonByYear(rows);
  for (const row of rows) {
    for (const [year, entry] of row.entriesByYear.entries()) {
      rankings.push(calculateTeamSeasonRanking(row, year, entry, maxRoundsWonByYear.get(year) || 0));
    }
  }

  return rankings.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    if (b.regularSeasonScore !== a.regularSeasonScore) return b.regularSeasonScore - a.regularSeasonScore;
    if (b.playoffScore !== a.playoffScore) return b.playoffScore - a.playoffScore;
    return a.label.localeCompare(b.label);
  });
}

function getMaxRoundsWonByYear(rows) {
  const maxRoundsWonByYear = new Map();
  for (const row of rows) {
    for (const [year, entry] of row.entriesByYear.entries()) {
      const roundsWon = Number(entry?.season?.playoffRoundsWon ?? entry?.season?.roundsWon);
      if (!Number.isFinite(roundsWon) || roundsWon < 0) continue;
      maxRoundsWonByYear.set(year, Math.max(maxRoundsWonByYear.get(year) || 0, roundsWon));
    }
  }
  return maxRoundsWonByYear;
}

function calculateTeamSeasonRanking(row, year, entry, maxRoundsWon) {
  const season = entry.season || {};
  const regularStats = entry.regularStats || {};
  const playoffStats = entry.playoffStats || {};
  const regularWins = readNumber(season.won, regularStats.won, regularStats.wins);
  const regularLosses = readNumber(season.lost, regularStats.lost, regularStats.losses);
  const regularWinPct = calculateWinPct(regularWins, regularLosses);
  const regularNetRating = readNumber(
    regularStats.nrtg,
    regularStats.netRating,
    regularStats.netRtg,
    calculateRatingDiff(regularStats),
    season.nrtg,
    season.netRating,
  );
  const srs = readNumber(regularStats.srs, season.srs);
  const playoffWins = readNumber(playoffStats.won, playoffStats.wins, season.playoffWins, season.playoffWon);
  const playoffLosses = readNumber(playoffStats.lost, playoffStats.losses, season.playoffLosses, season.playoffLost);
  const playoffWinPct = calculateWinPct(playoffWins, playoffLosses);
  const playoffRoundsWon = Number(season.playoffRoundsWon ?? season.roundsWon);
  const hasKnownPlayoffRounds = Number.isFinite(playoffRoundsWon);
  const hasPlayoffAppearance = (hasKnownPlayoffRounds && playoffRoundsWon >= 0) || playoffWins + playoffLosses > 0;
  const playoffNetRating = readNumber(
    playoffStats.nrtg,
    playoffStats.netRating,
    playoffStats.netRtg,
    calculateRatingDiff(playoffStats),
    season.playoffNetRating,
  );
  const roundAdvancementScore = calculateRoundAdvancementScore(season, maxRoundsWon);
  const championshipBonus = isChampionSeason(season, maxRoundsWon) ? 100 : 0;
  const contextBonus = readNumber(season.contextBonus, season.hype, season.playoffHype) || 0;
  const regularSeasonScore = (regularWinPct * 100 * 0.45)
    + ((50 + regularNetRating * 4) * 0.35)
    + ((50 + srs * 4) * 0.20);
  const playoffScore = hasPlayoffAppearance
    ? (playoffWinPct * 100 * 0.35)
      + ((50 + playoffNetRating * 4) * 0.35)
      + (roundAdvancementScore * 0.30)
    : 0;
  const finalScore = (regularSeasonScore * 0.45)
    + (playoffScore * 0.40)
    + (championshipBonus * 0.10)
    + (contextBonus * 0.05);
  const logoURL = entry.primaryLogoURL || entry.smallLogoURL || entry.fallbackLogoURL || '';
  const teamName = entry.teamName || row.latestLocation || 'Unknown Team';

  return {
    tid: row.tid,
    year,
    teamName,
    label: `${year} ${teamName}`,
    logoURL,
    finalScore: clampScore(finalScore),
    regularSeasonScore: clampScore(regularSeasonScore),
    playoffScore: clampScore(playoffScore),
  };
}

function buildTeamSeasonName(region, name) {
  const cleanRegion = typeof region === 'string' ? region.trim() : '';
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (cleanRegion && cleanName) return `${cleanRegion} ${cleanName}`;
  return cleanRegion || cleanName || 'Unknown Team';
}

function readOptionalNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function readNumber(...values) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return 0;
}

function calculateWinPct(wins, losses) {
  const games = wins + losses;
  if (!games) return 0;
  return wins / games;
}

function calculateRatingDiff(stats = {}) {
  const offensiveRating = Number(stats.ortg ?? stats.offRating ?? stats.offRtg);
  const defensiveRating = Number(stats.drtg ?? stats.defRating ?? stats.defRtg);
  if (!Number.isFinite(offensiveRating) || !Number.isFinite(defensiveRating)) return undefined;
  return offensiveRating - defensiveRating;
}

function calculateRoundAdvancementScore(season = {}, maxRoundsWon = 0) {
  const roundsWon = readNumber(season.playoffRoundsWon, season.roundsWon);
  if (roundsWon < 0 || maxRoundsWon <= 0) return 0;
  return Math.min(100, (roundsWon / maxRoundsWon) * 100);
}

function isChampionSeason(season = {}, maxRoundsWon = 0) {
  const roundsWon = readNumber(season.playoffRoundsWon, season.roundsWon);
  return season.champ === true
    || season.champion === true
    || season.playoffFinish === 'champion'
    || (maxRoundsWon > 0 && roundsWon === maxRoundsWon);
}

function clampScore(score) {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Number(score.toFixed(2)));
}


function buildScoringRecords(league, rows) {
  const records = [];
  const playerNameByPid = buildPlayerNameByPid(league);
  const teamNameByTidSeason = buildTeamNameByTidSeason(rows);

  if (!Array.isArray(league.games)) return records;

  for (const game of league.games) {
    const teamEntries = getGameTeamEntries(game);
    for (const teamEntry of teamEntries) {
      const players = Array.isArray(teamEntry?.players) ? teamEntry.players : [];
      for (const player of players) {
        const points = readPlayerPoints(player);
        if (!Number.isFinite(points)) continue;
        addScoringRecord(records, {
          points,
          playerName: getPlayerGameName(player, playerNameByPid),
          pid: readOptionalNumber(player?.pid),
          tid: Number.isFinite(teamEntry?.tid) ? teamEntry.tid : readOptionalNumber(player?.tid),
          teamName: getTeamGameName(teamEntry, game, teamNameByTidSeason),
          opponentName: getOpponentGameName(teamEntry, teamEntries, game, teamNameByTidSeason),
          season: readGameSeason(game),
          gameType: game?.playoffs ? 'Playoffs' : 'Regular season',
          gid: readGameId(game),
        });
      }
    }
  }

  return records;
}

function addScoringRecord(records, record) {
  if (records.length >= SCORING_RECORD_LIMIT && compareScoringRecords(record, records[records.length - 1]) >= 0) {
    return;
  }

  const insertIndex = records.findIndex((existingRecord) => compareScoringRecords(record, existingRecord) < 0);
  if (insertIndex === -1) {
    records.push(record);
  } else {
    records.splice(insertIndex, 0, record);
  }

  if (records.length > SCORING_RECORD_LIMIT) {
    records.length = SCORING_RECORD_LIMIT;
  }
}

function normalizeScoringRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.slice().sort(compareScoringRecords).slice(0, SCORING_RECORD_LIMIT);
}

function compareScoringRecords(a = {}, b = {}) {
  const pointsDifference = (b.points || 0) - (a.points || 0);
  if (pointsDifference !== 0) return pointsDifference;

  const seasonDifference = (b.season || 0) - (a.season || 0);
  if (seasonDifference !== 0) return seasonDifference;

  return String(a.playerName || '').localeCompare(String(b.playerName || ''));
}

function buildPlayerNameByPid(leagueOrPlayers) {
  const playerNameByPid = new Map();
  const playerCollections = Array.isArray(leagueOrPlayers)
    ? [leagueOrPlayers]
    : getLeaguePlayerCollections(leagueOrPlayers);

  for (const players of playerCollections) {
    for (const player of players) {
      const pid = readOptionalNumber(player?.pid);
      if (pid === null) continue;
      const playerName = getRosterPlayerName(player);
      const existingName = playerNameByPid.get(pid);
      if (!existingName || existingName === 'Unknown Player' || playerName !== 'Unknown Player') {
        playerNameByPid.set(pid, playerName);
      }
    }
  }
  return playerNameByPid;
}

function getLeaguePlayerCollections(league = {}) {
  const playerCollectionKeys = [
    'players',
    'retiredPlayers',
    'releasedPlayers',
    'freeAgents',
  ];

  return playerCollectionKeys
    .map((key) => league?.[key])
    .filter(Array.isArray);
}

function getRosterPlayerName(player = {}) {
  const directName = typeof player.name === 'string' ? player.name.trim() : '';
  if (directName) return directName;
  const firstName = typeof player.firstName === 'string' ? player.firstName.trim() : '';
  const lastName = typeof player.lastName === 'string' ? player.lastName.trim() : '';
  return [firstName, lastName].filter(Boolean).join(' ') || 'Unknown Player';
}

function buildTeamNameByTidSeason(rows) {
  const teamNameByTidSeason = new Map();
  for (const row of rows) {
    for (const [year, entry] of row.entriesByYear.entries()) {
      teamNameByTidSeason.set(buildTidSeasonKey(row.tid, year), entry.teamName || row.latestLocation || 'Unknown Team');
    }
  }
  return teamNameByTidSeason;
}

function getGameTeamEntries(game = {}) {
  if (Array.isArray(game.teams)) return game.teams;

  const teams = [];
  if (game.won && typeof game.won === 'object') teams.push(game.won);
  if (game.lost && typeof game.lost === 'object') teams.push(game.lost);
  return teams;
}

function readPlayerPoints(player = {}) {
  const points = Number(player.pts ?? player.points ?? player.stat?.pts ?? player.stats?.pts);
  return Number.isFinite(points) ? points : undefined;
}

function getPlayerGameName(player = {}, playerNameByPid = new Map()) {
  const directName = getRosterPlayerName(player);
  if (directName !== 'Unknown Player') return directName;
  const pid = readOptionalNumber(player.pid);
  return pid === null ? 'Unknown Player' : playerNameByPid.get(pid) || 'Unknown Player';
}

function getTeamGameName(teamEntry = {}, game = {}, teamNameByTidSeason = new Map()) {
  const directName = buildTeamSeasonName(teamEntry.region || teamEntry.name || '', teamEntry.name && teamEntry.region ? teamEntry.name : '');
  if (directName !== 'Unknown Team') return directName;

  const tid = Number.isFinite(teamEntry.tid) ? teamEntry.tid : null;
  const season = readGameSeason(game);
  if (tid !== null && season !== null) {
    return teamNameByTidSeason.get(buildTidSeasonKey(tid, season)) || `TID ${tid}`;
  }
  return 'Unknown Team';
}

function getOpponentGameName(teamEntry = {}, teamEntries = [], game = {}, teamNameByTidSeason = new Map()) {
  const opponent = teamEntries.find((candidate) => candidate !== teamEntry);
  return opponent ? getTeamGameName(opponent, game, teamNameByTidSeason) : '';
}

function readGameSeason(game = {}) {
  const season = Number(game.season ?? game.year);
  return Number.isFinite(season) ? season : null;
}

function readGameId(game = {}) {
  const gid = game.gid ?? game.id;
  return gid === null || gid === undefined ? '' : String(gid);
}

function renderRecords(timeline) {
  recordsWrap.innerHTML = '';
  const records = normalizeScoringRecords(timeline?.scoringRecords);
  if (!records.length) {
    recordsWrap.className = 'records-wrap empty-state';
    const empty = document.createElement('div');
    empty.className = 'empty-copy';
    empty.innerHTML = '<p>Load a league file with game box scores to show single-game scoring records.</p>';
    recordsWrap.appendChild(empty);
    return;
  }

  recordsWrap.className = 'records-wrap';
  const list = document.createElement('ol');
  list.className = 'records-list';

  records.forEach((record) => {
    const item = document.createElement('li');
    item.className = 'record-item';

    const points = document.createElement('strong');
    points.className = 'record-points';
    points.textContent = `${record.points} pts`;

    const details = document.createElement('div');
    details.className = 'record-details';

    const player = document.createElement('strong');
    player.textContent = record.playerName;

    const meta = document.createElement('span');
    meta.className = 'record-meta';
    const opponentText = record.opponentName ? ` vs ${record.opponentName}` : '';
    const gidText = record.gid ? ` · Game ${record.gid}` : '';
    meta.textContent = `${record.season || 'Unknown season'} · ${record.teamName}${opponentText} · ${record.gameType}${gidText}`;

    details.append(player, meta);
    item.append(points, details);
    list.appendChild(item);
  });

  recordsWrap.appendChild(list);
}

function renderTimeline(timeline) {
  return renderTimelineInto(timeline, timelineWrap);
}

function setTimeline(timeline) {
  fullTimeline = timeline;
  currentTimeline = getVisibleTimeline(timeline);
  renderTimeline(currentTimeline);
  renderBanners(fullTimeline);
  renderUniforms(fullTimeline);
  renderRankings(fullTimeline);
  renderRecords(fullTimeline);
  updateStats(currentTimeline);
  if (!timelineFullscreen.hidden) {
    renderTimelineInto(currentTimeline, timelineFullscreenWrap);
  }
}

function setActiveTab(tabName) {
  const isLogos = tabName === 'logos';
  const isBanners = tabName === 'banners';
  const isUniforms = tabName === 'uniforms';
  const isRankings = tabName === 'rankings';
  const isRecords = tabName === 'records';
  logosTabBtn?.classList.toggle('active', isLogos);
  bannersTabBtn?.classList.toggle('active', isBanners);
  uniformsTabBtn?.classList.toggle('active', isUniforms);
  rankingsTabBtn?.classList.toggle('active', isRankings);
  recordsTabBtn?.classList.toggle('active', isRecords);
  logosTabBtn?.setAttribute('aria-selected', String(isLogos));
  bannersTabBtn?.setAttribute('aria-selected', String(isBanners));
  uniformsTabBtn?.setAttribute('aria-selected', String(isUniforms));
  rankingsTabBtn?.setAttribute('aria-selected', String(isRankings));
  recordsTabBtn?.setAttribute('aria-selected', String(isRecords));
  logosPanel.hidden = !isLogos;
  bannersPanel.hidden = !isBanners;
  uniformsPanel.hidden = !isUniforms;
  rankingsPanel.hidden = !isRankings;
  recordsPanel.hidden = !isRecords;
}

function loadSavedBanners() {
  try {
    const raw = localStorage.getItem(SAVED_BANNERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (error) {
    console.warn('Could not restore saved banners from localStorage.', error);
    return {};
  }
}

function saveBanners() {
  try {
    localStorage.setItem(SAVED_BANNERS_KEY, JSON.stringify(savedBannersByYear));
  } catch (error) {
    console.warn('Could not save banners to localStorage.', error);
  }
}

function loadSavedUniforms() {
  try {
    const raw = localStorage.getItem(SAVED_UNIFORMS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (error) {
    console.warn('Could not restore saved uniforms from localStorage.', error);
    return {};
  }
}

function saveUniforms() {
  try {
    localStorage.setItem(SAVED_UNIFORMS_KEY, JSON.stringify(savedUniformsByYear));
  } catch (error) {
    console.warn('Could not save uniforms to localStorage.', error);
  }
}

function buildBannerExportPayload() {
  const linksByYear = Object.fromEntries(
    Object.entries(savedBannersByYear)
      .map(([year, value]) => [String(year), typeof value === 'string' ? value.trim() : ''])
      .filter(([, value]) => Boolean(value)),
  );

  return {
    exportedAt: new Date().toISOString(),
    linksByYear,
  };
}

async function importBannerLinksFromFile(event) {
  const [file] = event.target.files || [];
  bannerImportFile.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const links = parsed?.linksByYear;

    if (!links || typeof links !== 'object' || Array.isArray(links)) {
      throw new Error('Banner import file is missing a valid "linksByYear" object.');
    }

    const cleanedLinks = {};
    for (const [year, url] of Object.entries(links)) {
      if (typeof url !== 'string') continue;
      const trimmed = url.trim();
      if (!trimmed) continue;
      cleanedLinks[String(year)] = trimmed;
    }

    savedBannersByYear = cleanedLinks;
    saveBanners();
    renderBanners(fullTimeline);
    setStatus(`Imported ${Object.keys(cleanedLinks).length} banner links from ${file.name}.`, 'info');
  } catch (error) {
    console.error(error);
    setStatus(error?.message || `Could not import banner links from ${file.name}.`, 'error');
  }
}

function exportBannerLinksToFile() {
  const payload = buildBannerExportPayload();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = buildExportFileTimestamp();

  const link = document.createElement('a');
  link.href = url;
  link.download = `dbl-banner-links-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  setStatus(`Exported ${Object.keys(payload.linksByYear).length} banner links.`, 'info');
}

function buildUniformExportPayload() {
  const linksByYearTeam = Object.fromEntries(
    Object.entries(savedUniformsByYear)
      .map(([key, value]) => [String(key), typeof value === 'string' ? value.trim() : ''])
      .filter(([, value]) => Boolean(value)),
  );

  return {
    exportedAt: new Date().toISOString(),
    linksByYearTeam,
  };
}

async function importUniformLinksFromFile(event) {
  const [file] = event.target.files || [];
  uniformImportFile.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const links = parsed?.linksByYearTeam;

    if (!links || typeof links !== 'object' || Array.isArray(links)) {
      throw new Error('Uniform import file is missing a valid "linksByYearTeam" object.');
    }

    const cleanedLinks = {};
    for (const [key, url] of Object.entries(links)) {
      if (typeof url !== 'string') continue;
      const trimmed = url.trim();
      if (!trimmed) continue;
      cleanedLinks[String(key)] = trimmed;
    }

    savedUniformsByYear = cleanedLinks;
    saveUniforms();
    renderUniforms(fullTimeline);
    setStatus(`Imported ${Object.keys(cleanedLinks).length} uniform links from ${file.name}.`, 'info');
  } catch (error) {
    console.error(error);
    setStatus(error?.message || `Could not import uniform links from ${file.name}.`, 'error');
  }
}

function exportUniformLinksToFile() {
  const payload = buildUniformExportPayload();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = buildExportFileTimestamp();

  const link = document.createElement('a');
  link.href = url;
  link.download = `dbl-uniform-links-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  setStatus(`Exported ${Object.keys(payload.linksByYearTeam).length} uniform links.`, 'info');
}


function buildExportFileTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:]/g, '-').replace(/\..+$/, '');
}

function renderBanners(timeline) {
  bannersWrap.innerHTML = '';
  if (!timeline || !Array.isArray(timeline.years) || timeline.years.length === 0) {
    bannersWrap.className = 'banners-wrap empty-state';
    const empty = document.createElement('div');
    empty.className = 'empty-copy';
    empty.innerHTML = '<p>Load a league file to create banner slots.</p>';
    bannersWrap.appendChild(empty);
    return;
  }

  bannersWrap.className = 'banners-wrap banner-grid';

  for (const year of timeline.years) {
    const yearKey = String(year);
    const savedUrl = typeof savedBannersByYear[yearKey] === 'string' ? savedBannersByYear[yearKey].trim() : '';
    const card = document.createElement('article');
    card.className = 'banner-card';

    const label = document.createElement('h3');
    label.className = 'banner-year';
    label.textContent = yearKey;

    const frame = document.createElement('div');
    frame.className = 'banner-square';

    const input = document.createElement('input');
    input.className = 'banner-url-input';
    input.type = 'url';
    input.placeholder = 'https://example.com/banner.png';
    input.value = savedUrl;

    const applyUrl = (url) => {
      frame.textContent = '';
      if (!url) {
        frame.classList.add('is-empty');
        return;
      }
      frame.classList.remove('is-empty');
      const image = document.createElement('img');
      image.src = url;
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.alt = `DBL banner, ${yearKey}`;
      frame.appendChild(image);
    };

    input.addEventListener('input', () => {
      const value = input.value.trim();
      if (value) {
        savedBannersByYear[yearKey] = value;
      } else {
        delete savedBannersByYear[yearKey];
      }
      saveBanners();
      applyUrl(value);
    });

    applyUrl(savedUrl);
    card.append(label, frame, input);
    bannersWrap.appendChild(card);
  }
}

function renderUniforms(timeline) {
  uniformsWrap.innerHTML = '';
  if (!timeline || !Array.isArray(timeline.years) || timeline.years.length === 0) {
    uniformsWrap.className = 'banners-wrap empty-state';
    uniformYearSelect.innerHTML = '';
    selectedUniformYear = null;
    const empty = document.createElement('div');
    empty.className = 'empty-copy';
    empty.innerHTML = '<p>Load a league file to create uniform slots.</p>';
    uniformsWrap.appendChild(empty);
    return;
  }

  uniformYearSelect.innerHTML = '';
  for (const year of timeline.years) {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    uniformYearSelect.appendChild(option);
  }

  if (!selectedUniformYear || !timeline.years.includes(selectedUniformYear)) {
    selectedUniformYear = timeline.maxYear;
  }
  uniformYearSelect.value = String(selectedUniformYear);

  const activeRows = timeline.rows.filter((row) => row.entriesByYear.has(selectedUniformYear));
  uniformsWrap.className = 'banners-wrap banner-grid';

  for (const row of activeRows) {
    const yearKey = String(selectedUniformYear);
    const teamKey = String(row.tid ?? row.latestLocation);
    const storageKey = `${yearKey}:${teamKey}`;
    const savedUrl = typeof savedUniformsByYear[storageKey] === 'string' ? savedUniformsByYear[storageKey].trim() : '';

    const card = document.createElement('article');
    card.className = 'banner-card';
    const label = document.createElement('h3');
    label.className = 'banner-year';
    label.textContent = row.latestLocation;
    const frame = document.createElement('div');
    frame.className = 'banner-square';
    const input = document.createElement('input');
    input.className = 'banner-url-input';
    input.type = 'url';
    input.placeholder = 'https://example.com/uniform.png';
    input.value = savedUrl;

    const applyUrl = (url) => {
      frame.textContent = '';
      if (!url) {
        frame.classList.add('is-empty');
        return;
      }
      frame.classList.remove('is-empty');
      const image = document.createElement('img');
      image.src = url;
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.alt = `${row.latestLocation} uniform, ${yearKey}`;
      frame.appendChild(image);
    };

    input.addEventListener('input', () => {
      const value = input.value.trim();
      if (value) {
        savedUniformsByYear[storageKey] = value;
      } else {
        delete savedUniformsByYear[storageKey];
      }
      saveUniforms();
      applyUrl(value);
    });

    applyUrl(savedUrl);
    card.append(label, frame, input);
    uniformsWrap.appendChild(card);
  }
}


function renderRankings(timeline) {
  rankingsWrap.innerHTML = '';
  const rankings = Array.isArray(timeline?.rankings) ? timeline.rankings : [];
  if (!rankings.length) {
    rankingsWrap.className = 'rankings-wrap empty-state';
    const empty = document.createElement('div');
    empty.className = 'empty-copy';
    empty.innerHTML = '<p>Load a league file to rank every team season.</p>';
    rankingsWrap.appendChild(empty);
    return;
  }

  rankingsWrap.className = 'rankings-wrap';
  const list = document.createElement('ol');
  list.className = 'rankings-list';

  rankings.forEach((ranking) => {
    const item = document.createElement('li');
    item.className = 'ranking-item';

    const logo = document.createElement('div');
    logo.className = 'ranking-logo';
    if (ranking.logoURL) {
      const image = document.createElement('img');
      image.src = ranking.logoURL;
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.alt = `${ranking.label} logo`;
      logo.appendChild(image);
    }

    const details = document.createElement('div');
    details.className = 'ranking-details';
    const name = document.createElement('strong');
    name.textContent = ranking.label;
    details.appendChild(name);

    const score = document.createElement('span');
    score.className = 'ranking-score';
    score.textContent = ranking.finalScore.toFixed(2);

    const row = document.createElement('div');
    row.className = 'ranking-row';
    row.append(logo, details, score);
    item.appendChild(row);
    list.appendChild(item);
  });

  rankingsWrap.appendChild(list);
}

function getVisibleTimeline(timeline) {
  const baseRows = activeTeamsOnlyToggle?.checked
    ? timeline.rows.filter((row) => row.lastSeason === timeline.maxYear)
    : timeline.rows;

  const rows = sortRows(baseRows, teamSortMode);

  return {
    years: timeline.years,
    rows,
    minYear: timeline.minYear,
    maxYear: timeline.maxYear,
  };
}

function sortRows(rows, mode) {
  const sorted = [...rows];

  if (mode === 'tid') {
    sorted.sort((a, b) => (a.tid ?? Number.MAX_SAFE_INTEGER) - (b.tid ?? Number.MAX_SAFE_INTEGER));
    return sorted;
  }

  sorted.sort((a, b) => {
    if (a.latestLocation !== b.latestLocation) {
      return a.latestLocation.localeCompare(b.latestLocation);
    }
    return (a.tid ?? Number.MAX_SAFE_INTEGER) - (b.tid ?? Number.MAX_SAFE_INTEGER);
  });
  return sorted;
}

function setActiveTeamsOnlyEnabled(enabled) {
  activeTeamsOnlyToggle.checked = enabled;
  if (activeTeamsOnlyToggleFullscreen) {
    activeTeamsOnlyToggleFullscreen.checked = enabled;
  }
  if (!fullTimeline || isLeagueFileCleared) return;
  setTimeline(fullTimeline);
}

function setUseSmallLogosEnabled(enabled) {
  useSmallLogos = enabled;
  if (smallLogosToggle) {
    smallLogosToggle.checked = enabled;
  }
  if (smallLogosToggleFullscreen) {
    smallLogosToggleFullscreen.checked = enabled;
  }
  if (!fullTimeline || isLeagueFileCleared) return;
  setTimeline(fullTimeline);
}

function renderTimelineInto(timeline, targetWrap) {
  const { years, rows } = timeline;
  if (!rows.length) {
    targetWrap.className = 'timeline-wrap empty-state';
    targetWrap.innerHTML = '<div class="empty-copy"><p>No active teams found in this league file.</p></div>';
    return;
  }

  targetWrap.className = 'timeline-wrap';

  const table = document.createElement('table');
  table.className = 'timeline-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');

  const corner = document.createElement('th');
  corner.className = 'corner-header';
  corner.textContent = 'Franchise';
  headRow.appendChild(corner);

  for (const year of years) {
    const th = document.createElement('th');
    th.className = 'year-header';
    th.textContent = year;
    headRow.appendChild(th);
  }

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  for (const row of rows) {
    const tr = document.createElement('tr');

    const rowHeader = document.createElement('th');
    rowHeader.className = 'row-header';
    rowHeader.scope = 'row';
    const tidLabel = row.tid === null || row.tid === undefined ? '' : `
          <span class="row-tid">TID ${escapeHtml(row.tid)}</span>`;
    rowHeader.innerHTML = `
      <div class="row-label">
        <div class="row-title">
          <strong>${escapeHtml(row.latestLocation)}</strong>${tidLabel}
        </div>
        <span class="row-years">${row.firstSeason}–${row.lastSeason}</span>
      </div>
    `;
    tr.appendChild(rowHeader);

    let carryForwardPrimaryLogo = '';
    let carryForwardSmallLogo = '';
    let carryForwardFallbackLogo = '';

    for (const year of years) {
      const td = document.createElement('td');
      const seasonEntry = row.entriesByYear.get(year);
      const isActiveYear = row.entriesByYear.has(year);

      if (seasonEntry?.primaryLogoURL) {
        carryForwardPrimaryLogo = seasonEntry.primaryLogoURL;
      }
      if (seasonEntry?.smallLogoURL) {
        carryForwardSmallLogo = seasonEntry.smallLogoURL;
      }
      if (seasonEntry?.fallbackLogoURL) {
        carryForwardFallbackLogo = seasonEntry.fallbackLogoURL;
      }

      const withinFranchiseSpan = year >= row.firstSeason && year <= row.lastSeason;

      if (!withinFranchiseSpan || !isActiveYear) {
        td.className = 'empty-cell';
        td.innerHTML = '<div class="empty-card" aria-hidden="true"></div>';
      } else {
        const logoToShow = useSmallLogos
          ? seasonEntry?.smallLogoURL || carryForwardSmallLogo || seasonEntry?.fallbackLogoURL || carryForwardFallbackLogo
          : seasonEntry?.primaryLogoURL || carryForwardPrimaryLogo || seasonEntry?.fallbackLogoURL || carryForwardFallbackLogo;
        if (logoToShow) {
          td.className = 'logo-cell';
          td.innerHTML = `
            <div class="logo-card">
              <img src="${escapeAttribute(logoToShow)}" alt="${escapeAttribute(row.latestLocation)} logo, ${year}" loading="lazy" referrerpolicy="no-referrer" />
            </div>
          `;
        } else {
          td.className = 'empty-cell';
          td.innerHTML = '<div class="empty-card" aria-hidden="true"></div>';
        }
      }

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  targetWrap.innerHTML = '';
  targetWrap.appendChild(table);
}

function closeFullscreenTimeline() {
  timelineFullscreen.hidden = true;
  document.body.classList.remove('fullscreen-open');
}

function updateStats(timeline) {
  const totalCells = timeline.rows.length * timeline.years.length;
  teamCountEl.textContent = timeline.rows.length.toLocaleString();
  yearRangeEl.textContent = `${timeline.minYear}–${timeline.maxYear}`;
  cellCountEl.textContent = totalCells.toLocaleString();
}

function range(start, end) {
  const years = [];
  for (let year = start; year <= end; year += 1) {
    years.push(year);
  }
  return years;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
