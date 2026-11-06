(() => {
  'use strict';
  if (window.DBLCardEngine) return;
  const hub = window.DBLLeagueFileHub;
  const reader = window.DBLLeagueStream;
  if (!hub?.subscribe || !reader?.forEachTopLevelArrayItem || !reader?.readTopLevelValue) return;

  // One visual design per rarity, ordered from entry-level to most exclusive.
  // Keep the 1% top-tier slot and the Refractor+ guarantee from the old packs.
  const RARITIES = [
    { id: 'common', label: 'Common', chance: 85, pool: 1 },
    { id: 'crome', label: 'Crome', chance: 10, pool: .72 },
    { id: 'refractor', label: 'Refractor', chance: 4, pool: .42 },
    { id: 'black-label', label: 'Black Label', chance: 1, pool: .075 }
  ];
  // Migrate every previously collected card rather than discarding old tiers.
  // Rare + Epic become Refractor; Legendary becomes Black Label.
  // A peak rating of 35 or less does not qualify for any new card pull.
  // Never delete previously owned cards as a side effect of an export scan.
  const MIN_CARD_OVR = 36;
  const OLD_RARITY = Object.freeze({
    common: 'common', uncommon: 'crome', rare: 'refractor',
    epic: 'refractor', legendary: 'black-label'
  });
  const DATABASE = 'dbl-digital-cards-v1';
  const STORE = 'collections';
  const KEY = 'archive';
  const FALLBACK = 'dbl-digital-cards-fallback-v1';
  const tierIndex = Object.fromEntries(RARITIES.map((r, i) => [r.id, i]));
  const tierMap = Object.fromEntries(RARITIES.map(r => [r.id, r]));
  const number = x => x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null;
  const integer = x => Number.isInteger(number(x)) ? number(x) : null;
  const str = x => typeof x === 'string' ? x.trim() : '';
  const nameOf = p => [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim() || str(p?.name) || 'Unknown player';
  const listeners = new Set();
  let currentFile = null, fileVersion = 0, scanning = false, poolFile = null;
  let pool = [], poolByPid = new Map(), teamLogos = new Map(), activeSeason = null;
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
    if (ratings.peak === null || ratings.peak < MIN_CARD_OVR) return null;
    const career = careerData(player);
    const peakYear = ratings.peakSeason;
    const peakTid = teamForPeak(player, peakYear, season);
    const historicTeam = peakTid === null ? null : teamAt(teams, peakTid, peakYear);
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
      const pid = integer(row?.pid), qty = integer(row?.count);
      const rarity = OLD_RARITY[row?.rarity] || row?.rarity;
      if (pid === null || pid < 0 || qty === null || qty < 1 || qty > 1000000 ||
          !tierMap[rarity]) continue;
      // Consolidate both prior visual variants and retired rarity names;
      // merging records adds their duplicate quantities, not replacing them.
      const id = pid + ':' + rarity;
      const item = {
        id, pid, rarity, count: qty,
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
  function refreshCollectedCards() {
    if (!collectionLoaded || !poolFile || !collection.size) return;
    let modified = false;
    for (const item of collection.values()) {
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
    const tiers = guarantee ? RARITIES.slice(2) : RARITIES;
    const total = tiers.reduce((n, tier) => n + tier.chance, 0);
    let ticket = Math.random() * total;
    for (const tier of tiers) {
      ticket -= tier.chance;
      if (ticket < 0) return tier;
    }
    return tiers[tiers.length - 1];
  }
  function getPack() {
    if (!collectionLoaded || !pool.length) return [];
    const taken = new Set(), picks = [];
    let hasRefractor = false;
    for (let i = 0; i < 5; i++) {
      const tier = sampleTier(i === 4 && !hasRefractor);
      if (tierIndex[tier.id] >= 2) hasRefractor = true;
      const range = Math.max(1, Math.ceil(pool.length * tier.pool));
      let index = Math.floor(Math.random() * range);
      for (let step = 0; step < range && taken.has(pool[index].pid); step++) {
        index = (index + 1) % range;
      }
      // A very small elite tier may contain fewer players than the pack.
      // Prefer a unique player outside that tier to a repeated player.
      if (taken.has(pool[index].pid) && taken.size < pool.length) {
        index = Math.floor(Math.random() * pool.length);
        for (let step = 0; step < pool.length && taken.has(pool[index].pid); step++) {
          index = (index + 1) % pool.length;
        }
      }
      const p = pool[index];
      taken.add(p.pid);
      picks.push({
        id: p.pid + ':' + tier.id, pid: p.pid,
        rarity: tier.id, count: 1,
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
        // An older card's draft-year/current-team data is stale. Refresh
        // its season details when the newly drawn card is authoritative.
        if (!owned.peakVerified || (number(card.peak) ?? -1) >= (number(owned.peak) ?? -1))
          updateCardFromPlayer(owned, card);
      } else collection.set(card.id, {...card});
    }
    packs++;
    notify();
    void save();
    return true;
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
      teamLogos = availableLogos;
      activeSeason = season;
      poolFile = file;
      refreshCollectedCards();
    } catch (error) {
      if (!current()) return;
      console.warn('Could not load card player pool.', error);
      pool = [];
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
    teamLogos = new Map();
    activeSeason = null;
    scanning = false;
    problem = '';
    notify();
  }
  const api = Object.freeze({
    rarities: RARITIES.map(r => Object.freeze({...r})),
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