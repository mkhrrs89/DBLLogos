(() => {
  'use strict';
  if (window.DBLCardEngine) return;
  const hub = window.DBLLeagueFileHub;
  const reader = window.DBLLeagueStream;
  const market = window.DBLCardMarket;
  if (!hub?.subscribe || !reader?.forEachTopLevelArrayItem || !reader?.readTopLevelValue) return;

  // Three Mythical designs share a combined 0.1% chance PER CARD SLOT.
  // Keep standard-tier pull weights independent, with no guaranteed rarity.
  const MYTHICAL_RATE = .001;
  // One independent 0.1% autograph roll per eligible PLAYER card slot.
  // The player-card rarity and insert odds remain unchanged.
  const AUTOGRAPH_RATE = .001;
  // Gentle, never-guaranteed pity: ordinary odds until long miss streaks,
  // then at most a 25% *relative* boost (not +25 percentage points).
  // Auto 0.100% -> max 0.125%; Black 0.250% -> max 0.3125%;
  // Mythical 0.100% -> max 0.125%.
  const PITY_RULES = Object.freeze({
    autograph: {base: AUTOGRAPH_RATE, start: 500, ramp: 1000},
    blackLabel: {base: .0025, start: 250, ramp: 500},
    mythical: {base: MYTHICAL_RATE, start: 500, ramp: 1000}
  });
  const PITY_MAX_STREAK = 1000000;
  const PITY_NAMES = Object.keys(PITY_RULES);
  const emptyPity = () => ({autograph:0,blackLabel:0,mythical:0});
  function validatedPity(raw, strict = false) {
    const result = emptyPity();
    if (raw == null && !strict) return result;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      if (strict) throw Error('The backup contains invalid pity counters.');
      return result;
    }
    for (const name of PITY_NAMES) {
      const value = raw[name];
      if (!Number.isSafeInteger(value) || value < 0 || value > PITY_MAX_STREAK) {
        if (strict) throw Error('The backup contains an invalid ' + name + ' pity counter.');
        return emptyPity();
      }
      result[name] = value;
    }
    return result;
  }
  function pityChance(name, missed) {
    const rule = PITY_RULES[name];
    const boost = .25 * Math.min(1,
      Math.max(0, missed - rule.start) / rule.ramp);
    return rule.base * (1 + boost);
  }
  const missPity = missed => Math.min(PITY_MAX_STREAK, missed + 1);
  // One independent Team Season insert roll per eligible pack slot.
  // Its roll never changes the standard player-card rarity weights.
  const TEAM_INSERT_RATE = .03;
  // A separate, plain-paper 1968 Topps test issue. Odds apply per eligible
  // slot; all five slots now follow the published odds without guarantees.
  const TOPPS_YEAR = 1968, TOPPS_SERIES = 1, TOPPS_INSERT_RATE = .15;
  const TOPPS_UNIFORM_SHARE = .20;
  const BACKGROUND_TEST_SERIES = 2;
  const TEAM_INSERT = Object.freeze({
    id: 'team-season', label: 'Team Season', insert: true
  });
  const TOPPS_PLAYER = Object.freeze({id: 'topps-1968', label: '1968 Topps', insert: true});
  const TOPPS_UNIFORM = Object.freeze({id: 'topps-1968-uniform', label: 'Topps Uniform', insert: true});
  const BACKGROUND_TEST = Object.freeze({id: 'background-test', label: 'Background Test', insert: true});
  const RARITIES = [
    { id: 'common', label: 'Base', chance: 87.75, pool: 1 },
    { id: 'crome', label: 'Chrome', chance: 10, pool: .72 },
    { id: 'refractor', label: 'Refractor', chance: 2, pool: .42 },
    { id: 'black-label', label: 'Black Label', chance: .25, pool: .075 },
    { id: 'mythic-aether', label: 'Mythical · Aether', shortLabel: 'AETHER',
      chance: 0.1 / 3, pool: .15, mythical: true },
    { id: 'mythic-eclipse', label: 'Mythical · Eclipse', shortLabel: 'ECLIPSE',
      chance: 0.1 / 3, pool: .15, mythical: true },
    { id: 'mythic-aurora', label: 'Mythical · Aurora', shortLabel: 'AURORA',
      chance: 0.1 / 3, pool: .15, mythical: true }
  ];
  const STANDARD_RARITIES = RARITIES.filter(t => !t.mythical);
  const MYTHICAL_RARITIES = RARITIES.filter(t => t.mythical);
  // Migrate every previously collected card rather than discarding old tiers.
  // Rare + Epic become Refractor; Legendary becomes Black Label.
  // A player's peak OVR must meet the floor for the actual rarity drawn.
  // Keep the "common" ID for saved Base cards, preserving collections.
  // Existing owned cards are never removed or downgraded by this rule.
  const MIN_OVR_BY_RARITY = Object.freeze({
    common: 35,       // Base
    crome: 45,
    refractor: 55,
    'black-label': 60,
    'mythic-aether': 70,
    'mythic-eclipse': 70,
    'mythic-aurora': 70
  });
  const OLD_RARITY = Object.freeze({
    common: 'common', uncommon: 'crome', rare: 'refractor',
    epic: 'refractor', legendary: 'black-label'
  });
  const DATABASE = 'dbl-digital-cards-v1';
  const STORE = 'collections';
  // All original FLAGSHIP cards belong to the first collectible set.
  // Keep existing pid:rarity IDs so old collections and duplicates stay intact.
  const CARD_SERIES = 0;
  const KEY = 'archive';
  const FALLBACK = 'dbl-digital-cards-fallback-v1';
  const DEVICE_KEY = 'dbl-digital-cards-source-id-v1';
  const BACKUP_FORMAT = 'dbl-collection-backup';
  const BACKUP_VERSION = 1;
  const STATE_VERSION = 8; // v7 cards upgrade in place, preserving every copy.
  const SOURCE_ID_RE = /^[a-f0-9]{32}$/;
  function deviceSourceId() {
    try {
      const previous = window.localStorage.getItem(DEVICE_KEY);
      if (SOURCE_ID_RE.test(previous || '')) return previous;
    } catch (_) { /* IndexedDB may still be available. */ }
    const bytes = new Uint8Array(16);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    const id = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    try { window.localStorage.setItem(DEVICE_KEY, id); } catch (_) {}
    return id;
  }
  const thisSourceId = deviceSourceId();
  function sourceCounts(raw, fallbackCount = 0, strict = false) {
    const result = Object.create(null);
    let total = 0;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [id, qty] of Object.entries(raw)) {
        if (!SOURCE_ID_RE.test(id) || !Number.isInteger(qty) || qty < 1 || qty > 1000000) {
          if (strict) throw Error('Backup has an invalid source counter.');
          continue;
        }
        total += qty;
        if (total > 100000000) {
          if (strict) throw Error('Backup source counts exceed the allowed limit.');
          break;
        }
        result[id] = qty;
      }
    } else if (strict) throw Error('Backup is missing its source counters.');
    if (strict && total !== fallbackCount)
      throw Error('Backup counters do not match its stored totals.');
    if (!strict && total !== fallbackCount) {
      return fallbackCount > 0 ? {[thisSourceId]: fallbackCount} : {};
    }
    return result;
  }
  const sumSourceCounts = counts => Object.values(counts).reduce((sum, n) => sum + n, 0);
  function unionSourceCounts(a, b) {
    const merged = {...a};
    for (const [id, count] of Object.entries(b))
      merged[id] = Math.max(merged[id] || 0, count);
    return merged;
  }
  const tierIndex = Object.fromEntries(RARITIES.map((r, i) => [r.id, i]));
  const tierMap = Object.fromEntries([...RARITIES, TEAM_INSERT, TOPPS_PLAYER, TOPPS_UNIFORM, BACKGROUND_TEST].map(r => [r.id, r]));
  const number = x => x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null;
  const integer = x => Number.isInteger(number(x)) ? number(x) : null;
  const str = x => typeof x === 'string' ? x.trim() : '';
  // Autographs are a separate edition sharing a player's normal rarity,
  // with a canonical :auto suffix. Team cards, uniforms, Black Label and
  // Mythicals may never be autographed.
  const canAutograph = card =>
    card && Number.isSafeInteger(integer(card.pid)) && integer(card.pid) >= 0 &&
    card.type !== 'team-season' && card.type !== 'topps-uniform' &&
    card.rarity !== 'black-label' && !String(card.rarity || '').startsWith('mythic-') &&
    (card.type === 'topps-player' || card.type === 'background-test' ||
      (!card.type && card.series === CARD_SERIES));
  const isAutograph = row => row?.autograph === true && canAutograph(row);
  const autoId = (baseId, row) => baseId + (isAutograph(row) ? ':auto' : '');
  const baseCardId = card => card?.autograph === true ?
    String(card.id || '').replace(/:auto$/, '') : card?.id;
  function autographPull(card, streaks) {
    if (!canAutograph(card)) return card;
    const signed = Math.random() < pityChance('autograph', streaks.autograph);
    streaks.autograph = signed ? 0 : missPity(streaks.autograph);
    return signed ? {...card, autograph:true, id:card.id + ':auto'} : card;
  }
  const nameOf = p => [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim() || str(p?.name) || 'Unknown player';
  const listeners = new Set();
  let currentFile = null, fileVersion = 0, scanning = false, poolFile = null;
  let pool = [], poolByPid = new Map(), teamLogos = new Map(), activeSeason = null;
  // Lookup names from every player in the current league export, including
  // players outside collectible OVR ranges. Derived only; never persisted.
  let playerNamesByPid = new Map();
  let teamSeasonPool = [], teamSeasonById = new Map();
  let toppsPlayerPool = [], toppsUniformPool = [], toppsById = new Map();
  let backgroundTestPool = [], backgroundTestByPid = new Map();
  // Derived from the uploaded file, never stored in the collection.
  let marketProfiles = new Map();
  let collection = new Map(), packs = 0, collectionLoaded = false;
  let packSources = {}, mergingCollection = false, deletingCards = false;
  // Pity advances only when a generated pack is actually collected, never
  // just because the user previewed/drew an uncollected pack.
  let pity = emptyPity();
  const pendingPity = new WeakMap();
  let savedOK = true, saveQueue = Promise.resolve();
  let problem = '';

  // Optional change information lets small preference updates skip expensive
  // gallery redraws. Existing collection listeners still work unchanged.
  const notify = (change = null) => {
    for (const callback of [...listeners]) {
      try { callback(change); } catch (error) { console.warn('DBL cards listener error', error); }
    }
  };
  function photoUrl(value, persist = false) {
    if (typeof value !== 'string') return '';
    if (/^https?:\/\/\S+$/i.test(value) && value.length < 1800) return value;
    // Do not persist embedded base64 photos: source league files already hold
    // them, and duplicating them could fill the browser's storage quota.
    if (!persist && value.length < 450000 &&
        /^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i.test(value)) return value;
    return '';
  }
  // Collection 1 cards have their own stable IDs and 1968-only metadata.
  // This normalization is shared by local restore and cross-device imports.
  function normalizedTopps(row, count, sourceLedger) {
    if (!row || (row.type !== 'topps-player' && row.type !== 'topps-uniform') ||
        integer(row.era) !== TOPPS_YEAR || !Number.isInteger(count) ||
        count < 1 || count > 1000000) return null;
    const team = str(row.team) || 'DBL';
    const teamName = str(row.teamName) || 'Unknown team';
    const tid = integer(row.tid);
    if (row.type === 'topps-player') {
      const pid = integer(row.pid);
      if (row.rarity !== TOPPS_PLAYER.id || pid === null || pid < 0) return null;
      return {
        id: autoId('topps:1968:player:' + pid, row),
        type: 'topps-player', rarity: TOPPS_PLAYER.id, series: TOPPS_SERIES,
        autograph: isAutograph(row),
        count, sourceCounts: sourceLedger, favorite: row.favorite === true, pid, era: TOPPS_YEAR, tid,
        name: str(row.name) || 'Unknown player',
        firstName: str(row.firstName), lastName: str(row.lastName),
        jersey: /^\d{1,3}$/.test(String(row.jersey || '')) ? String(row.jersey) : '',
        team, teamName, franchiseName: str(row.franchiseName) || teamName,
        teamLogo: photoUrl(row.teamLogo, true),
        pos: str(row.pos) || '—', rookie: row.rookie === true,
        draftPick: integer(row.draftPick),
        ovr: number(row.ovr), gp: number(row.gp), ppg: number(row.ppg),
        rpg: number(row.rpg), apg: number(row.apg), photo: photoUrl(row.photo, true)
      };
    }
    const uniform = str(row.uniform).toLowerCase();
    if (row.rarity !== TOPPS_UNIFORM.id || tid === null || tid < 0 ||
        (uniform !== 'home' && uniform !== 'away')) return null;
    return {
      id: 'topps:1968:uniform:' + tid + ':' + uniform,
      type: 'topps-uniform', rarity: TOPPS_UNIFORM.id, series: TOPPS_SERIES,
      count, sourceCounts: sourceLedger, favorite: row.favorite === true, tid, era: TOPPS_YEAR,
      uniform, name: teamName + ' · ' + uniform.toUpperCase(),
      team, teamName, franchiseName: str(row.franchiseName) || teamName,
      teamLogo: photoUrl(row.teamLogo, true), uniformImage: photoUrl(row.uniformImage, true)
    };
  }
  // Stable one-card-per-player IDs; a later season does not erase copies.
  // The cutout is deliberately NOT saved: only original public photo URLs.
  function normalizeBackgroundTest(row, count, origins) {
    const pid = integer(row?.pid), era = integer(row?.era);
    if (row?.type !== 'background-test' ||
        row?.rarity !== BACKGROUND_TEST.id ||
        pid === null || pid < 0 || era === null ||
        !Number.isInteger(count) || count < 1 || count > 1000000) return null;
    return {
      id: autoId('bgtest:player:' + pid, row), type: 'background-test',
      rarity: BACKGROUND_TEST.id, series: BACKGROUND_TEST_SERIES,
      autograph: isAutograph(row),
      count, sourceCounts: origins, favorite: row.favorite === true,
      pid, era, tid: integer(row.tid),
      name: str(row.name) || 'Unknown player',
      team: str(row.team) || 'DBL',
      teamName: str(row.teamName) || 'Current team unavailable',
      currentOvr: number(row.currentOvr),
      photo: photoUrl(row.photo, true)
    };
  }
  function updateBackgroundTest(target, fresh) {
    let changed = false;
    for (const key of ['era','tid','name','team','teamName','currentOvr']) {
      if (fresh[key] !== undefined && fresh[key] !== null &&
          target[key] !== fresh[key]) {
        target[key] = fresh[key];
        changed = true;
      }
    }
    if (!target.photo && fresh.photo) {target.photo = fresh.photo;changed = true;}
    return changed;
  }
  function currentPlayerOvr(player, year) {
    let latestYear = -Infinity, rating = null;
    for (const row of Array.isArray(player?.ratings) ? player.ratings : []) {
      const ratedYear = integer(row?.season), ovr = number(row?.ovr);
      if (ratedYear === null || ratedYear > year || ovr === null) continue;
      if (ratedYear >= latestYear) {latestYear = ratedYear; rating = ovr;}
    }
    return rating;
  }
  function backgroundPlayerCard(player, year, teams) {
    const pid = integer(player?.pid), tid = integer(player?.tid);
    if (pid === null || pid < 0 || tid === null || tid < -1) return null;
    const currentOvr = currentPlayerOvr(player, year);
    if (currentOvr === null || currentOvr < 50) return null;
    const team = tid >= 0 ? teamAt(teams, tid, year) : null;
    return {
      id:'bgtest:player:' + pid, type:'background-test',
      rarity:BACKGROUND_TEST.id, series:BACKGROUND_TEST_SERIES, count:1,
      pid, tid, era:year, currentOvr,
      name:nameOf(player), team:team?.abbrev || 'FA',
      teamName:team?.name || 'Free Agent',
      // Runtime can use an embedded image from the league export.
      // Only a small public URL can ever be written into card storage.
      image:photoUrl(player.imgURL) || photoUrl(player.imgURLSmall),
      imageFallback:photoUrl(player.imgURLSmall),
      photo:photoUrl(player.imgURL, true) || photoUrl(player.imgURLSmall, true)
    };
  }
  function updateTopps(target, fresh) {
    let changed = false;
    for (const key of ['name','firstName','lastName','jersey','team','teamName',
      'franchiseName','teamLogo','tid','pos','rookie','draftPick','ovr','gp','ppg','rpg','apg',
      'photo','uniformImage']) {
      if (fresh[key] !== undefined && fresh[key] !== null && fresh[key] !== '' &&
          fresh[key] !== target[key]) {
        target[key] = fresh[key];
        changed = true;
      }
    }
    return changed;
  }
  function topperPlayer(player, fileYear, teams) {
    if (fileYear < TOPPS_YEAR || integer(player?.pid) === null ||
        integer(player.pid) < 0) return null;
    const rows = (Array.isArray(player.stats) ? player.stats : [])
      .filter(x => !x?.playoffs && integer(x?.season) === TOPPS_YEAR &&
        (integer(x?.tid) ?? -1) >= 0 && (number(x?.gp) ?? 0) > 0);
    // The current 1968 roster also includes preseason/new players with no GP.
    const live1968 = fileYear === TOPPS_YEAR && (integer(player.tid) ?? -1) >= 0;
    if (!rows.length && !live1968) return null;
    let tid = null, mostGames = -1;
    for (const row of rows) {
      const games = number(row.gp) ?? 0;
      if (games > mostGames) {mostGames = games; tid = integer(row.tid);}
    }
    if (tid === null && live1968) tid = integer(player.tid);
    if (tid === null || !teams.has(tid)) return null;
    const stats = rows.filter(row => integer(row.tid) === tid);
    const gp = stats.reduce((sum, row) => sum + (number(row.gp) ?? 0), 0);
    const pts = stats.reduce((sum, row) => sum + (number(row.pts) ?? 0), 0);
    const trb = stats.reduce((sum, row) => sum + (number(row.trb) ?? 0), 0);
    const ast = stats.reduce((sum, row) => sum + (number(row.ast) ?? 0), 0);
    const hasPreviousGames = (Array.isArray(player.stats) ? player.stats : [])
      .some(row => !row?.playoffs && (integer(row?.season) ?? Infinity) < TOPPS_YEAR &&
        (number(row.gp) ?? 0) > 0);
    const pastRatings = ratingData(player, TOPPS_YEAR);
    const current = pastRatings.selected;
    const historic = teamAt(teams, tid, TOPPS_YEAR);
    const franchise = teamAt(teams, tid, fileYear);
    const jersey = jerseyOf(player, TOPPS_YEAR, tid, fileYear);
    return {
      id: 'topps:1968:player:' + integer(player.pid),
      type: 'topps-player', rarity: TOPPS_PLAYER.id, series: TOPPS_SERIES,
      count: 1, pid: integer(player.pid), era: TOPPS_YEAR, tid,
      name: nameOf(player), firstName: str(player.firstName),
      lastName: str(player.lastName), jersey,
      team: historic?.abbrev || 'DBL',
      teamName: historic?.name || 'Unknown team',
      franchiseName: franchise?.name || historic?.name || 'Unknown team',
      teamLogo: photoUrl(historic?.logo, true), logo: historic?.logo || '',
      pos: str(current.pos) || str(player.pos) || '—',
      rookie: !hasPreviousGames, draftPick: integer(player.draft?.pick),
      ovr: number(current.ovr), gp,
      ppg: gp ? Math.round(pts / gp * 10) / 10 : 0,
      rpg: gp ? Math.round(trb / gp * 10) / 10 : 0,
      apg: gp ? Math.round(ast / gp * 10) / 10 : 0,
      photo: photoUrl(player.imgURL, true), image: photoUrl(player.imgURL)
    };
  }
  function ratingData(player, season) {
    let selected = null, mostRecent = -Infinity;
    let peak = null, peakRow = null, peakSeason = null;
    for (const row of Array.isArray(player?.ratings) ? player.ratings : []) {
      const year = integer(row?.season);
      if (year === null || year > season) continue;
      const value = number(row?.ovr);
      if (year >= mostRecent) { selected = row; mostRecent = year; }
      // Earlier season wins a cross-year tie; last row within that
      // season wins a same-year tie (e.g. multiple rating snapshots).
      if (value !== null && (peak === null || value > peak ||
          (value === peak && (year < peakSeason || year === peakSeason)))) {
        peak = value;
        peakRow = row;
        peakSeason = year;
      }
    }
    return {selected: selected || {}, peak, peakRow: peakRow || {},
      peakSeason, recentSeason: mostRecent === -Infinity ? null : mostRecent};
  }
  function teamAt(teams, tid, year) {
    const team = teams.get(tid);
    if (!team) return null;
    const history = team.history || [];
    const eligible = history.filter(row => (integer(row.season) ?? Infinity) <= year);
    const row = eligible.length ? eligible[eligible.length - 1] : null;
    let historicalLogo = '';
    for (const entry of eligible) {
      const found = photoUrl(entry.imgURL) || photoUrl(entry.imgURLSmall);
      if (found) historicalLogo = found;
    }
    return {
      abbrev: str(row?.abbrev) || team.abbrev,
      name: [str(row?.region) || team.region, str(row?.name) || team.name]
        .filter(Boolean).join(' ') || team.name || 'League archive',
      logo: historicalLogo || team.baseLogo || ''
    };
  }
  function teamForPeak(player, peakYear, fileYear) {
    if (peakYear === null) return null;
    const gp = new Map();
    for (const row of Array.isArray(player?.stats) ? player.stats : []) {
      if (integer(row?.season) !== peakYear || row?.playoffs) continue;
      const tid = integer(row.tid);
      if (tid === null || tid < 0) continue;
      gp.set(tid, (gp.get(tid) || 0) + Math.max(0, number(row.gp) ?? 0));
    }
    if (gp.size) {
      return [...gp.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    }
    // No season stats (preseason or an incomplete archive): use the
    // franchise recorded in player transactions through that season.
    let latest = null;
    for (const tx of Array.isArray(player?.transactions) ? player.transactions : []) {
      const year = integer(tx?.season), tid = integer(tx?.tid);
      if (year === null || year > peakYear || tid === null || tid < 0) continue;
      if (!latest || year > latest.year || (year === latest.year &&
          (number(tx.phase) ?? 0) >= latest.phase)) {
        latest = {year, phase: number(tx.phase) ?? 0, tid};
      }
    }
    if (latest) return latest.tid;
    const draftYear = integer(player?.draft?.year), draftedTid = integer(player?.draft?.tid);
    if (draftedTid !== null && draftedTid >= 0 &&
        draftYear !== null && peakYear >= draftYear &&
        peakYear <= draftYear + 1) return draftedTid;
    // Only use the current roster for the current season: an old peak
    // cannot be assigned to the player's present-day franchise.
    if (peakYear === fileYear && (integer(player?.tid) ?? -1) >= 0)
      return integer(player.tid);
    return null;
  }
  function careerData(player) {
    const years = new Map();
    for (const stat of Array.isArray(player?.stats) ? player.stats : []) {
      const year = integer(stat?.season);
      if (year === null || stat.playoffs || (number(stat.gp) ?? 0) <= 0) continue;
      if (!years.has(year)) years.set(year, []);
      years.get(year).push(stat);
    }
    let gp = 0, pts = 0, ws = 0, lastTid = null, lastYear = -Infinity;
    for (const [year, rows] of years) {
      const realTeams = rows.filter(row => (integer(row.tid) ?? -1) >= 0);
      for (const row of realTeams.length ? realTeams : rows) {
        gp += number(row.gp) ?? 0;
        pts += number(row.pts) ?? 0;
        ws += number(row.ws) ?? ((number(row.ows) ?? 0) + (number(row.dws) ?? 0));
        const tid = integer(row.tid);
        if (tid !== null && tid >= 0 && year >= lastYear) {
          lastYear = year; lastTid = tid;
        }
      }
    }
    return {gp: Math.round(gp), ppg: gp ? Math.round(pts / gp * 10) / 10 : null,
      ws: Math.round(ws * 10) / 10, lastTid};
  }
  function jerseyOf(player, peakYear, tid, fileYear) {
    const valid = value => {
      const v = value === undefined || value === null ? '' : String(value).trim();
      return /^\d{1,3}$/.test(v) ? v : '';
    };
    if (peakYear === null) return '';
    let jersey = '', maxGames = -1;
    for (const row of Array.isArray(player?.stats) ? player.stats : []) {
      if (integer(row?.season) !== peakYear || row.playoffs) continue;
      if (tid !== null && integer(row.tid) !== tid) continue;
      const candidate = valid(row.jerseyNumber);
      if (!candidate) continue;
      const games = number(row.gp) ?? 0;
      if (games >= maxGames) { jersey = candidate; maxGames = games; }
    }
    // Never apply a present-day jersey number to an unrelated past season.
    if (!jersey && peakYear === fileYear && integer(player?.tid) === tid)
      jersey = valid(player?.jerseyNumber);
    return jersey;
  }
  function playerInfo(player, season, teams) {
    const pid = integer(player?.pid);
    if (pid === null || pid < 0 || integer(player.tid) === -2) return null;
    const ratings = ratingData(player, season);
    if (ratings.peak === null ||
        ratings.peak < MIN_OVR_BY_RARITY.common) return null;
    const career = careerData(player);
    const peakYear = ratings.peakSeason;
    const peakTid = teamForPeak(player, peakYear, season);
    const historicTeam = peakTid === null ? null : teamAt(teams, peakTid, peakYear);
    const franchiseTeam = peakTid === null ? null : teamAt(teams, peakTid, season);
    const draftYear = integer(player?.draft?.year);
    const hadPriorGames = (Array.isArray(player.stats) ? player.stats : [])
      .some(row => !row?.playoffs && (integer(row?.season) ?? Infinity) < peakYear &&
        (number(row?.gp) ?? 0) > 0);
    const rookie = peakYear !== null && draftYear !== null &&
      draftYear >= peakYear - 1 && draftYear <= peakYear && !hadPriorGames;
    const rating = peakYear === null ? ratings.selected : ratings.peakRow;
    const ovr = ratings.peak;
    const pot = number(rating.pot);
    const latestPot = number(ratings.selected.pot);
    return {
      pid, name: nameOf(player),
      firstName: str(player.firstName), lastName: str(player.lastName),
      jersey: jerseyOf(player, peakYear, peakTid, season),
      team: historicTeam?.abbrev || 'DBL',
      teamName: historicTeam?.name || 'Team unavailable',
      // Franchise ID is stable across team name/city changes; only the
      // Checklist uses these read-only fields for completion grouping.
      franchiseTid: peakTid,
      franchiseName: franchiseTeam?.name || historicTeam?.name || 'Team unavailable',
      teamLogo: historicTeam?.logo || '',
      publicTeamLogo: photoUrl(historicTeam?.logo, true),
      pos: str(rating.pos) || str(player.pos) || '—',
      era: peakYear, peakVerified: peakYear !== null, rookie, ovr, pot,
      draftPick: integer(player.draft?.pick),
      peak: ratings.peak,
      gp: career.gp, ppg: career.ppg, ws: career.ws,
      image: photoUrl(player?.imgURL),
      publicImage: photoUrl(player?.imgURL, true),
      score: (ratings.peak ?? 0) * .86 + (latestPot ?? ratings.peak ?? 0) * .14
    };
  }
  function openDb() {
    if (!window.indexedDB) return Promise.resolve(null);
    return new Promise(resolve => {
      try {
        const request = window.indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }
  const dbReady = openDb();
  function localRead() {
    try { return JSON.parse(window.localStorage.getItem(FALLBACK) || 'null'); }
    catch (_) { return null; }
  }
  function localWrite(state) {
    try { window.localStorage.setItem(FALLBACK, JSON.stringify(state)); return true; }
    catch (_) { return false; }
  }
  async function readState() {
    const db = await dbReady;
    if (!db) return localRead();
    try {
      const result = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).get(KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      return result || localRead();
    } catch (_) { return localRead(); }
  }
  async function writeState(state) {
    const db = await dbReady;
    if (!db) return localWrite(state);
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(state, KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Could not save cards'));
        tx.onabort = () => reject(tx.error || new Error('Card save aborted'));
      });
      return true;
    } catch (error) {
      console.warn('Card storage failed; trying local fallback.', error);
      return localWrite(state);
    }
  }
  function parseState(value) {
    collection = new Map();
    for (const row of Array.isArray(value?.items) ? value.items : []) {
      const qty = integer(row?.count);
      if (row?.type === 'background-test') {
        const item = normalizeBackgroundTest(row, qty, sourceCounts(row.sourceCounts, qty));
        if (!item) continue;
        const old = collection.get(item.id);
        if (old) {
          old.sourceCounts = unionSourceCounts(old.sourceCounts, item.sourceCounts);
          old.count = sumSourceCounts(old.sourceCounts);
          old.favorite ||= item.favorite;
          updateBackgroundTest(old, item);
        } else collection.set(item.id, item);
        continue;
      }
      if (row?.type === 'topps-player' || row?.type === 'topps-uniform') {
        const item = normalizedTopps(row, qty, sourceCounts(row.sourceCounts, qty));
        if (!item) continue;
        const old = collection.get(item.id);
        if (old) {
          old.sourceCounts = unionSourceCounts(old.sourceCounts, item.sourceCounts);
          old.count = sumSourceCounts(old.sourceCounts);
          old.favorite = old.favorite === true || item.favorite === true;
        } else collection.set(item.id, item);
        continue;
      }
      if (row?.type === 'team-season' && row?.rarity === TEAM_INSERT.id) {
        const tid = integer(row.tid), year = integer(row.era ?? row.season);
        if (tid === null || tid < 0 || year === null || qty === null ||
            qty < 1 || qty > 1000000) continue;
        const id = 'team:' + tid + ':' + year;
        const item = {
          id, type: 'team-season', rarity: TEAM_INSERT.id, series: CARD_SERIES,
          count: qty, favorite: row.favorite === true, tid, era: year,
          name: str(row.name) || str(row.teamName) || 'Unknown team',
          teamName: str(row.teamName) || str(row.name) || 'Unknown team',
          team: str(row.team) || 'DBL',
          teamLogo: photoUrl(row.teamLogo, true),
          franchiseName: str(row.franchiseName) || str(row.teamName) || 'Unknown team',
          won: number(row.won), lost: number(row.lost),
          tied: number(row.tied), playoffRoundsWon: number(row.playoffRoundsWon),
          finish: str(row.finish), finishKind: str(row.finishKind)
        };
        const old = collection.get(id);
        item.sourceCounts = sourceCounts(row.sourceCounts, qty);
        if (old) {
          old.sourceCounts = unionSourceCounts(old.sourceCounts, item.sourceCounts);
          old.count = sumSourceCounts(old.sourceCounts);
          old.favorite = old.favorite === true || item.favorite === true;
        } else collection.set(id, item);
        continue;
      }
      const pid = integer(row?.pid);
      const rarity = OLD_RARITY[row?.rarity] || row?.rarity;
      if (pid === null || pid < 0 || qty === null || qty < 1 || qty > 1000000 ||
          !tierMap[rarity]) continue;
      // Consolidate both prior visual variants and retired rarity names;
      // merging records adds their duplicate quantities, not replacing them.
      const eligible = {pid, rarity, series:CARD_SERIES};
      const autograph = isAutograph({...eligible, autograph:row.autograph});
      const id = autoId(pid + ':' + rarity, {...eligible, autograph});
      const item = {
        id, pid, rarity, autograph, series: CARD_SERIES, count: qty,
        favorite: row.favorite === true,
        name: str(row.name) || 'Unknown player',
        firstName: str(row.firstName), lastName: str(row.lastName),
        jersey: /^\d{1,3}$/.test(String(row.jersey || '')) ? String(row.jersey) : '',
        team: str(row.team) || 'DBL',
        teamName: str(row.teamName) || 'League archive',
        teamLogo: photoUrl(row.teamLogo, true),
        pos: str(row.pos) || '—',
        // v6 (and earlier) stored draft year and current-season OVR.
        // Until an export is loaded, don't mislabel those as peak-year data.
        era: row.peakVerified === true ? integer(row.era) : null,
        peakVerified: row.peakVerified === true,
        rookie: row.peakVerified === true && row.rookie === true,
        draftPick: integer(row.draftPick),
        ovr: row.peakVerified === true ? number(row.ovr) :
          (number(row.peak) ?? number(row.ovr)),
        peak: number(row.peak),
        pot: number(row.pot), gp: number(row.gp), ppg: number(row.ppg),
        ws: number(row.ws), photo: photoUrl(row.photo, true)
      };
      item.sourceCounts = sourceCounts(row.sourceCounts, qty);
      const existing = collection.get(id);
      if (existing) {
        existing.sourceCounts = unionSourceCounts(existing.sourceCounts, item.sourceCounts);
        existing.count = sumSourceCounts(existing.sourceCounts);
        existing.favorite = existing.favorite === true || item.favorite === true;
        if (!existing.photo && item.photo) existing.photo = item.photo;
      } else collection.set(id, item);
    }
    packs = Math.max(0, integer(value?.packs) ?? 0);
    packSources = sourceCounts(value?.packSources, packs);
    packs = sumSourceCounts(packSources);
    pity = validatedPity(value?.pity);
  }
  function snapshot() {
    return {version: STATE_VERSION, packs, packSources: {...packSources},
      pity: {...pity},
      items: [...collection.values()].map(i => ({
        ...i, sourceCounts: {...i.sourceCounts},
        photo: photoUrl(i.photo, true),
        teamLogo: photoUrl(i.teamLogo, true)
      }))};
  }
  function exportCollection() {
    if (!collectionLoaded) throw Error('Your collection is still loading.');
    return {
      format: BACKUP_FORMAT, backupVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(), ...snapshot()
    };
  }

  function validateImportBackup(backup) {
    if (!backup || typeof backup !== 'object' || Array.isArray(backup) ||
        backup.format !== BACKUP_FORMAT || backup.backupVersion !== BACKUP_VERSION ||
        backup.version !== STATE_VERSION) {
      throw Error('This is not a supported DBL Cards collection backup.');
    }
    if (!Array.isArray(backup.items) || backup.items.length > 50000)
      throw Error('The collection backup has an invalid card list.');
    if (!Number.isSafeInteger(backup.packs) || backup.packs < 0 ||
        backup.packs > 100000000)
      throw Error('The collection backup has an invalid pack total.');
    const incomingPacks = sourceCounts(backup.packSources, backup.packs, true);
    // Backups from before the pity system are valid and do not reset the
    // destination's local streak progress.
    const incomingPity = Object.prototype.hasOwnProperty.call(backup, 'pity')
      ? validatedPity(backup.pity, true) : null;
    const cards = new Map();
    for (const row of backup.items) {
      if (!row || typeof row !== 'object' || Array.isArray(row))
        throw Error('The backup contains an invalid card.');
      const qty = row.count;
      if (!Number.isSafeInteger(qty) || qty < 1 || qty > 1000000)
        throw Error('The backup contains an invalid card quantity.');
      const origins = sourceCounts(row.sourceCounts, qty, true);
      let item;
      if (row.type === 'background-test') {
        if (row.autograph === true && !canAutograph(row))
          throw Error('The backup contains an ineligible Background Test autograph.');
        item = normalizeBackgroundTest(row, qty, origins);
        if (!item) throw Error('The backup contains an invalid Background Test card.');
      } else if (row.type === 'topps-player' || row.type === 'topps-uniform') {
        if (row.autograph === true && !canAutograph(row))
          throw Error('The backup contains an ineligible Topps autograph.');
        item = normalizedTopps(row, qty, origins);
        if (!item) throw Error('The backup contains an invalid 1968 Topps card.');
      } else if (row.type === 'team-season') {
        const tid = integer(row.tid), era = integer(row.era);
        if (row.rarity !== TEAM_INSERT.id || tid === null || tid < 0 ||
            era === null || era < 0)
          throw Error('The backup contains an invalid Team Season insert.');
        const id = 'team:' + tid + ':' + era;
        item = {
          id, type: 'team-season', rarity: TEAM_INSERT.id, series: CARD_SERIES,
          count: qty, sourceCounts: origins, favorite: row.favorite === true, tid, era,
          name: str(row.name) || str(row.teamName) || 'Unknown team',
          teamName: str(row.teamName) || str(row.name) || 'Unknown team',
          team: str(row.team) || 'DBL', teamLogo: photoUrl(row.teamLogo, true),
          franchiseName: str(row.franchiseName) || str(row.teamName) || 'Unknown team',
          won: number(row.won), lost: number(row.lost),
          tied: number(row.tied), playoffRoundsWon: number(row.playoffRoundsWon),
          finish: str(row.finish), finishKind: str(row.finishKind)
        };
      } else {
        const pid = integer(row.pid);
        const rarity = OLD_RARITY[row.rarity] || row.rarity;
        if (row.type || pid === null || pid < 0 ||
            !tierMap[rarity] || rarity === TEAM_INSERT.id)
          throw Error('The backup contains an invalid player edition.');
        if (row.autograph === true && !canAutograph({pid,rarity,series:CARD_SERIES}))
          throw Error('The backup contains an ineligible autographed player edition.');
        const autograph = isAutograph({pid, rarity, series:CARD_SERIES, autograph:row.autograph});
        const id = autoId(pid + ':' + rarity, {pid,rarity,series:CARD_SERIES,autograph});
        item = {
          id, pid, rarity, autograph, series: CARD_SERIES, count: qty, sourceCounts: origins,
          favorite: row.favorite === true,
          name: str(row.name) || 'Unknown player',
          firstName: str(row.firstName), lastName: str(row.lastName),
          jersey: /^\d{1,3}$/.test(String(row.jersey || ''))
            ? String(row.jersey) : '',
          team: str(row.team) || 'DBL',
          teamName: str(row.teamName) || 'League archive',
          teamLogo: photoUrl(row.teamLogo, true),
          pos: str(row.pos) || '—',
          era: row.peakVerified === true ? integer(row.era) : null,
          peakVerified: row.peakVerified === true,
          rookie: row.peakVerified === true && row.rookie === true,
          draftPick: integer(row.draftPick),
          ovr: row.peakVerified === true ? number(row.ovr) :
            (number(row.peak) ?? number(row.ovr)),
          peak: number(row.peak), pot: number(row.pot),
          gp: number(row.gp), ppg: number(row.ppg), ws: number(row.ws),
          photo: photoUrl(row.photo, true)
        };
      }
      // Never trust user-edited IDs; build them from actual canonical fields.
      if (cards.has(item.id)) throw Error('The backup contains duplicate card rows.');
      cards.set(item.id, item);
    }
    return {cards, packSources: incomingPacks, pity: incomingPity};
  }

  function planCollectionMerge(backup) {
    if (deletingCards) throw Error('Wait for the selected-card deletion to finish.');
    if (!collectionLoaded) throw Error('Your collection is still restoring.');
    const incoming = validateImportBackup(backup);
    const next = new Map([...collection].map(([id, item]) =>
      [id, {...item, sourceCounts: {...item.sourceCounts}}]));
    let addedCards = 0, addedEditions = 0, refreshed = false;
    for (const [id, imported] of incoming.cards) {
      const current = next.get(id);
      if (!current) {
        next.set(id, {...imported, sourceCounts: {...imported.sourceCounts}});
        addedCards += imported.count;
        addedEditions++;
        continue;
      }
      // Importing a favorite must never erase a locally saved favorite.
      // Old backups (without favorites) remain fully compatible.
      if (imported.favorite === true && current.favorite !== true) {
        current.favorite = true;
        refreshed = true;
      }
      const joined = unionSourceCounts(current.sourceCounts, imported.sourceCounts);
      const mergedCount = sumSourceCounts(joined);
      if (mergedCount > 1000000) throw Error('Merged copies exceed the collection limit.');
      addedCards += mergedCount - current.count;
      current.sourceCounts = joined;
      current.count = mergedCount;
      if (imported.type === 'background-test') {
        if (updateBackgroundTest(current, imported)) refreshed = true;
      } else if (imported.type === 'topps-player' || imported.type === 'topps-uniform') {
        if (updateTopps(current, imported)) refreshed = true;
      } else if (imported.type === 'team-season') {
        if (updateTeamSeason(current, imported)) refreshed = true;
      } else if ((imported.peakVerified && !current.peakVerified) ||
          (imported.peakVerified && (imported.peak ?? -1) > (current.peak ?? -1))) {
        if (updateCardFromPlayer(current, imported)) refreshed = true;
      }
      for (const key of ['photo', 'teamLogo']) {
        if (!current[key] && imported[key]) {
          current[key] = imported[key];
          refreshed = true;
        }
      }
    }
    const nextPackSources = unionSourceCounts(packSources, incoming.packSources);
    const nextPacks = sumSourceCounts(nextPackSources);
    // Use maximum streak, never addition: repeated imports are idempotent
    // and an older backup cannot erase local pity progress.
    const nextPity = {...pity};
    if (incoming.pity)
      for (const name of PITY_NAMES)
        nextPity[name] = Math.max(pity[name], incoming.pity[name]);
    const pityChanged = PITY_NAMES.some(name => nextPity[name] !== pity[name]);
    if (nextPacks > 100000000) throw Error('Merged pack totals exceed the collection limit.');
    const addedPacks = nextPacks - packs;
    const info = {
      addedCards, addedEditions, addedPacks,
      totalCards: [...next.values()].reduce((n, card) => n + card.count, 0),
      totalEditions: next.size, totalPacks: nextPacks,
      unchanged: addedCards === 0 && addedPacks === 0 && !refreshed &&
        !pityChanged
    };
    return {info, next, nextPacks, nextPackSources, nextPity};
  }

  function previewCollectionMerge(backup) {
    if (mergingCollection) throw Error('A collection merge is already running.');
    return planCollectionMerge(backup).info;
  }

  async function mergeCollection(backup) {
    if (mergingCollection || deletingCards)
      throw Error('A collection update is already running.');
    const plan = planCollectionMerge(backup);
    if (plan.info.unchanged) return {...plan.info, saved: true};
    mergingCollection = true;
    notify();
    // Queue behind any in-flight pack/upgrade saves, and don't update RAM
    // until the merged state is actually written. On failure, nothing is lost.
    const state = {
      version: STATE_VERSION, packs: plan.nextPacks,
      packSources: {...plan.nextPackSources}, pity: {...plan.nextPity},
      items: [...plan.next.values()].map(item => ({
        ...item, sourceCounts: {...item.sourceCounts},
        photo: photoUrl(item.photo, true),
        teamLogo: photoUrl(item.teamLogo, true)
      }))
    };
    const committed = saveQueue.catch(() => {}).then(() => writeState(state));
    saveQueue = committed;
    try {
      const saved = await committed;
      if (!saved) {
        savedOK = false;
        return {...plan.info, saved: false};
      }
      collection = plan.next;
      packSources = plan.nextPackSources;
      packs = plan.nextPacks;
      pity = plan.nextPity;
      savedOK = true;
      return {...plan.info, saved: true};
    } finally {
      mergingCollection = false;
      notify();
    }
  }

  // Update the card's printed season metadata without changing its
  // rarity, ownership quantity, portrait or collectible identity.
  function updateCardFromPlayer(target, player) {
    const fields = ['name', 'firstName', 'lastName', 'jersey', 'team', 'teamName',
      'teamLogo', 'pos', 'era', 'rookie', 'draftPick', 'ovr', 'pot', 'peak', 'peakVerified',
      'gp', 'ppg', 'ws'];
    let modified = false;
    for (const key of fields) {
      if (target[key] !== player[key]) {
        target[key] = player[key];
        modified = true;
      }
    }
    if (!target.photo && (player.publicImage || player.photo)) {
      target.photo = player.publicImage || player.photo;
      modified = true;
    }
    return modified;
  }
  function updateTeamSeason(target, season) {
    let modified = false;
    for (const key of ['name', 'team', 'teamName', 'teamLogo',
      'franchiseName', 'won', 'lost', 'tied', 'playoffRoundsWon',
      'finish', 'finishKind']) {
      // Preserve saved metadata if a newly uploaded league export does
      // not have the corresponding historical value.
      if (season[key] !== null && season[key] !== '' &&
          target[key] !== season[key]) {
        target[key] = season[key];
        modified = true;
      }
    }
    return modified;
  }
  function refreshCollectedCards() {
    if (!collectionLoaded || mergingCollection || deletingCards || !poolFile || !collection.size) return;
    let modified = false;
    for (const item of collection.values()) {
      if (item.type === 'background-test') {
        const live = backgroundTestByPid.get(item.pid);
        if (live && updateBackgroundTest(item, live)) modified = true;
        continue;
      }
      if (item.type === 'topps-player' || item.type === 'topps-uniform') {
        const live = toppsById.get(baseCardId(item));
        if (live && updateTopps(item, live)) modified = true;
        continue;
      }
      if (item.type === 'team-season') {
        const live = teamSeasonById.get(item.id);
        if (live && updateTeamSeason(item, live)) modified = true;
        continue;
      }
      const p = poolByPid.get(item.pid);
      if (!p || !p.peakVerified) continue;
      // Don't overwrite a later, higher peak with an older uploaded export.
      if (item.peakVerified && (number(p.peak) ?? -1) < (number(item.peak) ?? -1))
        continue;
      if (updateCardFromPlayer(item, p)) modified = true;
    }
    if (modified) void save();
  }
  function save(changeType = null) {
    const state = snapshot();
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      savedOK = await writeState(state);
      // A favorite save affects the save indicator, not card art/layout.
      // A normal collection save still updates the rest of the app.
      notify(changeType === 'favorite' ? {type: 'favorite-save'} : null);
    });
    return saveQueue;
  }
  function isFavorite(id) {
    return collection.get(id)?.favorite === true;
  }
  function setFavorite(id, favorite) {
    if (!collectionLoaded || mergingCollection || deletingCards) return false;
    const item = collection.get(id);
    if (!item) return false;
    const desired = favorite === true;
    if (item.favorite === desired) return true;
    item.favorite = desired;
    notify({type: 'favorite', id, favorite: desired});
    // Use the same serialized, persistent save path as collected packs,
    // without rebuilding all visible cards after the save finishes.
    void save('favorite');
    return true;
  }
  const ready = readState().then(state => {
    parseState(state);
    collectionLoaded = true;
    refreshCollectedCards();
    notify();
    // Persist the normalized editions, including a collection restored from
    // a previous release, even if no new pack is opened.
    if (state?.items?.length && state.version !== STATE_VERSION) void save();
  }).catch(error => {
    console.warn('Card collection restore failed.', error);
    collectionLoaded = true;
    savedOK = false;
    notify();
  });
  async function clearCollection() {
    if (!collectionLoaded || mergingCollection || deletingCards) return false;
    // Serialize the reset behind any in-flight pack saves so an older write
    // can never resurrect cards after the user clears them.
    const empty = {version: STATE_VERSION, packs: 0, packSources: {},
      pity: emptyPity(), items: []};
    saveQueue = saveQueue.catch(() => {}).then(() => writeState(empty));
    const cleared = await saveQueue;
    if (!cleared) {
      savedOK = false;
      notify();
      return false;
    }
    collection.clear();
    packs = 0;
    packSources = {};
    pity = emptyPity();
    savedOK = true;
    notify();
    return true;
  }
  // Delete complete selected editions (all their copies) without touching
  // pack history or any other card. Commit to storage first, then memory:
  // a failed write must never make the user's cards disappear.
  async function deleteSelectedCards(ids) {
    if (!collectionLoaded || mergingCollection || deletingCards ||
        !Array.isArray(ids) || ids.length > 50000) return {saved:false, deletedEditions:0, deletedCards:0};
    const unique = new Set(ids.filter(id => typeof id === 'string' && collection.has(id)));
    if (!unique.size) return {saved:true, deletedEditions:0, deletedCards:0};
    const removed = [...unique].map(id => collection.get(id));
    const deletedCards = removed.reduce((n, card) => n + card.count, 0);
    const next = new Map([...collection].filter(([id]) => !unique.has(id)));
    const state = {
      version:STATE_VERSION, packs, packSources:{...packSources},
      pity:{...pity},
      items:[...next.values()].map(item => ({
        ...item, sourceCounts:{...item.sourceCounts},
        photo:photoUrl(item.photo, true),
        teamLogo:photoUrl(item.teamLogo, true)
      }))
    };
    deletingCards = true;
    notify({type:'collection-delete-start'});
    // Always write after previous queued saves to prevent older writes from
    // resurrecting deleted cards. No collection mutation until write success.
    const committed = saveQueue.catch(() => {}).then(() => writeState(state));
    saveQueue = committed;
    try {
      const saved = await committed;
      if (!saved) {
        savedOK = false;
        return {saved:false, deletedEditions:0, deletedCards:0};
      }
      collection = next;
      savedOK = true;
      return {saved:true, deletedEditions:unique.size, deletedCards};
    } finally {
      deletingCards = false;
      notify({type:'collection-delete-end'});
    }
  }
  function sampleTier(streaks) {
    const blackEligible = pool.some(p =>
      p.peak >= MIN_OVR_BY_RARITY['black-label']);
    // Add only a tiny bonus to Black Label. Subtract exactly that from
    // Base, leaving the Chrome/Refractor weights and their odds unchanged.
    const extra = blackEligible
      ? (pityChance('blackLabel', streaks.blackLabel) -
        PITY_RULES.blackLabel.base) * 100 : 0;
    const total = STANDARD_RARITIES.reduce((n, tier) => n + tier.chance, 0);
    let ticket = Math.random() * total;
    let chosen = STANDARD_RARITIES[STANDARD_RARITIES.length - 1];
    for (const tier of STANDARD_RARITIES) {
      const chance = tier.id === 'common' ? tier.chance - extra :
        tier.id === 'black-label' ? tier.chance + extra : tier.chance;
      ticket -= chance;
      if (ticket < 0) {chosen = tier; break;}
    }
    if (blackEligible)
      streaks.blackLabel = chosen.id === 'black-label' ?
        0 : missPity(streaks.blackLabel);
    return chosen;
  }
  // Roll Mythical independently at 0.1% per eligible mixed-pack slot.
  // Each design still gets one third of Mythical pulls; no hard pity.
  function sampleMythical(streaks) {
    if (!pool.some(p => p.peak >= MIN_OVR_BY_RARITY['mythic-aether'])) return null;
    const hit = Math.random() < pityChance('mythical', streaks.mythical);
    streaks.mythical = hit ? 0 : missPity(streaks.mythical);
    if (!hit) return null;
    return MYTHICAL_RARITIES[Math.floor(Math.random() * MYTHICAL_RARITIES.length)];
  }
  function pickMythical(tier, taken) {
    const qualified = pool.filter(p => p.peak >= MIN_OVR_BY_RARITY[tier.id]);
    if (!qualified.length) return null;
    const unused = qualified.filter(p => !taken.has(p.pid));
    const available = unused.length ? unused : qualified;
    const range = Math.max(1, Math.ceil(available.length * tier.pool));
    // Maintain the established bias for elite players but let all qualify.
    const drawFrom = Math.random() < .95 ? range : available.length;
    return available[Math.floor(Math.random() * drawFrom)];
  }
  // Pick a player whose PEAK OVR qualifies for the drawn edition.
  // If none are available, move DOWN through the tiers, never upward.
  // Reuse a player only as a last resort for tiny league files.
  function pickForRarity(requestedTier, taken, allowDuplicates = false) {
    for (let level = tierIndex[requestedTier.id]; level >= 0; level--) {
      const tier = RARITIES[level];
      const threshold = MIN_OVR_BY_RARITY[tier.id];
      const available = pool.filter(p => p.peak >= threshold &&
        (allowDuplicates || !taken.has(p.pid)));
      if (!available.length) continue;
      // Retain the previous stronger-player bias within each eligible tier.
      const range = Math.max(1, Math.ceil(available.length * tier.pool));
      // Preserve the strong-player bias while letting every eligible edition
      // have a real chance to appear, as shown in the Checklist.
      const drawFrom = Math.random() < .95 ? range : available.length;
      const player = available[Math.floor(Math.random() * drawFrom)];
      return {tier, player};
    }
    return null;
  }
  function chooseTeamInsert(takenTeamIds) {
    if (!teamSeasonPool.length) return null;
    const unused = teamSeasonPool.filter(card => !takenTeamIds.has(card.id));
    const draw = unused.length ? unused : teamSeasonPool;
    return draw[Math.floor(Math.random() * draw.length)];
  }
  function chooseToppsInsert(takenIds) {
    const wantUniform = Math.random() < TOPPS_UNIFORM_SHARE;
    const preferred = wantUniform ? toppsUniformPool : toppsPlayerPool;
    const fallback = wantUniform ? toppsPlayerPool : toppsUniformPool;
    const source = preferred.length ? preferred : fallback;
    if (!source.length) return null;
    const unused = source.filter(c => !takenIds.has(c.id));
    const draw = unused.length ? unused : source;
    return draw[Math.floor(Math.random() * draw.length)];
  }
  function getPack(packType = 'mixed') {
    if (!collectionLoaded || mergingCollection || deletingCards ||
        (packType === 'mixed' && !pool.length)) return [];
    if (packType !== 'mixed' && packType !== 'topps-1968' &&
        packType !== 'background-test') return [];
    const taken = new Set(), takenTeamIds = new Set(), takenToppsIds = new Set(), picks = [];
    const startingPity = {...pity};
    const nextPity = {...pity};
    const finish = () => {
      pendingPity.set(picks, {startingPity, nextPity});
      return picks;
    };
    if (packType === 'background-test') {
      if (!backgroundTestPool.length) return [];
      // Only one identical plain edition per qualifying current player.
      // Avoid duplicates inside a pack when 5+ eligible players exist.
      const available = [...backgroundTestPool];
      for (let i = 0; i < 5; i++) {
        const source = available.length ? available : backgroundTestPool;
        const index = Math.floor(Math.random() * source.length);
        const selected = source[index];
        if (available.length) available.splice(index, 1);
        // Keep the original embedded photo available through the live pool,
        // never copy a base64 image into persistent card storage/backups.
        const {image, imageFallback, ...cardData} = selected;
        picks.push(autographPull({...cardData, count: 1}, nextPity));
      }
      return finish();
    }
    if (packType === 'topps-1968') {
      if (!toppsById.size) return [];
      for (let i = 0; i < 5; i++) {
        // Draw exclusively from the existing 1968 Topps player/uniform
        // catalog. Prefer unique editions within a pack when possible.
        const insert = chooseToppsInsert(takenToppsIds);
        if (!insert) return [];
        takenToppsIds.add(insert.id);
        picks.push(autographPull({...insert, count: 1}, nextPity));
      }
      return finish();
    }
    for (let i = 0; i < 5; i++) {
      const mythicalTier = sampleMythical(nextPity);
      // Both inserts share a single roll: Team Season at 3% and 1968
      // Topps at 15% of non-Mythical slots, with no protected fifth slot.
      if (!mythicalTier) {
        const teamChance = teamSeasonPool.length ? TEAM_INSERT_RATE : 0;
        const toppsChance = toppsById.size ? TOPPS_INSERT_RATE : 0;
        const roll = Math.random();
        if (roll < teamChance) {
          const insert = chooseTeamInsert(takenTeamIds);
          if (insert) {
            takenTeamIds.add(insert.id);
            picks.push({...insert, count: 1});
            continue;
          }
        }
        if (roll >= teamChance && roll < teamChance + toppsChance) {
          const insert = chooseToppsInsert(takenToppsIds);
          if (insert) {
            takenToppsIds.add(insert.id);
            // Mixed-pack Topps PLAYERS get the same autograph roll as
            // Topps-only packs; uniforms remain explicitly ineligible.
            picks.push(autographPull({...insert, count: 1}, nextPity));
            continue;
          }
        }
      }
      const requestedTier = mythicalTier || sampleTier(nextPity);
      const chosen = mythicalTier ?
        {tier: mythicalTier, player: pickMythical(mythicalTier, taken)} :
        (pickForRarity(requestedTier, taken) ||
          pickForRarity(requestedTier, taken, true));
      if (!chosen?.player) return []; // A nonempty eligible pool yields a card.
      const {tier, player: p} = chosen;
      taken.add(p.pid);
      picks.push(autographPull({
        id: p.pid + ':' + tier.id, pid: p.pid,
        rarity: tier.id, series: CARD_SERIES, count: 1,
        name: p.name, firstName: p.firstName, lastName: p.lastName,
        jersey: p.jersey, team: p.team, teamName: p.teamName,
        teamLogo: p.publicTeamLogo,
        pos: p.pos, era: p.era, peakVerified: p.peakVerified, rookie: p.rookie,
        draftPick: p.draftPick,
        ovr: p.ovr, peak: p.peak, pot: p.pot,
        gp: p.gp, ppg: p.ppg, ws: p.ws, photo: p.publicImage
      }, nextPity));
    }
    return finish();
  }
  function collectPack(picks) {
    if (!collectionLoaded || mergingCollection || deletingCards ||
        !Array.isArray(picks) || picks.length !== 5) return false;
    const pending = pendingPity.get(picks);
    // Only a pack produced by getPack can advance pity. A second uncollected
    // draw cannot overwrite progress already committed by another pack.
    if (pending && PITY_NAMES.every(name =>
        pending.startingPity[name] === pity[name]))
      pity = {...pending.nextPity};
    pendingPity.delete(picks);
    for (const card of picks) {
      const owned = collection.get(card.id);
      if (owned) {
        owned.sourceCounts[thisSourceId] = (owned.sourceCounts[thisSourceId] || 0) + 1;
        owned.count = sumSourceCounts(owned.sourceCounts);
        if (card.type === 'background-test') {
          updateBackgroundTest(owned, card);
        } else if (card.type === 'topps-player' || card.type === 'topps-uniform') {
          updateTopps(owned, card);
        } else if (card.type === 'team-season') {
          updateTeamSeason(owned, card);
        } else {
          // An older player's season data is refreshed only when authoritative.
          if (!owned.peakVerified || (number(card.peak) ?? -1) >= (number(owned.peak) ?? -1))
            updateCardFromPlayer(owned, card);
        }
      } else collection.set(card.id, {...card, sourceCounts: {[thisSourceId]: 1}});
    }
    packSources[thisSourceId] = (packSources[thisSourceId] || 0) + 1;
    packs = sumSourceCounts(packSources);
    notify();
    void save();
    return true;
  }
  // Calculate each historical insert's finish only from the team-season
  // results in the export. A team's playoffRoundsWon is -1 when it missed
  // the postseason, 0 after a first-round loss, and increases each round won.
  function assignTeamSeasonFinishes(seasons, latestYear, phase) {
    const byYear = new Map();
    for (const card of seasons) {
      if (!byYear.has(card.era)) byYear.set(card.era, []);
      byYear.get(card.era).push(card);
    }
    for (const [year, group] of byYear) {
      // Current-season records are not final until playoffs have ended
      // (phase >= draft lottery). Earlier seasons are historical.
      const complete = year < latestYear || (year === latestYear &&
        phase !== null && phase >= 3);
      const recorded = group.filter(c =>
        Number.isFinite(c.won) && Number.isFinite(c.lost) &&
        c.won + c.lost + (Number.isFinite(c.tied) ? c.tied : 0) > 0);
      const winRate = c => {
        const tied = Number.isFinite(c.tied) ? c.tied : 0;
        return (c.won + .5 * tied) / (c.won + c.lost + tied);
      };
      const rates = recorded.map(winRate);
      const minRate = rates.length >= 2 ? Math.min(...rates) : null;
      const maxRate = rates.length >= 2 ? Math.max(...rates) : null;
      const near = (a, b) => b !== null && Math.abs(a - b) < 1e-10;
      const worst = recorded.filter(c => near(winRate(c), minRate));
      const best = recorded.filter(c => near(winRate(c), maxRate));

      const playoff = group.filter(c => Number.isInteger(c.playoffRoundsWon) &&
        c.playoffRoundsWon >= 0);
      const mostRounds = playoff.length
        ? Math.max(...playoff.map(c => c.playoffRoundsWon)) : null;
      const leaders = playoff.filter(c => c.playoffRoundsWon === mostRounds);
      const runners = mostRounds !== null && mostRounds > 0
        ? playoff.filter(c => c.playoffRoundsWon === mostRounds - 1) : [];
      // Do not infer a title from a maximum alone. A completed season must
      // have exactly one playoff winner and one runner-up in the penultimate
      // round, with multiple teams recorded in the archive.
      const knownFinalists = complete && group.length >= 2 &&
        mostRounds !== null && mostRounds > 0 &&
        leaders.length === 1 && runners.length === 1;
      const champion = knownFinalists ? leaders[0] : null;
      const runner = knownFinalists ? runners[0] : null;

      for (const card of group) {
        let label, kind;
        const played = recorded.includes(card);
        if (!complete) {
          label = 'SEASON IN PROGRESS'; kind = 'pending';
        } else if (card === champion) {
          label = 'LEAGUE CHAMPIONS'; kind = 'champion';
        } else if (card === runner) {
          label = 'FINALS RUNNER-UP'; kind = 'finalist';
        } else if (played && worst.includes(card)) {
          label = (worst.length > 1 ? 'TIED FOR LEAGUE WORST' : 'LEAGUE WORST') +
            (card.playoffRoundsWon === -1 ? ' · MISSED PLAYOFFS' : '');
          kind = 'worst';
        } else if (played && best.includes(card)) {
          const honor = best.length > 1 ? 'TIED BEST RECORD' : 'LEAGUE BEST RECORD';
          // A regular-season best record isn't a championship; also show
          // the actual postseason outcome when the archive includes it.
          const result = card.playoffRoundsWon === -1 ? ' · MISSED PLAYOFFS' :
            Number.isInteger(card.playoffRoundsWon) && card.playoffRoundsWon >= 0
              ? ' · ROUND ' + (card.playoffRoundsWon + 1) + ' EXIT' : '';
          label = honor + result;
          kind = 'best';
        } else if (card.playoffRoundsWon === -1) {
          label = 'MISSED PLAYOFFS'; kind = 'missed';
        } else if (Number.isInteger(card.playoffRoundsWon) &&
            card.playoffRoundsWon >= 0) {
          // When finalists cannot be verified, report playoff progress
          // rather than incorrectly claiming a champion was eliminated.
          label = knownFinalists || card.playoffRoundsWon === 0
            ? 'PLAYOFFS · ROUND ' + (card.playoffRoundsWon + 1) + ' EXIT'
            : 'PLAYOFFS · ' + card.playoffRoundsWon + ' ROUNDS WON';
          kind = 'playoffs';
        } else {
          label = 'SEASON FINISH UNAVAILABLE'; kind = 'unknown';
        }
        card.finish = label;
        card.finishKind = kind;
      }
    }
  }

  async function scan(file, version) {
    scanning = true;
    problem = '';
    notify();
    const current = () => fileVersion === version && currentFile === file;
    try {
      const attrs = await reader.readTopLevelValue(file, 'gameAttributes') || {};
      if (!current()) return;
      const season = integer(attrs.season);
      if (season === null) throw Error('League season is unavailable.');
      const teams = new Map();
      const availableLogos = new Map();
      await reader.forEachTopLevelArrayItem(file, 'teams', team => {
        if (!current()) return;
        const tid = integer(team?.tid);
        if (tid === null) return;
        const history = (Array.isArray(team.seasons) ? team.seasons : [])
          .filter(row => (integer(row?.season) ?? Infinity) <= season)
          .sort((a, b) => integer(a.season) - integer(b.season));
        const baseLogo = photoUrl(team.imgURL) || photoUrl(team.imgURLSmall);
        let seenLogo = '';
        for (const row of history) {
          const logo = photoUrl(row.imgURL) || photoUrl(row.imgURLSmall);
          if (logo) seenLogo = logo;
          const abbr = str(row.abbrev);
          if (abbr && (seenLogo || baseLogo)) availableLogos.set(abbr, seenLogo || baseLogo);
        }
        if (str(team.abbrev) && (seenLogo || baseLogo))
          availableLogos.set(str(team.abbrev), seenLogo || baseLogo);
        teams.set(tid, {history, baseLogo, abbrev: str(team.abbrev) || 'DBL',
          region: str(team.region), name: str(team.name)});
      });
      if (!current()) return;
      // Each historical team.seasons row is one collectible team/year pair.
      // Preserve names, abbreviations and records from that specific year.
      const teamSeasons = [];
      const seenTeamSeasons = new Set();
      for (const [tid, team] of teams) {
        for (const row of team.history) {
          const year = integer(row?.season);
          if (year === null || year > season) continue;
          const id = 'team:' + tid + ':' + year;
          if (seenTeamSeasons.has(id)) continue;
          seenTeamSeasons.add(id);
          const historical = teamAt(teams, tid, year);
          const latest = teamAt(teams, tid, season);
          teamSeasons.push({
            id, type: 'team-season', rarity: TEAM_INSERT.id,
            series: CARD_SERIES, tid, era: year, count: 1,
            name: historical?.name || 'Unknown team',
            teamName: historical?.name || 'Unknown team',
            team: historical?.abbrev || 'DBL',
            teamLogo: photoUrl(historical?.logo, true),
            logo: historical?.logo || '',
            franchiseName: latest?.name || historical?.name || 'Unknown team',
            won: number(row.won), lost: number(row.lost),
            tied: number(row.tied), playoffRoundsWon: number(row.playoffRoundsWon)
          });
        }
      }
      assignTeamSeasonFinishes(teamSeasons, season, integer(attrs.phase));
      teamSeasons.sort((a, b) => a.era - b.era ||
        a.teamName.localeCompare(b.teamName) || a.tid - b.tid);
      if (!current()) return;
      const players = [], seen = new Set();
      const toppsPlayers = [], seenTopps = new Set();
      const nextBackgroundPlayers = [], seenBackground = new Set();
      const nextMarketProfiles = new Map();
      const nextPlayerNames = new Map();
      await reader.forEachTopLevelArrayItem(file, 'players', player => {
        if (!current()) return;
        const playerPid = integer(player?.pid);
        if (playerPid !== null && playerPid >= 0 &&
            Number.isSafeInteger(playerPid))
          nextPlayerNames.set(playerPid, nameOf(player));
        const background = backgroundPlayerCard(player, season, teams);
        if (background && !seenBackground.has(background.pid)) {
          seenBackground.add(background.pid);
          nextBackgroundPlayers.push(background);
        }
        const topps = topperPlayer(player, season, teams);
        if (topps && !seenTopps.has(topps.pid)) {
          seenTopps.add(topps.pid);
          toppsPlayers.push(topps);
        }
        const data = playerInfo(player, season, teams);
        if (topps || data) {
          const valueProfile = market?.profile(player, season);
          if (valueProfile) nextMarketProfiles.set(valueProfile.pid, valueProfile);
        }
        if (!data || seen.has(data.pid)) return;
        seen.add(data.pid);
        players.push(data);
      });
      if (!current()) return;
      players.sort((a, b) => b.score - a.score || (b.peak ?? 0) - (a.peak ?? 0) || a.pid - b.pid);
      // One home and one away uniform card per franchise fielding a team in
      // 1968. Until artwork is uploaded these are intentional placeholders.
      const toppsUniforms = [];
      if (season >= TOPPS_YEAR) {
        const tids1968 = new Set(toppsPlayers.map(p => p.tid));
        for (const [tid, team] of teams) {
          if (team.history.some(row => integer(row.season) === TOPPS_YEAR))
            tids1968.add(tid);
        }
        for (const tid of tids1968) {
          const historical = teamAt(teams, tid, TOPPS_YEAR);
          if (!historical) continue;
          const latest = teamAt(teams, tid, season);
          for (const uniform of ['home', 'away']) {
            toppsUniforms.push({
              id: 'topps:1968:uniform:' + tid + ':' + uniform,
              type: 'topps-uniform', rarity: TOPPS_UNIFORM.id,
              series: TOPPS_SERIES, count: 1, tid, era: TOPPS_YEAR, uniform,
              name: historical.name + ' · ' + uniform.toUpperCase(),
              team: historical.abbrev, teamName: historical.name,
              franchiseName: latest?.name || historical.name,
              teamLogo: photoUrl(historical.logo, true), uniformImage: ''
            });
          }
        }
      }
      toppsPlayers.sort((a, b) => a.name.localeCompare(b.name) || a.pid - b.pid);
      toppsUniforms.sort((a, b) => a.teamName.localeCompare(b.teamName) ||
        a.uniform.localeCompare(b.uniform));
      pool = players;
      poolByPid = new Map(players.map(p => [p.pid, p]));
      playerNamesByPid = nextPlayerNames;
      marketProfiles = nextMarketProfiles;
      backgroundTestPool = nextBackgroundPlayers;
      backgroundTestByPid = new Map(nextBackgroundPlayers.map(p => [p.pid, p]));
      teamSeasonPool = teamSeasons;
      teamSeasonById = new Map(teamSeasons.map(team => [team.id, team]));
      toppsPlayerPool = toppsPlayers;
      toppsUniformPool = toppsUniforms;
      toppsById = new Map([...toppsPlayers, ...toppsUniforms].map(card => [card.id, card]));
      teamLogos = availableLogos;
      activeSeason = season;
      poolFile = file;
      refreshCollectedCards();
    } catch (error) {
      if (!current()) return;
      console.warn('Could not load card player pool.', error);
      pool = [];
      playerNamesByPid = new Map();
      backgroundTestPool = [];
      backgroundTestByPid = new Map();
      marketProfiles = new Map();
      teamSeasonPool = [];
      teamSeasonById = new Map();
      toppsPlayerPool = [];
      toppsUniformPool = [];
      toppsById = new Map();
      problem = 'Could not read players from this league file. Try re-uploading it.';
    } finally {
      if (current()) { scanning = false; notify(); }
    }
  }
  function ensurePool() {
    if (!currentFile || scanning || poolFile === currentFile) return;
    void scan(currentFile, fileVersion);
  }
  function received(file) {
    if (file === currentFile) return;
    currentFile = file || null;
    fileVersion++;
    poolFile = null;
    pool = [];
    poolByPid = new Map();
    playerNamesByPid = new Map();
    backgroundTestPool = [];
    backgroundTestByPid = new Map();
    marketProfiles = new Map();
    teamSeasonPool = [];
    teamSeasonById = new Map();
    toppsPlayerPool = [];
    toppsUniformPool = [];
    toppsById = new Map();
    teamLogos = new Map();
    activeSeason = null;
    scanning = false;
    problem = '';
    notify();
  }
  function marketValue(card) {
    if (!market?.value || !card) return 0;
    const year = activeSeason ?? integer(card.era) ?? TOPPS_YEAR;
    const profile = marketProfiles.get(integer(card.pid)) || null;
    const team = card.type === 'topps-uniform'
      ? teamSeasonById.get('team:' + integer(card.tid) + ':' + TOPPS_YEAR)
      : card.type === 'team-season' ? teamSeasonById.get(card.id) : null;
    return market.value(card, year, profile, team);
  }
  const api = Object.freeze({
    currentSeries: CARD_SERIES,
    rarities: [...RARITIES, TEAM_INSERT, TOPPS_PLAYER, TOPPS_UNIFORM, BACKGROUND_TEST].map(r => Object.freeze({
      ...r, minOvr: MIN_OVR_BY_RARITY[r.id]
    })),
    exportCollection, previewCollectionMerge, mergeCollection,
    // A compact, read-only catalog built from the currently uploaded export.
    // Never modify or infer ownership here; saved collections remain separate.
    get checklistPlayers() {
      return pool.map(p => ({
        pid: p.pid, name: p.name, teamName: p.teamName,
        team: p.team, peak: p.peak, era: p.era,
        franchiseTid: p.franchiseTid, franchiseName: p.franchiseName,
        rookie: p.rookie, draftPick: p.draftPick
      }));
    },
    // All eligible 1968 Topps player and uniform editions, independently
    // collected from Series 0 and unaffected by Series 0 OVR floors.
    get checklistTopps() {
      return [...toppsPlayerPool, ...toppsUniformPool].map(c => ({
        id: c.id, pid: c.pid, tid: c.tid,
        type: c.type, rarity: c.rarity, era: TOPPS_YEAR,
        name: c.name, team: c.team, teamName: c.teamName,
        franchiseTid: c.tid, franchiseName: c.franchiseName,
        peak: c.ovr ?? null, rookie: c.rookie === true,
        draftPick: c.draftPick, uniform: c.uniform
      }));
    },
    // Read-only historical team season catalog for Checklist completion.
    get checklistTeamSeasons() {
      return teamSeasonPool.map(card => ({
        id: card.id, tid: card.tid, era: card.era, name: card.name,
        teamName: card.teamName, team: card.team,
        franchiseName: card.franchiseName, rarity: TEAM_INSERT.id,
        finish: card.finish, finishKind: card.finishKind,
        won: card.won, lost: card.lost, tied: card.tied,
        playoffRoundsWon: card.playoffRoundsWon
      }));
    },
    ready, subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    ensurePool, getPack, collectPack, clearCollection, deleteSelectedCards, isFavorite, setFavorite,
    marketValue,
    findPlayerName(pid) {
      const id = integer(pid);
      if (id === null || id < 0 || !Number.isSafeInteger(id)) return '';
      const fromLeague = playerNamesByPid.get(id);
      if (fromLeague) return fromLeague === 'Unknown player' ? '' : fromLeague;
      // Old collections still have useful display names when their league
      // source isn't currently loaded. Do not confuse team inserts with PIDs.
      const fromCollection = [...collection.values()].find(card =>
        integer(card.pid) === id && card.type !== 'team-season' &&
        card.type !== 'topps-uniform' && str(card.name));
      const name = str(fromCollection?.name);
      return name && name !== 'Unknown player' ? name : '';
    },
    isRookie(card) {
      if (card?.rookie === true) return true;
      // Older saved cards lack a rookie flag. Use the current export if it
      // happens to be the rookie's original season (no retroactive guessing).
      return poolByPid.get(card?.pid)?.rookie === true &&
        card?.era === poolByPid.get(card?.pid)?.era;
    },
    findBackgroundPhotoFallback(card) {
      if (card?.type !== 'background-test') return '';
      return backgroundTestByPid.get(card.pid)?.imageFallback || '';
    },
    findPhoto(card) {
      if (card?.type === 'background-test')
        return backgroundTestByPid.get(card.pid)?.image || card.photo || '';
      if (card?.type === 'topps-player') return toppsById.get(baseCardId(card))?.image || card.photo || '';
      return poolByPid.get(card.pid)?.image || card.photo || '';
    },
    findJersey(card) { return card?.jersey || poolByPid.get(card?.pid)?.jersey || ''; },
    findNameParts(card) {
      const live = poolByPid.get(card?.pid);
      return {
        firstName: card?.firstName || live?.firstName || '',
        lastName: card?.lastName || live?.lastName || ''
      };
    },
    findTeamLogo(card) {
      if (card?.type === 'team-season') {
        return teamSeasonById.get(card.id)?.logo || card.teamLogo || '';
      }
      if (card?.type === 'topps-player' || card?.type === 'topps-uniform') {
        return toppsById.get(baseCardId(card))?.logo || card.teamLogo || '';
      }
      const player = poolByPid.get(card.pid);
      return card.teamLogo || teamLogos.get(card.team) ||
        (player?.team === card.team ? player.teamLogo : '') || '';
    },
    get status() {
      return {
        hasFile: !!currentFile, loading: scanning,
        ready: collectionLoaded, poolSize: pool.length,
        toppsPoolSize: toppsById.size, backgroundTestPoolSize: backgroundTestPool.length,
        season: activeSeason,
        problem, savedOK, packs, merging: mergingCollection,
        deletingCards,
        unique: collection.size,
        count: [...collection.values()].reduce((n, card) => n + card.count, 0)
      };
    },
    get items() { return [...collection.values()]; }
  });
  window.DBLCardEngine = api;
  hub.subscribe(({file}) => received(file));
  received(hub.getCurrentFile?.() || null);
})();