(() => {
  const FIRST_YEAR = 1910;
  const LAST_YEAR = 1979;
  const FIRST_LEAGUE_YEAR = 1916;
  const button = document.getElementById('championGridTabBtn');
  const panel = document.getElementById('championGridPanel');
  const grid = document.getElementById('championGrid');
  const fileInput = document.getElementById('leagueFile');
  const clearButton = document.getElementById('clearLeagueFileBtn');
  const hub = window.DBLLeagueFileHub;
  const stream = window.DBLLeagueStream;
  if (!button || !panel || !grid || !fileInput || !stream) return;

  const cells = new Map();
  let fileVersion = 0;
  let currentFile = null;
  createGrid();

  button.addEventListener('click', () => {
    document.querySelectorAll('.page > .panel[id]').forEach((other) => {
      other.hidden = other !== panel;
    });
    document.querySelectorAll('.tab-btn').forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    panel.hidden = false;
  });

  if (hub) {
    hub.subscribe(({ file }) => {
      void loadFile(file);
    });
  } else {
    fileInput.addEventListener('change', () => {
      void loadFile(fileInput.files?.[0] || null);
    });
  }
  clearButton?.addEventListener('click', () => {
    void loadFile(null);
  });

  function createGrid() {
    const fragment = document.createDocumentFragment();
    for (let year = FIRST_YEAR; year <= LAST_YEAR; year += 1) {
      const cell = document.createElement('div');
      cell.className = 'champion-grid-cell';
      cell.dataset.year = String(year);
      const heading = document.createElement('span');
      heading.className = 'champion-grid-year';
      heading.textContent = String(year);
      cell.appendChild(heading);
      if (year < FIRST_LEAGUE_YEAR) {
        cell.classList.add('is-preleague');
        cell.setAttribute('aria-label', year + ': before the league began');
      } else {
        cell.setAttribute('aria-label', year + ': no champion in the loaded data');
      }
      cells.set(year, cell);
      fragment.appendChild(cell);
    }
    grid.replaceChildren(fragment);
  }

  function showWinners(winners) {
    for (const [year, cell] of cells) {
      if (year < FIRST_LEAGUE_YEAR) continue;
      cell.querySelector('.champion-grid-logo')?.remove();
      const winner = winners.get(year);
      if (!winner) {
        cell.title = '';
        cell.setAttribute('aria-label', year + ': no champion in the loaded data');
        continue;
      }
      cell.title = year + ' champion: ' + winner.name;
      cell.setAttribute('aria-label', year + ': champion ' + winner.name);
      // Missing or failed photos leave the square blank; no historical
      // substitution or secondary logo is ever attempted.
      if (!winner.logoURL) continue;
      const image = document.createElement('img');
      image.className = 'champion-grid-logo';
      image.alt = winner.name + ' primary logo';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => image.remove(), { once: true });
      image.src = winner.logoURL;
      cell.appendChild(image);
    }
  }

  // CHAMPION_RULES_BEGIN
  function readInteger(value) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    return Number.isInteger(number) ? number : null;
  }

  function primaryLogo(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function collectSeasons(team, seasonsByYear) {
    const seasons = Array.isArray(team?.seasons) ? team.seasons : [];
    const latestSeason = Math.max(...seasons.map((season) => readInteger(season?.season) ?? -Infinity));
    const tid = readInteger(team?.tid);
    if (tid === null) return;
    for (const season of seasons) {
      const year = readInteger(season?.season);
      if (year === null || year < FIRST_LEAGUE_YEAR || year > LAST_YEAR) continue;
      const region = String(season?.region || team?.region || '').trim();
      const name = String(season?.name || team?.name || '').trim();
      const teamName = [region, name].filter(Boolean).join(' ') || 'Team ' + tid;
      // Historical seasons must use their own primary logo, not the latest.
      const logoURL = primaryLogo(season?.imgURL)
        || (year === latestSeason ? primaryLogo(team?.imgURL) : '');
      const roundsWon = readInteger(season?.playoffRoundsWon ?? season?.roundsWon);
      const explicitlyChampion = season?.champ === true
        || season?.champion === true
        || String(season?.playoffFinish || '').toLowerCase() === 'champion';
      const contender = { year, tid, name: teamName, logoURL, roundsWon, explicitlyChampion };
      if (!seasonsByYear.has(year)) seasonsByYear.set(year, []);
      seasonsByYear.get(year).push(contender);
    }
  }

  function readFinalsWinner(record) {
    const year = readInteger(record?.season);
    const rounds = record?.series;
    if (year === null || year < FIRST_LEAGUE_YEAR || year > LAST_YEAR || !Array.isArray(rounds)) return null;
    const finals = rounds[rounds.length - 1];
    if (!Array.isArray(finals) || finals.length !== 1) return null;
    const matchup = finals[0];
    const home = matchup?.home, away = matchup?.away;
    const homeWins = readInteger(home?.won), awayWins = readInteger(away?.won);
    if (homeWins === null || awayWins === null || homeWins === awayWins) return null;
    const tid = readInteger(homeWins > awayWins ? home?.tid : away?.tid);
    return tid === null ? null : { year, tid };
  }

  function selectChampion(year, contenders, playoffWinnerTid, currentYear, phase) {
    if (!Array.isArray(contenders) || !contenders.length) return null;
    const explicit = contenders.filter((team) => team.explicitlyChampion);
    if (explicit.length === 1) return explicit[0];
    if (explicit.length > 1) return null;

    // Never crown the current year's leader while playoffs are still underway.
    const seasonFinished = year !== currentYear || (phase !== null && phase >= 4);
    if (!seasonFinished) return null;
    if (playoffWinnerTid !== null && playoffWinnerTid !== undefined) {
      const winners = contenders.filter((team) => team.tid === playoffWinnerTid);
      if (winners.length === 1) return winners[0];
    }

    // BBGM uses playoffRoundsWon=N for the champion after N playoff rounds,
    // and N-1 for the finals runner-up. Require one unique positive maximum.
    const best = Math.max(...contenders.map((team) => team.roundsWon ?? -1));
    if (best <= 0) return null;
    const candidates = contenders.filter((team) => team.roundsWon === best);
    return candidates.length === 1 ? candidates[0] : null;
  }
  // CHAMPION_RULES_END

  async function loadFile(file) {
    const token = ++fileVersion;
    currentFile = file;
    showWinners(new Map());
    if (!file) return;
    try {
      const seasonsByYear = new Map();
      await stream.forEachTopLevelArrayItem(file, 'teams', (team) => {
        if (token === fileVersion) collectSeasons(team, seasonsByYear);
      });
      if (token !== fileVersion || file !== currentFile) return;

      const playoffWinners = new Map();
      await stream.forEachTopLevelArrayItem(file, 'playoffSeries', (item) => {
        if (token !== fileVersion) return;
        const winner = readFinalsWinner(item);
        if (winner) playoffWinners.set(winner.year, winner.tid);
      });
      if (token !== fileVersion || file !== currentFile) return;

      const attributes = await stream.readTopLevelValue(file, 'gameAttributes');
      if (token !== fileVersion || file !== currentFile) return;

      const latestYear = Math.max(...seasonsByYear.keys());
      const currentYear = readInteger(attributes?.season) ?? latestYear;
      const phase = readInteger(attributes?.phase);
      const winners = new Map();
      for (let year = FIRST_LEAGUE_YEAR; year <= LAST_YEAR; year += 1) {
        const champ = selectChampion(year, seasonsByYear.get(year), playoffWinners.get(year), currentYear, phase);
        if (champ) winners.set(year, { name: champ.name, logoURL: champ.logoURL });
      }
      showWinners(winners);
    } catch (error) {
      if (token !== fileVersion) return;
      console.warn('Could not read championship history from the league file.', error);
    }
  }
})();
