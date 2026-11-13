(() => {
  'use strict';
  if (window.DBLCardMarket) return;

  // Fictional nominal dollars for the current DBL season — NOT prices for
  // old 1968 cards as traded by collectors in the 2020s. Five-card Topps
  // packs sold for a nickel in 1968, so ordinary singles should be worth
  // pennies rather than dollars. No inflation adjustment, appraisals,
  // payments, or trades. Pull odds still determine relative scarcity.
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = v => v === null || v === undefined || v === '' ||
    !Number.isFinite(Number(v)) ? null : Number(v);
  const yr = v => Number.isInteger(num(v)) ? num(v) : null;

  // User-defined fictional player-card price boosts are independent of
  // collection ownership, pack odds, and the league file. Keep this small
  // browser-local settings record separate from existing collection backups.
  const PLAYER_MULTIPLIERS_KEY = 'dbl-card-player-value-multipliers:v1';
  const MAX_PLAYER_MULTIPLIER = 1000;
  const MAX_OVERRIDES = 5000;
  const parsePid = raw => {
    const str = String(raw ?? '').trim();
    if (!/^\d+$/.test(str)) return null;
    const pid = Number(str);
    return Number.isSafeInteger(pid) && pid >= 0 ? pid : null;
  };
  const parseMultiplier = raw => {
    const str = String(raw ?? '').trim();
    if (!/^\d+(?:\.\d{1,3})?$/.test(str)) return null;
    const multiplier = Number(str);
    return Number.isFinite(multiplier) && multiplier >= 1 &&
      multiplier <= MAX_PLAYER_MULTIPLIER ? multiplier : null;
  };
  function readPlayerMultipliers() {
    const parsed = new Map();
    try {
      const raw = window.localStorage?.getItem(PLAYER_MULTIPLIERS_KEY);
      if (!raw) return parsed;
      const saved = JSON.parse(raw);
      if (saved?.version !== 1 || !Array.isArray(saved.items)) return parsed;
      for (const entry of saved.items.slice(0, MAX_OVERRIDES)) {
        const pid = parsePid(entry?.pid);
        const multiplier = parseMultiplier(entry?.multiplier);
        if (pid !== null && multiplier !== null && multiplier > 1)
          parsed.set(pid, multiplier);
      }
    } catch (error) {
      console.warn('Could not restore player card value multipliers.', error);
    }
    return parsed;
  }
  let playerMultipliers = readPlayerMultipliers();
  function playerMultiplier(pid) {
    const key = parsePid(pid);
    return key === null ? 1 : playerMultipliers.get(key) || 1;
  }
  function listPlayerMultipliers() {
    return [...playerMultipliers].sort(([a],[b]) => a - b)
      .map(([pid, multiplier]) => Object.freeze({pid, multiplier}));
  }
  function savePlayerMultipliers(next) {
    const items = [...next].map(([pid, multiplier]) => ({pid, multiplier}));
    try {
      window.localStorage.setItem(PLAYER_MULTIPLIERS_KEY,
        JSON.stringify({version:1, items}));
    } catch (error) {
      console.warn('Could not save player card value multipliers.', error);
      return false;
    }
    playerMultipliers = next;
    if (typeof window.dispatchEvent === 'function' &&
        typeof window.Event === 'function')
      window.dispatchEvent(new window.Event('dbl:card-values-changed'));
    return true;
  }
  function setPlayerMultiplier(rawPid, rawMultiplier) {
    const pid = parsePid(rawPid);
    const multiplier = parseMultiplier(rawMultiplier);
    if (pid === null || multiplier === null)
      return {ok:false, error:'Enter a nonnegative integer PID and a multiplier from 1 to 1000 (up to 3 decimal places).'};
    const next = new Map(playerMultipliers);
    if (multiplier === 1) next.delete(pid);
    else next.set(pid, multiplier);
    if (next.size > MAX_OVERRIDES)
      return {ok:false, error:'The player multiplier list is full.'};
    if (!savePlayerMultipliers(next))
      return {ok:false, error:'Could not save the multiplier in this browser. No changes were applied.'};
    return {ok:true, pid, multiplier, removed:multiplier === 1};
  }
  function removePlayerMultiplier(rawPid) {
    const pid = parsePid(rawPid);
    if (pid === null) return {ok:false, error:'Invalid PID.'};
    if (!playerMultipliers.has(pid)) return {ok:true, pid, removed:false};
    const next = new Map(playerMultipliers);
    next.delete(pid);
    if (!savePlayerMultipliers(next))
      return {ok:false, error:'Could not save the removal. The original multiplier was kept.'};
    return {ok:true, pid, removed:true};
  }
  window.addEventListener?.('storage', event => {
    if (event.key !== PLAYER_MULTIPLIERS_KEY) return;
    playerMultipliers = readPlayerMultipliers();
    if (typeof window.dispatchEvent === 'function' &&
        typeof window.Event === 'function')
      window.dispatchEvent(new window.Event('dbl:card-values-changed'));
  });
  function boostedPrice(card, base) {
    // Neither historical team inserts nor uniform issues represent a PID.
    // Experimental Background Test cards have no base market price; those
    // remain unpriced rather than gaining an invented valuation.
    if (!card || card.type === 'team-season' || card.type === 'topps-uniform' ||
        !(base > 0) || !Number.isFinite(base)) return base;
    const factor = playerMultiplier(card.pid);
    return factor === 1 ? base : Math.round((base * factor + Number.EPSILON) * 100) / 100;
  }
  const MULT = Object.freeze({
    common: 1,
    // Scarcity is deliberately sublinear: a 0.03% pull is substantially
    // dearer than Base, but not priced like a modern graded auction trophy.
    crome: Math.pow(87.5 / 10, .55),
    refractor: Math.pow(87.5 / 2, .55),
    'black-label': Math.pow(87.5 / .5, .55),
    'mythic-aether': Math.pow(87.5 / (.1 / 3), .53),
    'mythic-eclipse': Math.pow(87.5 / (.1 / 3), .53),
    'mythic-aurora': Math.pow(87.5 / (.1 / 3), .53),
    'team-season': Math.pow(87.5 / 3, .52),
    // Topps player editions are readily available in Topps-only packs.
    // Uniforms account for roughly one in five Topps slots.
    'topps-1968': 1.2,
    'topps-1968-uniform': 1.2 * Math.pow(1 / .20, .52)
  });

  function profile(player, throughYear) {
    const pid = yr(player?.pid);
    if (pid === null || pid < 0) return null;
    const ratings = (Array.isArray(player.ratings) ? player.ratings : [])
      .filter(r => (yr(r?.season) ?? Infinity) <= throughYear &&
        num(r?.ovr) !== null)
      .sort((a, b) => yr(a.season) - yr(b.season));
    const firstOvr = num(ratings[0]?.ovr);
    const peakOvr = ratings.reduce((max, r) => Math.max(max, num(r.ovr) ?? 0), 0);
    const byYear = new Map();
    for (const s of Array.isArray(player.stats) ? player.stats : []) {
      const year = yr(s?.season);
      if (year === null || year > throughYear || s?.playoffs ||
          (num(s.gp) ?? 0) <= 0) continue;
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year).push(s);
    }
    let gp = 0, pts = 0, ws = 0, recentPoints = 0, recentGames = 0;
    for (const [year, rows] of byYear) {
      // A ZenGM "TOT" line may repeat all team stats in a traded season.
      const teamRows = rows.filter(r => (yr(r.tid) ?? -1) >= 0);
      for (const s of teamRows.length ? teamRows : rows) {
        const games = Math.max(0, num(s.gp) ?? 0);
        const points = Math.max(0, num(s.pts) ?? 0);
        gp += games;
        pts += points;
        ws += num(s.ws) ?? ((num(s.ows) ?? 0) + (num(s.dws) ?? 0));
        if (year >= throughYear - 1) { recentPoints += points; recentGames += games; }
      }
    }
    const honors = {mvp: 0, allstar: 0, allleague: 0, champion: 0, roy: 0};
    for (const award of Array.isArray(player.awards) ? player.awards : []) {
      const year = yr(award?.season ?? award?.year);
      if (year === null || year > throughYear) continue;
      const name = String(award.type || '').toLowerCase();
      if (/(?:finals\s*mvp|most valuable|\bmvp\b)/.test(name)) honors.mvp++;
      else if (/all.star/.test(name)) honors.allstar++;
      else if (/(?:all.league|all.nba|all.dbl)/.test(name)) honors.allleague++;
      else if (/(?:champion|title winner)/.test(name)) honors.champion++;
      else if (/(?:rookie of the year|rookie of year|\broy\b)/.test(name)) honors.roy++;
    }
    return {pid, firstOvr, peakOvr, gp, ppg: gp ? pts / gp : 0,
      ws, recentPpg: recentGames ? recentPoints / recentGames : 0, ...honors};
  }

  // asOfYear is the loaded league-file season, not the real-world calendar.
  // Stats, ratings and awards passed in profile() stop at this season.
  function value(card, asOfYear, player, seasonTeam) {
    const multiple = MULT[card?.rarity];
    if (!multiple) return 0;
    const issueYear = yr(card.era) ?? (card.series === 1 ? 1968 : asOfYear);
    const elapsed = Math.max(0, (yr(asOfYear) ?? issueYear) - issueYear);
    // Gentle period-era aging, never modern collectible speculation.
    const vintage = 1 + Math.min(.35, Math.log1p(elapsed) * .08);
    if (card.type === 'team-season' || card.type === 'topps-uniform') {
      const team = seasonTeam || card;
      const won = num(team.won), lost = num(team.lost);
      const gp = won !== null && lost !== null ? won + lost +
        Math.max(0, num(team.tied) ?? 0) : 0;
      const strength = clamp(.8 + ((gp ? won / gp : .5) - .35) * 1.75, .65, 2);
      const playoff = 1 + .12 * clamp(num(team.playoffRoundsWon) ?? 0, 0, 6);
      const title = team.finishKind === 'champion' ? 2.5 :
        team.finishKind === 'finalist' ? 1.55 : 1;
      // Series 0 Team Season inserts use a deliberately restrained period
      // price: ~57% lower than the previous .07 starter. Champions and
      // stronger teams still earn their existing relative premiums.
      // Keep the separate 1968 Topps Uniform starter unchanged.
      const starter = card.type === 'topps-uniform' ? .05 : .03;
      return Math.round(clamp(starter * multiple * strength * playoff *
        title * vintage, .01, 250) * 100) / 100;
    }
    // Without a league file, older saved card stats provide a useful fallback.
    const peak = player?.peakOvr || num(card.peak) || num(card.ovr) || 45;
    const ppg = player?.ppg ?? num(card.ppg) ?? 0;
    const ws = player?.ws ?? num(card.ws) ?? 0;
    const gp = player?.gp ?? num(card.gp) ?? 0;
    const star =
      .75 +
      .95 * Math.pow(clamp((peak - 48) / 24, 0, 2.5), 1.65) +
      .60 * clamp(ppg / 20, 0, 2) +
      .60 * clamp(ws / 55, 0, 3) +
      .28 * clamp(gp / 500, 0, 2) +
      (player?.mvp || 0) * .9 +
      (player?.allstar || 0) * .18 +
      (player?.allleague || 0) * .28 +
      (player?.champion || 0) * .38 +
      (player?.roy || 0) * .30 +
      .12 * clamp((player?.recentPpg || 0) / 20, 0, 1.5);
    let rookiePremium = 1;
    if (card.rookie === true) {
      // Every rookie has an initial 25% premium. Later, proven careers
      // compound that premium; ordinary careers don't get a free windfall.
      const breakout = player ? Math.max(0, player.peakOvr -
        (player.firstOvr ?? player.peakOvr)) / 25 : 0;
      const legacy = player ? (Math.max(0, player.ws) / 55 +
        player.mvp * .65 + player.allstar * .12 + player.allleague * .15) : 0;
      rookiePremium = 1.25 + Math.min(2.4, breakout * .75 + legacy * .45) *
        Math.min(1, elapsed / 3);
    }
    const draftPick = num(card.draftPick);
    const draftHype = card.rookie === true && elapsed === 0 &&
      draftPick !== null && draftPick >= 1 && draftPick <= 5
      ? 1 + (6 - draftPick) * .055 : 1;
    // Start a regular card near a few cents (a nickel bought a whole pack
    // in 1968). Better careers and scarce finishes still earn premiums.
    const base = Math.round(clamp(.04 * star * multiple * vintage *
      rookiePremium * draftHype, .01, 250) * 100) / 100;
    return boostedPrice(card, base);
  }

  window.DBLCardMarket = Object.freeze({
    profile, value, multipliers: MULT, playerMultiplier,
    listPlayerMultipliers, setPlayerMultiplier, removePlayerMultiplier
  });
})();