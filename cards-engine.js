(() => {
  'use strict';
  if (window.DBLCardEngine) return;
  const hub = window.DBLLeagueFileHub;
  const reader = window.DBLLeagueStream;
  if (!hub?.subscribe || !reader?.forEachTopLevelArrayItem || !reader?.readTopLevelValue) return;

  // Three Mythical designs share a combined 0.1% chance PER CARD SLOT.
  // Preserve existing standard-tier weights and Refractor+ guarantee.
  const MYTHICAL_RATE = .001;
  // One independent Team Season insert roll per eligible pack slot.
  // It cannot replace a slot still required for the Refractor+ guarantee.
  const TEAM_INSERT_RATE = .03;
  const TEAM_INSERT = Object.freeze({
    id: 'team-season', label: 'Team Season', insert: true
  });
  const RARITIES = [
    { id: 'common', label: 'Base', chance: 85, pool: 1 },
    { id: 'crome', label: 'Chrome', chance: 10, pool: .72 },
    { id: 'refractor', label: 'Refractor', chance: 4, pool: .42 },
    { id: 'black-label', label: 'Black Label', chance: 1, pool: .075 },
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
  const tierIndex = Object.fromEntries(RARITIES.map((r, i) => [r.id, i]));
  const tierMap = Object.fromEntries([...RARITIES, TEAM_INSERT].map(r => [r.id, r]));
  const number = x => x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null;
  const integer = x => Number.isInteger(number(x)) ? number(x) : null;
  const str = x => typeof x === 'string' ? x.trim() : '';
  const nameOf = p => [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim() || str(p?.name) || 'Unknown player';
  const listeners = new Set();
  let currentFile = null, fileVersion = 0, scanning = false, poolFile = null;
  let pool = [], poolByPid = new Map(), teamLogos = new Map(), activeSeason = null;
  let teamSeasonPool = [], teamSeasonById = new Map();
  let collection = new Map(), packs = 0, collectionLoaded = false;
  let savedOK = true, saveQueue = Promise.resolve();
  let problem = '';

  const notify = () => {
    for (const callback of [...listeners]) {
      try { callback(); } catch (error) { console.warn('DBL cards listener error', error); }
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
      if (row?.type === 'team-season' && row?.rarity === TEAM_INSERT.id) {
        const tid = integer(row.tid), year = integer(row.era ?? row.season);
        if (tid === null || tid < 0 || year === null || qty === null ||
            qty < 1 || qty > 1000000) continue;
        const id = 'team:' + tid + ':' + year;
        const item = {
          id, type: 'team-season', rarity: TEAM_INSERT.id, series: CARD_SERIES,
          count: qty, tid, era: year,
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
        if (old) old.count += qty;
        else collection.set(id, item);
        continue;
      }
      const pid = integer(row?.pid);
      const rarity = OLD_RARITY[row?.rarity] || row?.rarity;
      if (pid === null || pid < 0 || qty === null || qty < 1 || qty > 1000000 ||
          !tierMap[rarity]) continue;
      // Consolidate both prior visual variants and retired rarity names;
      // merging records adds their duplicate quantities, not replacing them.
      const id = pid + ':' + rarity;
      const item = {
        id, pid, rarity, series: CARD_SERIES, count: qty,
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
        ovr: row.peakVerified === true ? number(row.ovr) :
          (number(row.peak) ?? number(row.ovr)),
        peak: number(row.peak),
        pot: number(row.pot), gp: number(row.gp), ppg: number(row.ppg),
        ws: number(row.ws), photo: photoUrl(row.photo, true)
      };
      const existing = collection.get(id);
      if (existing) {
        existing.count += qty;
        if (!existing.photo && item.photo) existing.photo = item.photo;
      } else collection.set(id, item);
    }
    packs = Math.max(0, integer(value?.packs) ?? 0);
  }
  function snapshot() {
    return {version: 7, packs, items: [...collection.values()].map(i => ({
      ...i, photo: photoUrl(i.photo, true),
      teamLogo: photoUrl(i.teamLogo, true)
    }))};
  }
  // Update the card's printed season metadata without changing its
  // rarity, ownership quantity, portrait or collectible identity.
  function updateCardFromPlayer(target, player) {
    const fields = ['name', 'firstName', 'lastName', 'jersey', 'team', 'teamName',
      'teamLogo', 'pos', 'era', 'rookie', 'ovr', 'pot', 'peak', 'peakVerified',
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
    if (!collectionLoaded || !poolFile || !collection.size) return;
    let modified = false;
    for (const item of collection.values()) {
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
  function save() {
    const state = snapshot();
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      savedOK = await writeState(state);
      notify();
    });
    return saveQueue;
  }
  const ready = readState().then(state => {
    parseState(state);
    collectionLoaded = true;
    refreshCollectedCards();
    notify();
    // Persist the normalized editions, including a collection restored from
    // a previous release, even if no new pack is opened.
    if (state?.items?.length && state.version !== 7) void save();
  }).catch(error => {
    console.warn('Card collection restore failed.', error);
    collectionLoaded = true;
    savedOK = false;
    notify();
  });
  async function clearCollection() {
    if (!collectionLoaded) return false;
    // Serialize the reset behind any in-flight pack saves so an older write
    // can never resurrect cards after the user clears them.
    const empty = {version: 7, packs: 0, items: []};
    saveQueue = saveQueue.catch(() => {}).then(() => writeState(empty));
    const cleared = await saveQueue;
    if (!cleared) {
      savedOK = false;
      notify();
      return false;
    }
    collection.clear();
    packs = 0;
    savedOK = true;
    notify();
    return true;
  }
  function sampleTier(guarantee = false) {
    const tiers = guarantee ? STANDARD_RARITIES.slice(2) : STANDARD_RARITIES;
    const total = tiers.reduce((n, tier) => n + tier.chance, 0);
    let ticket = Math.random() * total;
    for (const tier of tiers) {
      ticket -= tier.chance;
      if (ticket < 0) return tier;
    }
    return tiers[tiers.length - 1];
  }
  // Roll Mythical independently so the guaranteed Refractor+ slot never
  // inflates the 0.1% rate. Each design gets one third of Mythical pulls.
  function sampleMythical() {
    if (!pool.some(p => p.peak >= MIN_OVR_BY_RARITY['mythic-aether'])) return null;
    if (Math.random() >= MYTHICAL_RATE) return null;
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
  function pickForRarity(requestedTier, taken, protectedRarePid, allowDuplicates = false) {
    for (let level = tierIndex[requestedTier.id]; level >= 0; level--) {
      const tier = RARITIES[level];
      const threshold = MIN_OVR_BY_RARITY[tier.id];
      const available = pool.filter(p => p.peak >= threshold &&
        (allowDuplicates || !taken.has(p.pid)) &&
        // Protect the last possible Refractor+ player for the guaranteed
        // slot, when no Refractor+ has been drawn earlier in the pack.
        !(level < 2 && protectedRarePid === p.pid));
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
  function getPack() {
    if (!collectionLoaded || !pool.length) return [];
    const taken = new Set(), takenTeamIds = new Set(), picks = [];
    let hasRefractor = false;
    const rareCandidate = pool.find(p =>
      p.peak >= MIN_OVR_BY_RARITY.refractor);
    for (let i = 0; i < 5; i++) {
      const guarantee = i === 4 && !hasRefractor && !!rareCandidate;
      const mythicalTier = sampleMythical();
      // An insert replaces an ordinary slot but never consumes a guaranteed
      // Refractor+ position. Existing special player rolls retain priority.
      if (!mythicalTier && !guarantee && teamSeasonPool.length &&
          Math.random() < TEAM_INSERT_RATE) {
        const insert = chooseTeamInsert(takenTeamIds);
        if (insert) {
          takenTeamIds.add(insert.id);
          picks.push({...insert, count: 1});
          continue;
        }
      }
      const requestedTier = mythicalTier || sampleTier(guarantee);
      const protectedRarePid = hasRefractor ? null : rareCandidate?.pid ?? null;
      const chosen = mythicalTier ?
        {tier: mythicalTier, player: pickMythical(mythicalTier, taken)} :
        (pickForRarity(requestedTier, taken, protectedRarePid) ||
          pickForRarity(requestedTier, taken, protectedRarePid, true));
      if (!chosen?.player) return []; // A nonempty eligible pool yields a card.
      const {tier, player: p} = chosen;
      if (tierIndex[tier.id] >= 2) hasRefractor = true;
      taken.add(p.pid);
      picks.push({
        id: p.pid + ':' + tier.id, pid: p.pid,
        rarity: tier.id, series: CARD_SERIES, count: 1,
        name: p.name, firstName: p.firstName, lastName: p.lastName,
        jersey: p.jersey, team: p.team, teamName: p.teamName,
        teamLogo: p.publicTeamLogo,
        pos: p.pos, era: p.era, peakVerified: p.peakVerified, rookie: p.rookie,
        ovr: p.ovr, peak: p.peak, pot: p.pot,
        gp: p.gp, ppg: p.ppg, ws: p.ws, photo: p.publicImage
      });
    }
    return picks;
  }
  function collectPack(picks) {
    if (!collectionLoaded || !Array.isArray(picks) || picks.length !== 5) return false;
    for (const card of picks) {
      const owned = collection.get(card.id);
      if (owned) {
        owned.count++;
        if (card.type === 'team-season') {
          updateTeamSeason(owned, card);
        } else {
          // An older player's season data is refreshed only when authoritative.
          if (!owned.peakVerified || (number(card.peak) ?? -1) >= (number(owned.peak) ?? -1))
            updateCardFromPlayer(owned, card);
        }
      } else collection.set(card.id, {...card});
    }
    packs++;
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
      await reader.forEachTopLevelArrayItem(file, 'players', player => {
        if (!current()) return;
        const data = playerInfo(player, season, teams);
        if (!data || seen.has(data.pid)) return;
        seen.add(data.pid);
        players.push(data);
      });
      if (!current()) return;
      players.sort((a, b) => b.score - a.score || (b.peak ?? 0) - (a.peak ?? 0) || a.pid - b.pid);
      pool = players;
      poolByPid = new Map(players.map(p => [p.pid, p]));
      teamSeasonPool = teamSeasons;
      teamSeasonById = new Map(teamSeasons.map(team => [team.id, team]));
      teamLogos = availableLogos;
      activeSeason = season;
      poolFile = file;
      refreshCollectedCards();
    } catch (error) {
      if (!current()) return;
      console.warn('Could not load card player pool.', error);
      pool = [];
      teamSeasonPool = [];
      teamSeasonById = new Map();
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
    teamSeasonPool = [];
    teamSeasonById = new Map();
    teamLogos = new Map();
    activeSeason = null;
    scanning = false;
    problem = '';
    notify();
  }
  const api = Object.freeze({
    currentSeries: CARD_SERIES,
    rarities: [...RARITIES, TEAM_INSERT].map(r => Object.freeze({
      ...r, minOvr: MIN_OVR_BY_RARITY[r.id]
    })),
    // A compact, read-only catalog built from the currently uploaded export.
    // Never modify or infer ownership here; saved collections remain separate.
    get checklistPlayers() {
      return pool.map(p => ({
        pid: p.pid, name: p.name, teamName: p.teamName,
        team: p.team, peak: p.peak, era: p.era,
        franchiseTid: p.franchiseTid, franchiseName: p.franchiseName
      }));
    },
    // Read-only historical team season catalog for Checklist completion.
    get checklistTeamSeasons() {
      return teamSeasonPool.map(card => ({
        id: card.id, tid: card.tid, era: card.era, name: card.name,
        teamName: card.teamName, team: card.team,
        franchiseName: card.franchiseName, rarity: TEAM_INSERT.id,
        finish: card.finish
      }));
    },
    ready, subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    ensurePool, getPack, collectPack, clearCollection,
    isRookie(card) {
      if (card?.rookie === true) return true;
      // Older saved cards lack a rookie flag. Use the current export if it
      // happens to be the rookie's original season (no retroactive guessing).
      return poolByPid.get(card?.pid)?.rookie === true &&
        card?.era === poolByPid.get(card?.pid)?.era;
    },
    findPhoto(card) { return poolByPid.get(card.pid)?.image || card.photo || ''; },
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
      const player = poolByPid.get(card.pid);
      return card.teamLogo || teamLogos.get(card.team) ||
        (player?.team === card.team ? player.teamLogo : '') || '';
    },
    get status() {
      return {
        hasFile: !!currentFile, loading: scanning,
        ready: collectionLoaded, poolSize: pool.length, season: activeSeason,
        problem, savedOK, packs,
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