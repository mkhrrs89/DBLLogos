(() => {
  'use strict';
  if (window.DBLCardEngine) return;
  const hub = window.DBLLeagueFileHub;
  const reader = window.DBLLeagueStream;
  if (!hub?.subscribe || !reader?.forEachTopLevelArrayItem || !reader?.readTopLevelValue) return;

  const RARITIES = [
    { id: 'common', label: 'Common', chance: 54, pool: 1 },
    { id: 'uncommon', label: 'Uncommon', chance: 27, pool: .72 },
    { id: 'rare', label: 'Rare', chance: 13, pool: .42 },
    { id: 'epic', label: 'Epic', chance: 5, pool: .2 },
    { id: 'legendary', label: 'Legendary', chance: 1, pool: .075 }
  ];
  const VARIANTS = [
    { id: 'heritage', label: 'Heritage' },
    { id: 'velocity', label: 'Velocity' },
    { id: 'prism', label: 'Prism' }
  ];
  const DATABASE = 'dbl-digital-cards-v1';
  const STORE = 'collections';
  const KEY = 'archive';
  const FALLBACK = 'dbl-digital-cards-fallback-v1';
  const tierIndex = Object.fromEntries(RARITIES.map((r, i) => [r.id, i]));
  const tierMap = Object.fromEntries(RARITIES.map(r => [r.id, r]));
  const variantMap = Object.fromEntries(VARIANTS.map(v => [v.id, v]));
  const number = x => x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null;
  const integer = x => Number.isInteger(number(x)) ? number(x) : null;
  const str = x => typeof x === 'string' ? x.trim() : '';
  const nameOf = p => [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim() || str(p?.name) || 'Unknown player';
  const listeners = new Set();
  let currentFile = null, fileVersion = 0, scanning = false, poolFile = null;
  let pool = [], poolByPid = new Map(), activeSeason = null;
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
    let selected = null, mostRecent = -Infinity, peak = null;
    for (const row of Array.isArray(player?.ratings) ? player.ratings : []) {
      const year = integer(row?.season);
      if (year === null || year > season) continue;
      const value = number(row?.ovr);
      if (value !== null && (peak === null || value > peak)) peak = value;
      if (year >= mostRecent) { selected = row; mostRecent = year; }
    }
    return {selected: selected || {}, peak, first: mostRecent === -Infinity ? null : mostRecent};
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
  function playerInfo(player, season, teams) {
    const pid = integer(player?.pid);
    // Future draft prospects are not yet a part of the historical collection.
    if (pid === null || pid < 0 || integer(player.tid) === -2) return null;
    const ratings = ratingData(player, season);
    if (ratings.peak === null && number(ratings.selected.pot) === null) return null;
    const career = careerData(player);
    const rosterTid = integer(player.tid);
    const tid = rosterTid !== null && rosterTid >= 0 ? rosterTid :
      career.lastTid ?? integer(player?.draft?.tid);
    const team = teams.get(tid);
    const draftYear = integer(player?.draft?.year);
    const firstYear = draftYear && draftYear > 0 && draftYear <= season
      ? draftYear : ratings.first ?? season;
    const ovr = number(ratings.selected.ovr), pot = number(ratings.selected.pot);
    const image = photoUrl(player?.imgURL);
    return {
      pid, name: nameOf(player),
      team: team?.abbrev || 'DBL', teamName: team?.name || 'League archive',
      pos: str(ratings.selected.pos) || str(player.pos) || '—',
      era: firstYear, ovr, pot, peak: ratings.peak,
      gp: career.gp, ppg: career.ppg, ws: career.ws,
      image, publicImage: photoUrl(player?.imgURL, true),
      score: (ratings.peak ?? 0) * .86 + (pot ?? ratings.peak ?? 0) * .14
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
      if (pid === null || pid < 0 || qty === null || qty < 1 || qty > 1000000 ||
          !tierMap[row.rarity] || !variantMap[row.variant]) continue;
      const id = pid + ':' + row.rarity + ':' + row.variant;
      const item = {
        id, pid, rarity: row.rarity, variant: row.variant, count: qty,
        name: str(row.name) || 'Unknown player', team: str(row.team) || 'DBL',
        teamName: str(row.teamName) || 'League archive', pos: str(row.pos) || '—',
        era: integer(row.era), ovr: number(row.ovr), peak: number(row.peak),
        pot: number(row.pot), gp: number(row.gp), ppg: number(row.ppg),
        ws: number(row.ws), photo: photoUrl(row.photo, true)
      };
      const existing = collection.get(id);
      if (existing) existing.count += qty;
      else collection.set(id, item);
    }
    packs = Math.max(0, integer(value?.packs) ?? 0);
  }
  function snapshot() {
    return {version: 1, packs, items: [...collection.values()].map(i => ({
      ...i, photo: photoUrl(i.photo, true)
    }))};
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
    notify();
  }).catch(error => {
    console.warn('Card collection restore failed.', error);
    collectionLoaded = true;
    savedOK = false;
    notify();
  });
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
    let hasRare = false;
    for (let i = 0; i < 5; i++) {
      const tier = sampleTier(i === 4 && !hasRare);
      if (tierIndex[tier.id] >= 2) hasRare = true;
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
      const style = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
      picks.push({
        id: p.pid + ':' + tier.id + ':' + style.id, pid: p.pid,
        rarity: tier.id, variant: style.id, count: 1,
        name: p.name, team: p.team, teamName: p.teamName,
        pos: p.pos, era: p.era, ovr: p.ovr, peak: p.peak, pot: p.pot,
        gp: p.gp, ppg: p.ppg, ws: p.ws, photo: p.publicImage
      });
    }
    return picks;
  }
  function collectPack(picks) {
    if (!collectionLoaded || !Array.isArray(picks) || picks.length !== 5) return false;
    for (const card of picks) {
      const owned = collection.get(card.id);
      if (owned) owned.count++;
      else collection.set(card.id, {...card});
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
      await reader.forEachTopLevelArrayItem(file, 'teams', team => {
        if (!current()) return;
        const tid = integer(team?.tid);
        if (tid === null) return;
        const seasons = (Array.isArray(team.seasons) ? team.seasons : [])
          .filter(row => (integer(row?.season) ?? Infinity) <= season);
        const row = seasons.length ? seasons[seasons.length - 1] : null;
        const name = [str(row?.region) || str(team.region),
          str(row?.name) || str(team.name)].filter(Boolean).join(' ');
        teams.set(tid, {abbrev: str(row?.abbrev) || str(team.abbrev) || 'DBL',
          name: name || 'League archive'});
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
      activeSeason = season;
      poolFile = file;
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
    activeSeason = null;
    scanning = false;
    problem = '';
    notify();
  }
  const api = Object.freeze({
    rarities: RARITIES.map(r => Object.freeze({...r})),
    variants: VARIANTS.map(v => Object.freeze({...v})),
    ready, subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    ensurePool, getPack, collectPack,
    findPhoto(card) { return poolByPid.get(card.pid)?.image || card.photo || ''; },
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