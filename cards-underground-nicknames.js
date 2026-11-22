/* 1968 UNDERGROUND — THEY CALL HIM… (curated player nicknames).
   Add one approved entry per player:
     { name: 'Exact Player Name', nickname: 'The Nickname' },
   If the name matches more than one 1968 player:
     { pid: 123, nickname: 'The Nickname' }
   Entries remain empty until explicitly supplied. No invented nicknames.
*/
(() => {
  'use strict';
  if (window.DBLUndergroundNicknames) return;
  const entries = Object.freeze([
    { name: 'Don Moss', nickname: 'The Donfather' },
    // Print-name overrides affect only this nickname insert, never the
    // original 1968 player record or its other card editions.
    { name: 'O-Train Rollins', nickname: 'O-Train',
      printName: 'Otis Rollins' },
    { name: 'Frankie Davenport', nickname: 'The Crooner' },
    { name: 'Rabbit Angstrom', nickname: 'Rabbit',
      printName: 'Harry Angstrom' },
    { name: 'Gideon Crane', nickname: 'The Wrecking Crane' },
    { name: 'O.C. Smith', nickname: 'The Switchboard' },
    { name: 'Howard Barber', nickname: 'The Pickpocket' },
    { name: 'Urias Grobe', nickname: 'The Harlem Hornet' },
    { name: 'Sam McFadden', nickname: 'Buckshot' },
    { name: 'Lenny Loudermilk', nickname: 'The Milkman' },
    { name: 'Bob Pack', nickname: 'The Packhorse' },
    { name: 'Calvin Rookstone', nickname: 'Stonewall' },
    { name: 'Jonathan Royals', nickname: 'The Dealer' },
    { name: 'Zesi ZaDuuk', nickname: 'The Wizard of Louisville' },
    { name: 'Charles Allen', nickname: 'The Buffalo Bull' }
  ]);
  const normalizedName = value => String(value || '').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  function resolve(players) {
    if (!Array.isArray(players) || !players.length || !entries.length) return [];
    const byPid = new Map(), byName = new Map();
    for (const player of players) {
      if (!Number.isSafeInteger(player?.pid) || player.pid < 0) continue;
      byPid.set(player.pid, player);
      const key = normalizedName(player.name);
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(player);
    }
    const result = [], used = new Set();
    for (const row of entries) {
      const nickname = String(row?.nickname || '').trim();
      if (!nickname || nickname.length > 80) continue;
      const matches = Number.isSafeInteger(row.pid) && row.pid >= 0
        ? [byPid.get(row.pid)].filter(Boolean)
        : byName.get(normalizedName(row.name)) || [];
      // Ambiguous or nonexistent names never get assigned to a guessed PID.
      if (matches.length !== 1 || used.has(matches[0].pid)) continue;
      used.add(matches[0].pid);
      const printName = String(row.printName || '').trim();
      result.push({ ...matches[0], nickname,
        printName: printName || matches[0].name });
    }
    return result;
  }
  window.DBLUndergroundNicknames = Object.freeze({ entries, resolve });
})();
